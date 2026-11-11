#!/usr/bin/env node
// The one CLI for Quarry for Claude Code. Human tables by default, --json for machines.
//   npm run quarry -- help
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { table } from './lib/format.mjs';
import { parseCsv, pick, yesNo } from './lib/csv.mjs';

// Every read the weighbridge office, the quarry manager and the accounts desk ask for.
export const reads = {
  sites: 'select code,name,country,consent_ref,consent_limit_t,consent_year_starts,manager_name,manager_cert_expires,royalty_payee,royalty_per_t from sites order by code',
  weighbridges: 'select b.code,s.code site,b.name,b.verification_mark,b.last_tested_on,b.test_ref,b.last_tested_on+b.test_every_days next_test from weighbridges b join sites s on s.id=b.site_id order by b.code',
  products: 'select code,name,price_per_t,min_stock_t,active from products order by code',
  customers: 'select code,name,email,phone,account,credit_hold from customers order by code',
  jobs: 'select code,status,customer,name,product,price_per_t,cartage_per_t,quoted_t,delivered_t,remaining_t,pct from v_job_progress order by status desc,code',
  trucks: 'select rego,carrier,tare_t,tare_on,max_gross_t,active from trucks order by rego',
  tickets: 'select ticket_no,day,site,truck,customer,job,product,gross_t,tare_t,net_t,price_per_t,value,cash,paid,invoice_ref from v_tickets order by weighed_at desc limit 200',
  today: 'select ticket_no,to_char(weighed_at at time zone \'UTC\',\'HH24:MI\') at_time,site,truck,customer,job,product,net_t,value,cash,paid from v_tickets where day=current_date order by weighed_at',
  'day-sales': 'select site,product,count(*) loads,sum(net_t) tonnes,sum(value) value from v_tickets where day=$date group by site,product order by site,product',
  'job-progress': "select code,customer,name,product,quoted_t,delivered_t,remaining_t,pct,loads,last_load,credit_hold from v_job_progress where status='open' order by pct desc nulls last,code",
  stock: 'select site,product,last_survey,survey_t,produced_t,sold_t,book_t,min_stock_t,low from v_stock_book order by site,product',
  consent: 'select site,consent_ref,year_start,consent_limit_t,dispatched_t,pct from v_consent order by site',
  royalties: 'select site,payee,period,tonnes,royalty_per_t,amount,due,lodged_on,ref from v_royalties order by period desc,site',
  overloads: 'select ticket_no,day,site,truck,carrier,customer,gross_t,max_gross_t,over_t from v_tickets where over_t>0 order by day desc,ticket_no',
  'tare-due': "select rego,carrier,tare_t,tare_on,current_date-tare_on days_old,case when tare_on is null or tare_on<current_date-90 then 'overdue' else 'due soon' end state from trucks where active and (tare_on is null or tare_on<current_date-76) order by tare_on nulls first",
  uninvoiced: 'select ticket_no,day,customer,job,product,net_t,value,current_date-day days_since from v_tickets where not cash and invoice_ref is null order by day,ticket_no',
  unpaid: 'select ticket_no,day,customer,product,net_t,value from v_tickets where cash and not paid order by day,ticket_no',
  'price-check': "select v.ticket_no,v.day,v.customer,v.job,v.product,v.price_per_t charged,coalesce(j.price_per_t,v.list_per_t) agreed,round((coalesce(j.price_per_t,v.list_per_t)-v.price_per_t)*v.net_t,2) short from v_tickets v left join jobs j on j.id=v.job_id where v.price_per_t<coalesce(j.price_per_t,v.list_per_t) order by short desc",
  'customer-tonnes': 'select customer,count(*) loads,sum(net_t) tonnes,sum(value) value,max(day) last_load from v_tickets where day>=current_date-90 group by customer order by tonnes desc',
  'carrier-loads': 'select coalesce(carrier,\'(none)\') carrier,count(distinct truck) trucks,count(*) loads,sum(net_t) tonnes,round(avg(net_t),2) avg_net_t,round(avg(gross_t/nullif(max_gross_t,0))*100,1) avg_pct_of_limit,sum(case when over_t>0 then 1 else 0 end) overloads from v_tickets where day>=current_date-90 group by carrier order by tonnes desc',
  'product-sales': "select site,product,count(*) loads,sum(net_t) tonnes,sum(value) value,round(sum(value)/nullif(sum(net_t),0),2) avg_per_t from v_tickets where day>=current_date-30 group by site,product order by site,tonnes desc",
  compliance: 'select rule,record,issue from v_compliance order by rule,record',
  attention: 'select kind,record,due,detail from v_attention order by due,kind,record',
};

