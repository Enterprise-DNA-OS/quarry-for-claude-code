// npm test: a temp database, migrate, seed twice, then every command and every rule.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { migrate } from './migrate.mjs';
import { run, reads } from './quarry.mjs';
import { parseCsv } from './lib/csv.mjs';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'quarry-test-'));
// A blank URL keeps tests off any real database named in .env.
process.env.DATABASE_URL = ''; process.env.DATA_DIR = path.join(temp, 'db'); process.env.OUTPUT_DIR = temp;
let db; let checks = 0;
const ok = (v, msg) => { assert.ok(v, msg); checks++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); checks++; };
const rejects = async (args, re) => { await assert.rejects(() => run(db, args), re); checks++; };
const child = (script, args = []) => {
  const p = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', script), ...args], { env: process.env, encoding: 'utf8', cwd: REPO_ROOT });
  assert.equal(p.status, 0, p.stderr || p.stdout); checks++; return p.stdout;
};
const now = new Date();
const monthBack = (n) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 1)).toISOString().slice(0, 7);
const rules = async () => new Set((await run(db, ['compliance'])).map((r) => `${r.rule} ${r.record}`));

try {
  db = await getDb();
  eq((await migrate(db)).ran.length, 1); eq((await migrate(db)).ran.length, 0);
  const seed = fs.readFileSync(path.join(REPO_ROOT, 'supabase/seed.sql'), 'utf8');
  await db.exec(seed); await db.exec(seed);
  eq((await db.query('select count(*)::int n from tickets'))[0].n, 117);
  eq((await run(db, ['jobs'])).length, 5);

  for (const name of Object.keys(reads)) ok(Array.isArray(await run(db, [name])), name);

  // The demo has something to say on every rule.
  const found = await rules();
  for (const r of ['OVERLOAD K0999', 'OVERLOAD W0109', 'TARE-STALE HCL55', 'MASS-LIMIT-MISSING SUB9', 'CONSENT-LIMIT TAR', 'WEIGHBRIDGE-TEST KOW-2', 'SITE-MANAGER TAR', `ROYALTY-RETURN KOW ${monthBack(2)}`]) ok(found.has(r), r);
  ok(!found.has(`ROYALTY-RETURN KOW ${monthBack(3)}`), 'lodged month is clean');
  eq(Number((await run(db, ['consent'])).find((r) => r.site === 'TAR').pct), 93);
  eq((await run(db, ['stock'])).filter((r) => r.low).map((r) => `${r.site} ${r.product}`), ['KOW DRAIN']);
  eq((await run(db, ['price-check']))[0].ticket_no, 'K1403');
  eq((await run(db, ['overloads'])).map((r) => r.ticket_no), ['W0109', 'K0999']);
  eq((await run(db, ['tare-due'])).map((r) => r.rego), ['HCL55']);
  eq((await run(db, ['unpaid'])).map((r) => r.ticket_no), ['K1402']);
  eq((await run(db, ['job-progress']))[0].code, 'J100');
  const attention = await run(db, ['attention']);
  for (const k of ['cash load unpaid', 'loads not invoiced after 7 days', 'job on credit hold', 'job near quoted tonnes', 'stock below minimum', 'royalty return due', 'weighbridge test due', 'manager certificate to renew', 'tare re-weigh due', 'consent limit close']) ok(attention.some((r) => r.kind === k), k);
  ok((await run(db, ['day-sales', `--date=${new Date(Date.now() - 86400000).toISOString().slice(0, 10)}`])).length > 0);
  eq((await run(db, ['job', 'j100'])).tickets.length, 41);
  eq((await run(db, ['site', 'TAR'])).consent[0].pct, (await run(db, ['consent'])).find((r) => r.site === 'TAR').pct);
  eq((await run(db, ['ticket', 'K1001'])).ticket[0].customer, 'Harbour Civil');

  // Matching: partial codes and names, ambiguity lists candidates.
  await rejects(['job', 'J10'], /Ambiguous.*J100.*J104/);
  await rejects(['job', 'ZZZ'], /No matching job/);
  eq((await run(db, ['job', 'bypass'])).job[0].code, 'J100');

  // Weighing rules.
  await rejects(['weigh', 'HCL55', '--site=KOW', '--job=J104', '--gross=44'], /older than 90 days/);
  await rejects(['weigh', 'KTA101', '--site=KOW', '--job=J100', '--gross=44.5'], /Overloaded by 0.5 t/);
  await rejects(['weigh', 'RDG7', '--site=KOW', '--job=J101', '--gross=24'], /credit hold/);
  await rejects(['weigh', 'KTA101', '--site=KOW', '--job=J100', '--product=SAND', '--gross=43'], /is for AP40/);
  await rejects(['weigh', 'KTA101', '--site=KOW', '--job=J100', '--bridge=TAR-1', '--gross=43'], /not at KOW/);
  await rejects(['weigh', 'KTA101', '--site=KOW', '--job=J100', '--gross=10'], /not more than the tare/);
  const w = await run(db, ['weigh', 'KTA101', '--site=KOW', '--job=J100', '--gross=43.9', '--at=07:30']);
  eq(w[0].ticket_no, 'KOW1404'); eq(Number(w[0].net_t), 28.7); eq(Number(w[0].price_per_t), 29.5);
  const cash = await run(db, ['weigh', 'RDG7', '--site=KOW', '--job=J101', '--gross=24', '--cash']);
  eq(cash[0].cash, true);
  const empty = await run(db, ['weigh', 'HCL55', '--site=KOW', '--job=J104', '--gross=45', '--tare=16.4']);
  eq(Number(empty[0].net_t), 28.6);
  eq((await run(db, ['weigh', 'CAS123', '--site=KOW', '--customer=CASH', '--product=AP20', '--gross=3'])).map((r) => r.cash), [true]);
  await db.query("update sites set consent_limit_t=1410 where code='TAR'");
  await rejects(['weigh', 'KTA102', '--site=TAR', '--job=J102', '--gross=43'], /takes it over/);
  await db.query("update sites set consent_limit_t=1500 where code='TAR'");
  await assert.rejects(() => db.query("update tickets set gross_t=40 where ticket_no='K1001'"), /printed/); checks++;
  await assert.rejects(() => db.query("delete from tickets where ticket_no='K1001'"), /kept/); checks++;

  // Tare, void, paid, invoices, holds and jobs.
  await rejects(['tare', 'HCL55', '16.2', '--date=2999-01-01'], /future/);
  await run(db, ['tare', 'HCL55', '16.2']);
  ok(!(await rules()).has('TARE-STALE HCL55'));
  await run(db, ['weigh', 'HCL55', '--site=KOW', '--job=J104', '--gross=45']);
  await rejects(['void', 'K1001'], /reason/);
  await rejects(['void', 'K1011', '--reason=wrong product'], /on invoice INV-2041/);
  await run(db, ['void', 'KOW1404', '--reason=wrong truck keyed']);
  await rejects(['void', 'KOW1404', '--reason=again'], /already void/);
  ok(!(await run(db, ['tickets'])).some((r) => r.ticket_no === 'KOW1404'));
  await rejects(['paid', 'K1001'], /account load/);
  await run(db, ['paid', 'K1402']); await rejects(['paid', 'K1402'], /already paid/);
  ok(!(await run(db, ['unpaid'])).some((r) => r.ticket_no === 'K1402'));
  await rejects(['invoice', 'K1011', '--ref=X'], /already on INV-2041/);
  await rejects(['invoice', 'K1401', '--ref=X'], /cash load/);
  await run(db, ['invoice', 'K1302', '--ref=INV-3001']);
  const inv = await run(db, ['invoice', 'NORTHSIDE', '--ref=INV-3002']);
  ok(inv.length >= 20);
  await rejects(['invoice', 'NORTHSIDE', '--ref=INV-3003'], /no account loads waiting/);
  await run(db, ['hold', 'RIDGE', 'off']); await run(db, ['weigh', 'RDG7', '--site=KOW', '--job=J101', '--gross=24']);
  await rejects(['hold', 'RIDGE', 'maybe'], /on\|off/);
  await run(db, ['close', 'J103']); await rejects(['close', 'J103'], /already closed/);
  await rejects(['weigh', 'LND3', '--site=KOW', '--job=J103', '--gross=12'], /closed/);

  // Production, surveys, royalties, bridges and managers.
  await run(db, ['produce', 'KOW', 'DRAIN', '300']);
  ok(!(await run(db, ['stock'])).some((r) => r.low));
  await rejects(['produce', 'KOW', 'DRAIN', '300', '--date=2999-01-01'], /future/);
  await run(db, ['survey', 'KOW', 'AP40', '3800', '--by=Demo Surveys']);
  eq(Number((await run(db, ['stock'])).find((r) => r.site === 'KOW' && r.product === 'AP40').book_t), 3800);
  await rejects(['lodge-royalty', 'KOW', monthBack(2)], /reference/);
  const owed = (await run(db, ['royalties'])).find((r) => r.site === 'KOW' && String(r.period instanceof Date ? r.period.toISOString() : r.period).startsWith(monthBack(2)));
  const lodged = await run(db, ['lodge-royalty', 'KOW', monthBack(2), '--ref=ROY-1']);
  eq(Number(lodged[0].amount), Number(owed.amount)); ok(Number(owed.amount) > 0);
  ok(!(await rules()).has(`ROYALTY-RETURN KOW ${monthBack(2)}`));
  await rejects(['lodge-royalty', 'KOW', monthBack(2), '--ref=ROY-2'], /was lodged/);
  await rejects(['lodge-royalty', 'KOW', monthBack(0), '--ref=ROY-3'], /no royalty/);
  await rejects(['lodge-royalty', 'TAR', monthBack(1), '--ref=ROY-4'], /no royalty/);
  await rejects(['lodge-royalty', 'KOW', '2026-1'], /YYYY-MM/);
  await run(db, ['test-bridge', 'KOW-2', '--ref=COA-NEW']);
  ok(!(await rules()).has('WEIGHBRIDGE-TEST KOW-2'));
  await rejects(['test-bridge', 'KOW-2'], /reference/);
  await run(db, ['manager', 'TAR', '--name=Mike Rowe', '--cert=B-grade DEMO-208', '--expires=2031-11-01']);
  ok(!(await rules()).has('SITE-MANAGER TAR'));
  await rejects(['manager', 'TAR', '--name=X', '--cert=Y', '--expires=2031-02-30'], /real YYYY-MM-DD/);

  // Adding records.
  await run(db, ['add', 'site', 'TST', 'Test pit', '--country=NZ', '--limit=5000', '--year-starts=4']);
  ok((await rules()).has('SITE-MANAGER TST'));
  await run(db, ['add', 'bridge', 'TST-1', 'Test bridge', '--site=TST', '--tested=2026-10-01']);
  await run(db, ['add', 'product', 'TOP', 'Topsoil screened', '--price=52', '--min-stock=50']);
  await run(db, ['add', 'customer', 'TESTC', 'Test Contractor', '--email=test@example.com']);
  await run(db, ['add', 'customer', 'WALK', 'Walk-in', '--cash']);
  await run(db, ['add', 'job', 'J900', 'Test fill', '--customer=TESTC', '--product=TOP', '--price=50', '--quoted=100']);
  await run(db, ['add', 'truck', 'TST1', '--tare=8', '--max-gross=20', '--carrier=Test Haul']);
  await rejects(['add', 'truck', 'TST2', '--tare=8'], /maximum gross/);
  await rejects(['add', 'product', 'BAD', 'Bad', '--price=-1'], /Invalid/);
  await rejects(['add', 'widget', 'X'], /Add one of/);
  eq((await run(db, ['weigh', 'TST1', '--site=TST', '--job=J900', '--gross=19']))[0].ticket_no, 'TST1');
  eq((await run(db, ['weigh', 'TST1', '--site=TST', '--customer=WALK', '--product=TOP', '--gross=18']))[0].cash, true);
  await run(db, ['log', 'J900', 'Customer', 'wants', 'screened', 'only']); eq((await run(db, ['job', 'J900'])).notes.length, 1);
  await run(db, ['log', 'TST', 'Bund', 'repaired']); eq((await run(db, ['site', 'TST'])).notes.length, 1);

  // Import from WinWeigh exports: dry run, real run, repeat, rollback, mapping.
  const fixtures = path.join(REPO_ROOT, 'tests/fixtures/winweigh');
  await run(db, ['import', 'winweigh', fixtures, '--dry-run']);
  eq((await db.query("select * from customers where code='IMP-CUST'")).length, 0);
  const imported = await run(db, ['import', 'winweigh', fixtures]);
  eq(imported.map((r) => r.entity), ['customers', 'products', 'trucks', 'tickets']);
  eq(imported[3].rows, 2);
  const again = await run(db, ['import', 'winweigh', fixtures]);
  eq([again[3].rows, again[3].already_held], [0, 2]);
  eq(Number((await run(db, ['ticket', 'WW-50001'])).ticket[0].net_t), 27.5);
  eq(Number((await run(db, ['ticket', 'WW-50002'])).ticket[0].price_per_t), 33);
  eq((await db.query("select account from customers where code='IMP-CASH'"))[0].account, false);
  const bad = path.join(temp, 'bad'); fs.mkdirSync(bad);
  fs.writeFileSync(path.join(bad, 'Customers.csv'), 'Customer Code,Customer Name\nROLLBACK,Good row\nBROKEN,\n');
  await rejects(['import', 'winweigh', bad], /Required/);
  eq((await db.query("select * from customers where code='ROLLBACK'")).length, 0);
  fs.writeFileSync(path.join(bad, 'Customers.csv'), 'Acct,Account Name\nMAPPED,Mapped Customer\n');
  const map = path.join(temp, 'map.json'); fs.writeFileSync(map, JSON.stringify({ customers: { 'Customer Code': 'Acct', 'Customer Name': 'Account Name' } }));
  await run(db, ['import', 'winweigh', bad, `--map=${map}`]);
  eq((await db.query("select * from customers where code='MAPPED'")).length, 1);
  fs.writeFileSync(path.join(bad, 'Transactions.csv'), 'Ticket No,Date,Site,Registration,Customer Code,Product Code,Gross,Tare,Net\nWW-9,2026-10-01,KOW,IMP9,MAPPED,AP40,40,15,24\n');
  await rejects(['import', 'winweigh', bad, `--map=${map}`], /does not equal/);
  fs.writeFileSync(path.join(bad, 'Transactions.csv'), 'Ticket No,Date,Site,Registration,Customer Code,Product Code,Gross,Tare\nWW-9,2026-10-01,NOPE,IMP9,MAPPED,AP40,40,15\n');
  await rejects(['import', 'winweigh', bad, `--map=${map}`], /site NOPE is not in the database/);
  fs.rmSync(path.join(bad, 'Transactions.csv')); fs.rmSync(path.join(bad, 'Customers.csv'));
  fs.writeFileSync(path.join(bad, 'Invoices.csv'), 'x\ny\n');
  await rejects(['import', 'winweigh', bad], /Unrecognised/);
  await rejects(['import', 'other', bad], /Supported import/);
  eq(parseCsv('﻿Code,Name\r\nA,"Line one\nLine ""two"""\r\n')[0].Name, 'Line one\nLine "two"');

  // Export and drafts.
  const exported = await run(db, ['export', path.join(temp, 'export')]);
  eq(exported.length, 11); ok(fs.existsSync(path.join(temp, 'export', 'manifest.json')));
  const st = await run(db, ['draft-statement', 'HARBOUR']);
  ok(fs.readFileSync(st[0].file, 'utf8').includes('Kaiwaka bypass') || st[0].loads > 0);
  await rejects(['draft-statement', 'CASH'], /cash customer/);
  await rejects(['draft-statement', 'NORTHSIDE'], /no loads waiting/);
  const roy = await run(db, ['draft-royalty', 'KOW', monthBack(2)]);
  ok(fs.readFileSync(roy[0].file, 'utf8').includes('Already lodged'));
  await rejects(['draft-royalty', 'TAR', monthBack(1)], /no royalty/);
  await db.close(); db = null;

  // The CLI as a process: --json, help, ambiguity exits 1.
  ok(JSON.parse(child('quarry.mjs', ['compliance', '--json'])).length > 0);
  ok(child('quarry.mjs', ['help']).includes('weigh <truck>'));
  const amb = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts/quarry.mjs'), 'job', 'J10'], { env: process.env, encoding: 'utf8' });
  eq(amb.status, 1); ok(amb.stderr.includes('Candidates:'));
  child('view.mjs'); child('docs.mjs');
  for (const v of JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'views.json'), 'utf8'))) ok(fs.existsSync(path.join(temp, 'views', `${v.name}.html`)), v.name);
  ok(fs.readdirSync(path.join(temp, 'docs-out', 'weighbridge-ticket')).length >= 40);
  ok(fs.readdirSync(path.join(temp, 'docs-out', 'royalty-summary')).length === 2);
  ok(fs.readdirSync(path.join(temp, 'docs-out', 'consent-report')).length >= 3);

  const commands = fs.readdirSync(path.join(REPO_ROOT, '.claude/commands')).filter((f) => f.endsWith('.md') && f !== 'README.md');
  for (const f of commands) ok(/^---\ndescription: .+\n---/m.test(fs.readFileSync(path.join(REPO_ROOT, '.claude/commands', f), 'utf8')), `${f} has a description`);
  for (const [, cmd] of JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs/questions.json'), 'utf8'))) ok(reads[cmd.split(' ')[0]], `question runs ${cmd}`);
  console.log(`PASS: ${checks} assertions; ${Object.keys(reads).length} read commands; ${commands.length} slash commands; weighing rules, tickets, consent, royalties, stock, import rollback, export, drafts and HTML.`);
} finally {
  await db?.close();
  fs.rmSync(temp, { recursive: true, force: true });
}