const named = {
  sites: { by: 'code', names: 'name' }, weighbridges: { by: 'code', names: 'name' }, products: { by: 'code', names: 'name' },
  customers: { by: 'code', names: 'name' }, jobs: { by: 'code', names: 'name' }, trucks: { by: 'rego' }, tickets: { by: 'ticket_no' },
};

// Exact code or id first, then a unique prefix or name match. Ambiguity lists candidates.
export async function resolve(db, entity, value) {
  if (!value || value === true) throw Error(`Supply a ${entity.replace(/s$/, '')} code, name or id prefix`);
  const { by, names } = named[entity];
  const exact = await db.query(`select * from ${entity} where lower(${by})=lower($1) or id::text=$1`, [String(value)]);
  if (exact.length === 1) return exact[0];
  const found = await db.query(`select * from ${entity} where starts_with(lower(${by}),lower($1)) or starts_with(id::text,$1)${names ? ` or position(lower($1) in lower(${names}))>0` : ''} order by ${by}`, [String(value)]);
  if (found.length === 1) return found[0];
  const list = found.map((r) => `${r[by]}${names ? ' ' + r[names] : ''}`).join('; ') || '(none)';
  throw Error(`${found.length ? 'Ambiguous' : 'No matching'} ${entity.replace(/s$/, '')}: ${value}. Candidates: ${list}`);
}

const required = (v, n) => { if (v === undefined || v === null || v === true || String(v).trim() === '') throw Error(`Required: ${n}`); return String(v).trim(); };
const number = (v, n, { positive = false, min } = {}) => {
  const x = Number(required(v, n));
  if (!Number.isFinite(x) || (positive && x <= 0) || (min !== undefined && x < min)) throw Error(`Invalid ${n}: ${v}`);
  return x;
};
const date = (v, n = 'date') => {
  required(v, n);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) !== v) throw Error(`Invalid ${n}: use a real YYYY-MM-DD date`);
  return v;
};
const today = () => new Date().toISOString().slice(0, 10);
const iso = (v) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);
const t2 = (x) => Math.round(Number(x) * 100) / 100;

async function transaction(db, fn, dry = false) {
  await db.exec('begin');
  try { const out = await fn(); await db.exec(dry ? 'rollback' : 'commit'); return out; }
  catch (e) { await db.exec('rollback'); throw e; }
}

const entities = ['sites', 'weighbridges', 'products', 'customers', 'jobs', 'trucks', 'tickets', 'production', 'surveys', 'royalty_returns', 'notes'];

export const help = [
  ...Object.keys(reads).map((r) => (reads[r].includes('$date') ? `${r} [--date=YYYY-MM-DD]` : r)),
  'job <code>', 'ticket <ticket_no>', 'site <code>',
  'weigh <truck> --site=.. --customer=.. --product=.. --gross=t [--job=..] [--tare=t] [--bridge=..] [--cash] [--at=HH:MM]',
  'tare <truck> <tonnes> [--date=YYYY-MM-DD]', 'void <ticket> --reason=..', 'paid <ticket>',
  'invoice <ticket|customer> --ref=..', 'hold <customer> on|off', 'close <job>',
  'produce <site> <product> <tonnes> [--date=YYYY-MM-DD]', 'survey <site> <product> <tonnes> [--date=YYYY-MM-DD] [--by=surveyor]',
  'lodge-royalty <site> <YYYY-MM> --ref=.. [--date=YYYY-MM-DD]', 'test-bridge <bridge> --ref=.. [--date=YYYY-MM-DD]',
  'manager <site> --name=.. --cert=.. --expires=YYYY-MM-DD', 'log <job|site> <note>',
  'add site <code> <name> --country=NZ|AU [--consent=ref] [--limit=t] [--year-starts=7] [--royalty=per_t] [--payee=..]',
  'add bridge <code> <name> --site=.. [--mark=..] [--tested=YYYY-MM-DD]',
  'add product <code> <name> --price=per_t [--min-stock=t]',
  'add customer <code> <name> [--cash] [--email=..] [--phone=..]',
  'add job <code> <name> --customer=.. --product=.. --price=per_t [--cartage=per_t] [--quoted=t] [--address=..]',
  'add truck <rego> --tare=t --max-gross=t [--carrier=..]',
  'import winweigh <folder> [--dry-run] [--map=file.json]', 'export <folder>',
  'draft-statement <customer>', 'draft-royalty <site> <YYYY-MM>',
];

export async function run(db, args) {
  const flags = {}; const pos = [];
  for (const a of args) {
    if (a.startsWith('--')) { const i = a.indexOf('='); flags[a.slice(2, i < 0 ? undefined : i)] = i < 0 ? true : a.slice(i + 1); }
    else pos.push(a);
  }
  const [cmd = 'help', ...a] = pos;
  if (cmd === 'help') return help.map((command) => ({ command }));

  if (reads[cmd]) {
    if (reads[cmd].includes('$date')) return db.query(reads[cmd].replace('$date', '$1'), [flags.date ? date(flags.date) : today()]);
    return db.query(reads[cmd]);
  }

  if (cmd === 'job') {
    const j = await resolve(db, 'jobs', a[0]);
    return {
      job: await db.query('select * from v_job_progress where job_id=$1', [j.id]),
      tickets: await db.query('select ticket_no,day,site,truck,net_t,price_per_t,value,invoice_ref from v_tickets where job_id=$1 order by weighed_at', [j.id]),
      notes: await db.query('select created_at,body from notes where job_id=$1 order by created_at', [j.id]),
    };
  }
  if (cmd === 'ticket') {
    const t = await resolve(db, 'tickets', a[0]);
    return { ticket: await db.query('select t.ticket_no,t.weighed_at,s.code site,k.rego truck,c.name customer,p.code product,t.gross_t,t.tare_t,t.net_t,t.stored_tare,t.price_per_t,t.cartage_per_t,t.cash,t.paid,t.invoice_ref,t.void_reason from tickets t join sites s on s.id=t.site_id join trucks k on k.id=t.truck_id join customers c on c.id=t.customer_id join products p on p.id=t.product_id where t.id=$1', [t.id]) };
  }
  if (cmd === 'site') {
    const s = await resolve(db, 'sites', a[0]);
    return {
      site: await db.query('select code,name,country,consent_ref,manager_name,manager_cert,manager_cert_expires,royalty_payee,royalty_per_t from sites where id=$1', [s.id]),
      consent: await db.query('select year_start,consent_limit_t,dispatched_t,pct from v_consent where site_id=$1', [s.id]),
      stock: await db.query('select product,book_t,min_stock_t,low from v_stock_book where site_id=$1 order by product', [s.id]),
      weighbridges: await db.query('select code,name,last_tested_on,last_tested_on+test_every_days next_test from weighbridges where site_id=$1 order by code', [s.id]),
      notes: await db.query('select created_at,body from notes where site_id=$1 order by created_at', [s.id]),
    };
  }

  if (cmd === 'export') {
    const dir = path.resolve(required(a[0], 'export folder'));
    fs.mkdirSync(dir, { recursive: true });
    return transaction(db, async () => {
      await db.exec('set transaction isolation level repeatable read');
      const counts = [];
      for (const t of entities) {
        const rows = await db.query(`select * from ${t} order by id`);
        fs.writeFileSync(path.join(dir, `${t}.json`), JSON.stringify(rows, null, 2) + '\n');
        counts.push({ entity: t, rows: rows.length });
      }
      fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ version: 1, at: new Date().toISOString(), counts }, null, 2) + '\n');
      return counts;
    });
  }

  if (cmd === 'import') return importWinWeigh(db, a, flags);
  if (cmd === 'add') return transaction(db, () => add(db, a, flags));
  if (cmd === 'weigh') return transaction(db, () => weigh(db, a, flags));

  if (cmd === 'tare') return transaction(db, async () => {
    const k = await resolve(db, 'trucks', a[0]);
    const on = flags.date ? date(flags.date) : today();
    if (on > today()) throw Error('A tare cannot be taken in the future');
    return db.query('update trucks set tare_t=$2,tare_on=$3 where id=$1 returning rego,tare_t,tare_on', [k.id, number(a[1], 'tare tonnes', { positive: true }), on]);
  });

  if (cmd === 'void') return transaction(db, async () => {
    const t = await resolve(db, 'tickets', a[0]);
    if (t.void_reason) throw Error(`Ticket ${t.ticket_no} is already void: ${t.void_reason}`);
    if (t.invoice_ref) throw Error(`Ticket ${t.ticket_no} is on invoice ${t.invoice_ref}: credit the invoice first`);
    return db.query('update tickets set void_reason=$2 where id=$1 returning ticket_no,void_reason', [t.id, required(flags.reason, 'reason (--reason)')]);
  });

  if (cmd === 'paid') return transaction(db, async () => {
    const t = await resolve(db, 'tickets', a[0]);
    if (!t.cash) throw Error(`Ticket ${t.ticket_no} is an account load: record its invoice instead`);
    if (t.paid) throw Error(`Ticket ${t.ticket_no} is already paid`);
    return db.query('update tickets set paid=true where id=$1 returning ticket_no,paid', [t.id]);
  });

  if (cmd === 'invoice') return transaction(db, async () => {
    const ref = required(flags.ref, 'invoice reference (--ref)');
    const one = await db.query('select * from tickets where lower(ticket_no)=lower($1)', [a[0] || '']);
    if (one.length) {
      const t = one[0];
      if (t.void_reason) throw Error(`Ticket ${t.ticket_no} is void`);
      if (t.cash) throw Error(`Ticket ${t.ticket_no} is a cash load`);
      if (t.invoice_ref) throw Error(`Ticket ${t.ticket_no} is already on ${t.invoice_ref}`);
      return db.query('update tickets set invoice_ref=$2 where id=$1 returning ticket_no,invoice_ref', [t.id, ref]);
    }
    const c = await resolve(db, 'customers', a[0]);
    const rows = await db.query('update tickets set invoice_ref=$2 where customer_id=$1 and invoice_ref is null and not cash and void_reason is null returning ticket_no,invoice_ref', [c.id, ref]);
    if (!rows.length) throw Error(`${c.name} has no account loads waiting for an invoice`);
    return rows;
  });

  if (cmd === 'hold') return transaction(db, async () => {
    const c = await resolve(db, 'customers', a[0]);
    if (!['on', 'off'].includes(a[1])) throw Error('Use hold <customer> on|off');
    return db.query('update customers set credit_hold=$2 where id=$1 returning code,name,credit_hold', [c.id, a[1] === 'on']);
  });

  if (cmd === 'close') return transaction(db, async () => {
    const j = await resolve(db, 'jobs', a[0]);
    if (j.status === 'closed') throw Error(`Job ${j.code} is already closed`);
    return db.query("update jobs set status='closed' where id=$1 returning code,status", [j.id]);
  });

  if (cmd === 'produce' || cmd === 'survey') return transaction(db, async () => {
    const s = await resolve(db, 'sites', a[0]);
    const p = await resolve(db, 'products', a[1]);
    const day = flags.date ? date(flags.date) : today();
    if (day > today()) throw Error(`A ${cmd === 'produce' ? 'production' : 'survey'} date cannot be in the future`);
    if (cmd === 'produce') return db.query('insert into production(site_id,product_id,day,tonnes) values($1,$2,$3,$4) returning day,tonnes', [s.id, p.id, day, number(a[2], 'tonnes', { positive: true })]);
    return db.query('insert into surveys(site_id,product_id,surveyed_on,tonnes,surveyor) values($1,$2,$3,$4,$5) returning surveyed_on,tonnes', [s.id, p.id, day, number(a[2], 'tonnes', { min: 0 }), flags.by || null]);
  });

  if (cmd === 'lodge-royalty') return transaction(db, async () => {
    const s = await resolve(db, 'sites', a[0]);
    if (!/^\d{4}-\d{2}$/.test(a[1] || '')) throw Error('Use lodge-royalty <site> <YYYY-MM>');
    const period = date(`${a[1]}-01`, 'month');
    const row = (await db.query('select * from v_royalties where site_id=$1 and period=$2', [s.id, period]))[0];
    if (!row) throw Error(`${s.code} has no royalty to return for ${a[1]}: no rate set, no sales, or the month is not over`);
    if (row.lodged_on) throw Error(`${s.code} ${a[1]} was lodged on ${iso(row.lodged_on)} (${row.ref})`);
    return db.query('insert into royalty_returns(site_id,period,tonnes,amount,lodged_on,ref) values($1,$2,$3,$4,$5,$6) returning period,tonnes,amount,lodged_on,ref',
      [s.id, period, row.tonnes, row.amount, flags.date ? date(flags.date) : today(), required(flags.ref, 'return reference (--ref)')]);
  });

  if (cmd === 'test-bridge') return transaction(db, async () => {
    const b = await resolve(db, 'weighbridges', a[0]);
    const on = flags.date ? date(flags.date) : today();
    if (on > today()) throw Error('A test date cannot be in the future');
    return db.query('update weighbridges set last_tested_on=$2,test_ref=$3 where id=$1 returning code,last_tested_on,test_ref', [b.id, on, required(flags.ref, 'test certificate reference (--ref)')]);
  });

  if (cmd === 'manager') return transaction(db, async () => {
    const s = await resolve(db, 'sites', a[0]);
    return db.query('update sites set manager_name=$2,manager_cert=$3,manager_cert_expires=$4 where id=$1 returning code,manager_name,manager_cert,manager_cert_expires',
      [s.id, required(flags.name, 'manager name (--name)'), required(flags.cert, 'certificate (--cert)'), date(flags.expires, 'expiry (--expires)')]);
  });

  if (cmd === 'log') return transaction(db, async () => {
    const body = required(a.slice(1).join(' '), 'note');
    const job = (await db.query('select id from jobs where lower(code)=lower($1)', [a[0] || ''])).length;
    if (job) { const j = await resolve(db, 'jobs', a[0]); return db.query('insert into notes(job_id,body) values($1,$2) returning body', [j.id, body]); }
    const s = await resolve(db, 'sites', a[0]);
    return db.query('insert into notes(site_id,body) values($1,$2) returning body', [s.id, body]);
  });

  if (cmd === 'draft-statement') return draftStatement(db, a[0]);
  if (cmd === 'draft-royalty') return draftRoyalty(db, a[0], a[1]);

  throw Error(`Unknown command: ${cmd}. Run help.`);
}

// One load over the bridge. The rules a weighbridge operator applies before the truck leaves.
async function weigh(db, a, flags) {
  await db.exec('lock table tickets in share row exclusive mode');
  const k = await resolve(db, 'trucks', a[0]);
  if (!k.active) throw Error(`Truck ${k.rego} is not active`);
  const s = await resolve(db, 'sites', flags.site);
  let job = null;
  if (flags.job) {
    job = await resolve(db, 'jobs', flags.job);
    if (job.status !== 'open') throw Error(`Job ${job.code} is closed`);
  }
  const c = job ? (await db.query('select * from customers where id=$1', [job.customer_id]))[0] : await resolve(db, 'customers', flags.customer);
  if (flags.customer && job && (await resolve(db, 'customers', flags.customer)).id !== c.id) throw Error(`Job ${job.code} belongs to ${c.name}`);
  const p = job ? (await db.query('select * from products where id=$1', [job.product_id]))[0] : await resolve(db, 'products', flags.product);
  if (flags.product && job && (await resolve(db, 'products', flags.product)).id !== p.id) throw Error(`Job ${job.code} is for ${p.code}`);
  if (!p.active) throw Error(`Product ${p.code} is not active`);
  const cash = Boolean(flags.cash) || !c.account;
  if (c.credit_hold && !cash) throw Error(`${c.name} is on credit hold: release the hold or take cash before loading`);

  const gross = number(flags.gross, 'gross tonnes (--gross)', { positive: true });
  let tare; let stored = true;
  if (flags.tare !== undefined) { tare = number(flags.tare, 'tare tonnes', { positive: true }); stored = false; }
  else {
    const old = !k.tare_on || (Date.parse(today()) - Date.parse(iso(k.tare_on))) / 86400000 > 90;
    if (!k.tare_t || old) throw Error(`Stored tare for ${k.rego} is ${k.tare_on ? 'from ' + iso(k.tare_on) + ', older than 90 days' : 'missing'}: weigh it empty with --tare or update it with tare`);
    tare = Number(k.tare_t);
  }
  if (gross <= tare) throw Error(`Gross ${gross} t is not more than the tare of ${tare} t`);
  if (k.max_gross_t && gross > Number(k.max_gross_t)) throw Error(`Overloaded by ${t2(gross - Number(k.max_gross_t))} t: ${k.rego} may weigh ${k.max_gross_t} t gross. Tip off and weigh again`);
  const net = t2(gross - tare);
  const consent = (await db.query('select * from v_consent where site_id=$1', [s.id]))[0];
  if (consent.consent_limit_t && Number(consent.dispatched_t) + net > Number(consent.consent_limit_t)) {
    throw Error(`${s.code} has dispatched ${consent.dispatched_t} t of its ${consent.consent_limit_t} t consent limit since ${iso(consent.year_start)}: this load takes it over`);
  }
  let bridge = null;
  if (flags.bridge) {
    bridge = await resolve(db, 'weighbridges', flags.bridge);
    if (bridge.site_id !== s.id) throw Error(`Weighbridge ${bridge.code} is not at ${s.code}`);
  } else bridge = (await db.query('select * from weighbridges where site_id=$1 order by code limit 1', [s.id]))[0] || null;
  let at = new Date().toISOString();
  if (flags.at) {
    if (!/^\d{2}:\d{2}$/.test(flags.at)) throw Error('Invalid --at: use HH:MM');
    at = `${today()}T${flags.at}:00Z`;
  }
  const n = (await db.query("select coalesce(max(substring(ticket_no from '(\\d+)$')::int),0)+1 n from tickets where site_id=$1", [s.id]))[0].n;
  const price = job ? job.price_per_t : p.price_per_t;
  const cartage = job ? job.cartage_per_t : 0;
  return db.query(`insert into tickets(ticket_no,site_id,weighbridge_id,truck_id,customer_id,job_id,product_id,weighed_at,gross_t,tare_t,stored_tare,price_per_t,cartage_per_t,cash)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning ticket_no,gross_t,tare_t,net_t,price_per_t,cash`,
  [`${s.code}${n}`, s.id, bridge?.id || null, k.id, c.id, job?.id || null, p.id, at, gross, tare, stored, price, cartage, cash]);
}

async function add(db, a, flags) {
  const [type, code, ...rest] = a;
  const name = rest.join(' ');
  if (type === 'site') return db.query('insert into sites(code,name,country,consent_ref,consent_limit_t,consent_year_starts,royalty_per_t,royalty_payee) values($1,$2,$3,$4,$5,$6,$7,$8) returning code,name',
    [required(code, 'code'), required(name, 'name'), required(flags.country, 'country (--country=NZ|AU)'), flags.consent || null, flags.limit ? number(flags.limit, 'consent limit', { positive: true }) : null,
      flags['year-starts'] ? number(flags['year-starts'], 'consent year start month', { positive: true }) : 1, flags.royalty ? number(flags.royalty, 'royalty per t', { min: 0 }) : null, flags.payee || null]);
  if (type === 'bridge') {
    const s = await resolve(db, 'sites', flags.site);
    return db.query('insert into weighbridges(code,site_id,name,verification_mark,last_tested_on) values($1,$2,$3,$4,$5) returning code,name', [required(code, 'code'), s.id, required(name, 'name'), flags.mark || null, flags.tested ? date(flags.tested) : null]);
  }
  if (type === 'product') return db.query('insert into products(code,name,price_per_t,min_stock_t) values($1,$2,$3,$4) returning code,name,price_per_t',
    [required(code, 'code'), required(name, 'name'), number(flags.price, 'price per t (--price)', { min: 0 }), flags['min-stock'] ? number(flags['min-stock'], 'minimum stock', { min: 0 }) : 0]);
  if (type === 'customer') return db.query('insert into customers(code,name,email,phone,account) values($1,$2,$3,$4,$5) returning code,name,account',
    [required(code, 'code'), required(name, 'name'), flags.email || null, flags.phone || null, !flags.cash]);
  if (type === 'job') {
    const c = await resolve(db, 'customers', flags.customer);
    const p = await resolve(db, 'products', flags.product);
    return db.query('insert into jobs(code,customer_id,name,address,product_id,price_per_t,cartage_per_t,quoted_t) values($1,$2,$3,$4,$5,$6,$7,$8) returning code,name,price_per_t',
      [required(code, 'code'), c.id, required(name, 'name'), flags.address || null, p.id, number(flags.price, 'price per t (--price)', { min: 0 }),
        flags.cartage ? number(flags.cartage, 'cartage per t', { min: 0 }) : 0, flags.quoted ? number(flags.quoted, 'quoted tonnes', { positive: true }) : null]);
  }
  if (type === 'truck') return db.query('insert into trucks(rego,carrier,tare_t,tare_on,max_gross_t) values($1,$2,$3,$4,$5) returning rego,tare_t,max_gross_t',
    [required(code, 'rego'), flags.carrier || null, number(flags.tare, 'tare tonnes (--tare)', { positive: true }), today(), number(flags['max-gross'], 'maximum gross tonnes (--max-gross)', { positive: true })]);
  throw Error('Add one of: site, bridge, product, customer, job, truck');
}

// WinWeigh exports lists and weighing records to CSV. Headings differ between installs: map them with --map.
const importFiles = [
  { match: /^customers?/, entity: 'customers' },
  { match: /^products?/, entity: 'products' },
  { match: /^(vehicles?|trucks?)/, entity: 'trucks' },
  { match: /^(transactions?|tickets?|weighings?|dockets?)/, entity: 'tickets' },
];
const csvDate = (v, label) => {
  const s = required(v, label);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return date(s, label);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return date(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`, label);
  throw Error(`Invalid ${label}: ${s}. Use YYYY-MM-DD or DD/MM/YYYY`);
};

async function importWinWeigh(db, a, flags) {
  if (a[0] !== 'winweigh') throw Error('Supported import: winweigh. See docs/replace-winweigh.md');
  const dir = path.resolve(required(a[1], 'folder of CSV exports'));
  const mapping = flags.map ? JSON.parse(fs.readFileSync(flags.map, 'utf8')) : {};
  const rank = (f) => { const i = importFiles.findIndex((x) => x.match.test(f.toLowerCase())); return i < 0 ? 9 : i; };
  const files = fs.readdirSync(dir).filter((n) => /\.csv$/i.test(n)).sort((x, y) => rank(x) - rank(y) || x.localeCompare(y));
  if (!files.length) throw Error(`No CSV files in ${dir}`);
  return transaction(db, async () => {
    const out = [];
    for (const file of files) {
      const spec = importFiles.find((x) => x.match.test(file.toLowerCase()));
      if (!spec) throw Error(`Unrecognised file ${file}: expected Customers, Products, Vehicles or Transactions. See docs/replace-winweigh.md`);
      const rows = parseCsv(fs.readFileSync(path.join(dir, file), 'utf8'));
      if (!rows.length) throw Error(`Empty file: ${file}`);
      let added = 0; let kept = 0;
      for (const raw of rows) {
        const row = { ...raw };
        for (const [ours, theirs] of Object.entries(mapping[spec.entity] || {})) {
          if (!(theirs in raw)) throw Error(`${file}: mapped column "${theirs}" is not in the file`);
          row[ours] = raw[theirs];
        }
        if (spec.entity === 'customers') {
          const type = pick(row, 'Account Type', 'Type').toLowerCase();
          await db.query('insert into customers(code,name,email,phone,account,credit_hold) values($1,$2,$3,$4,$5,$6) on conflict(code) do update set name=excluded.name,email=excluded.email,phone=excluded.phone,account=excluded.account',
            [required(pick(row, 'Customer Code', 'Account Code', 'Code'), `${file}: customer code`), required(pick(row, 'Customer Name', 'Name'), `${file}: customer name`),
              pick(row, 'Email', 'Email Address') || null, pick(row, 'Phone', 'Phone Number') || null, type !== 'cash', yesNo(pick(row, 'On Hold', 'Credit Hold', 'Stop'))]);
        } else if (spec.entity === 'products') {
          const code = required(pick(row, 'Product Code', 'Code'), `${file}: product code`);
          await db.query('insert into products(code,name,price_per_t) values($1,$2,$3) on conflict(code) do update set name=excluded.name,price_per_t=excluded.price_per_t',
            [code, required(pick(row, 'Product Name', 'Description', 'Name'), `${file}: product name`), number(pick(row, 'Price', 'Unit Price', 'Price per Tonne'), `${file} ${code}: price`, { min: 0 })]);
        } else if (spec.entity === 'trucks') {
          const rego = required(pick(row, 'Registration', 'Rego', 'Vehicle'), `${file}: registration`);
          const tare = pick(row, 'Tare', 'Tare Weight', 'Stored Tare');
          const max = pick(row, 'Max Gross', 'GVM', 'GCM', 'Mass Limit');
          await db.query('insert into trucks(rego,carrier,tare_t,tare_on,max_gross_t) values($1,$2,$3,$4,$5) on conflict(rego) do update set carrier=excluded.carrier,tare_t=excluded.tare_t,tare_on=excluded.tare_on,max_gross_t=excluded.max_gross_t',
            [rego, pick(row, 'Carrier', 'Owner', 'Haulier') || null, tare ? number(tare, `${file} ${rego}: tare`, { positive: true }) : null,
              pick(row, 'Tare Date', 'Tared On') ? csvDate(pick(row, 'Tare Date', 'Tared On'), `${file} ${rego}: tare date`) : null, max ? number(max, `${file} ${rego}: max gross`, { positive: true }) : null]);
        } else {
          const no = required(pick(row, 'Ticket No', 'Ticket Number', 'Docket No', 'Docket Number'), `${file}: ticket number`);
          const one = async (sql, v, what) => { const r = (await db.query(sql, [v]))[0]; if (!r) throw Error(`${file} ${no}: ${what} ${v} is not in the database or the import files`); return r; };
          const s = await one('select * from sites where lower(code)=lower($1)', required(pick(row, 'Site', 'Site Code'), `${file} ${no}: site`), 'site');
          const k = await one('select * from trucks where lower(rego)=lower($1)', required(pick(row, 'Registration', 'Rego', 'Vehicle'), `${file} ${no}: registration`), 'truck');
          const c = await one('select * from customers where lower(code)=lower($1)', required(pick(row, 'Customer Code', 'Account Code', 'Customer'), `${file} ${no}: customer`), 'customer');
          const p = await one('select * from products where lower(code)=lower($1)', required(pick(row, 'Product Code', 'Product'), `${file} ${no}: product`), 'product');
          const gross = number(pick(row, 'Gross', 'Gross Weight'), `${file} ${no}: gross`, { positive: true });
          const tare = number(pick(row, 'Tare', 'Tare Weight'), `${file} ${no}: tare`, { positive: true });
          const net = pick(row, 'Net', 'Net Weight');
          if (net && Math.abs(Number(net) - (gross - tare)) > 0.02) throw Error(`${file} ${no}: net ${net} does not equal gross ${gross} less tare ${tare}`);
          const time = pick(row, 'Time') || '00:00';
          if (!/^\d{1,2}:\d{2}$/.test(time)) throw Error(`${file} ${no}: invalid time ${time}`);
          const price = pick(row, 'Unit Price', 'Price', 'Rate');
          const r = await db.query(`insert into tickets(ticket_no,site_id,truck_id,customer_id,product_id,weighed_at,gross_t,tare_t,price_per_t,cash,paid,invoice_ref)
            values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict(ticket_no) do nothing returning ticket_no`,
          [no, s.id, k.id, c.id, p.id, `${csvDate(pick(row, 'Date', 'Weigh Date'), `${file} ${no}: date`)}T${time.padStart(5, '0')}:00Z`, gross, tare,
            price ? number(price, `${file} ${no}: price`, { min: 0 }) : p.price_per_t, !c.account, !c.account, pick(row, 'Invoice', 'Invoice No') || null]);
          if (!r.length) { kept++; continue; }
        }
        added++;
      }
      out.push({ file, entity: spec.entity, rows: added, already_held: kept, dry_run: Boolean(flags['dry-run']) });
    }
    return out;
  }, Boolean(flags['dry-run']));
}

function writeDraft(name, body) {
  const dir = path.resolve(process.env.OUTPUT_DIR || REPO_ROOT, 'drafts');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}-${Date.now()}.md`);
  fs.writeFileSync(file, body);
  return file;
}

async function draftStatement(db, ref) {
  const c = await resolve(db, 'customers', ref);
  if (!c.account) throw Error(`${c.name} is a cash customer: no statement`);
  const rows = await db.query('select ticket_no,day,job,product,net_t,price_per_t,cartage_per_t,value from v_tickets where customer_id=$1 and invoice_ref is null order by day,ticket_no', [c.id]);
  if (!rows.length) throw Error(`${c.name} has no loads waiting for an invoice`);
  const total = rows.reduce((s, r) => s + Number(r.value), 0).toFixed(2);
  const tonnes = rows.reduce((s, r) => s + Number(r.net_t), 0).toFixed(2);
  const lines = rows.map((r) => `| ${r.ticket_no} | ${iso(r.day)} | ${r.job || ''} | ${r.product} | ${r.net_t} | ${r.price_per_t} | ${r.cartage_per_t} | ${r.value} |`).join('\n');
  const file = writeDraft(`statement-${c.code}`, `# DRAFT: loads to invoice for ${c.name}\n\nTo: ${c.email || '(no email on file)'}\n\nHi ${c.name},\n\nThese loads have gone out on your account and are ready to invoice.\n\n| Ticket | Date | Job | Product | Net t | Price/t | Cartage/t | Value |\n|---|---|---|---|---|---|---|---|\n${lines}\n\nTotal: ${tonnes} t, ${total} before tax.\n\n${c.credit_hold ? 'REVIEW BEFORE SENDING: this account is on credit hold.\n\n' : ''}For review before sending. Nothing has been sent.\n`);
  return [{ file, customer: c.code, loads: rows.length, tonnes: Number(tonnes), value: Number(total) }];
}

async function draftRoyalty(db, siteRef, month) {
  const s = await resolve(db, 'sites', siteRef);
  if (!/^\d{4}-\d{2}$/.test(month || '')) throw Error('Use draft-royalty <site> <YYYY-MM>');
  const row = (await db.query('select * from v_royalties where site_id=$1 and period=$2', [s.id, `${month}-01`]))[0];
  if (!row) throw Error(`${s.code} has no royalty to return for ${month}`);
  const byProduct = await db.query("select product,count(*) loads,sum(net_t) tonnes from v_tickets where site_id=$1 and date_trunc('month',day)=$2::date group by product order by product", [s.id, `${month}-01`]);
  const lines = byProduct.map((r) => `| ${r.product} | ${r.loads} | ${r.tonnes} |`).join('\n');
  const file = writeDraft(`royalty-${s.code}-${month}`, `# DRAFT: royalty return for ${s.name}, ${month}\n\nTo: ${row.payee || '(payee not recorded)'}\n\nTonnes sold from ${s.name} in ${month}, from the weighbridge tickets.\n\n| Product | Loads | Tonnes |\n|---|---|---|\n${lines}\n\nTotal ${row.tonnes} t at ${row.royalty_per_t} per tonne: ${row.amount}. Due ${iso(row.due)}.\n\n${row.lodged_on ? `Already lodged on ${iso(row.lodged_on)} (${row.ref}).\n\n` : ''}Check the rate and the tonnes against your royalty agreement before lodging. For review before sending. Nothing has been sent.\n`);
  return [{ file, site: s.code, period: month, tonnes: Number(row.tonnes), amount: Number(row.amount) }];
}

function print(value) {
  if (Array.isArray(value)) { console.log(table(value, Object.keys(value[0] || {}).map((key) => ({ key, label: key, format: fmt })))); return; }
  for (const [key, v] of Object.entries(value)) { console.log(`\n${key}`); print(Array.isArray(v) ? v : [v]); }
}
function fmt(v) {
  if (v instanceof Date) return v.toISOString().slice(0, v.getUTCHours() || v.getUTCMinutes() ? 16 : 10).replace('T', ' ');
  if (v === true) return 'yes';
  if (v === false) return 'no';
  return v;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let db;
  try {
    db = await getDb();
    const out = await run(db, process.argv.slice(2));
    if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 2)); else print(out);
  } catch (e) { console.error(e.message); process.exitCode = 1; }
  finally { await db?.close(); }
}
