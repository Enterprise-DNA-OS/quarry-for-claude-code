-- Quarry for Claude Code: sites, weighbridges, products, customers, jobs, trucks,
-- weighbridge tickets, production, stockpile surveys and royalty returns. Plain
-- Postgres; runs on PGlite unchanged. gen_random_uuid() is built into Postgres 13+.

create function touch_updated() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- A site is one quarry or pit. The consent limit is the annual extraction or
-- dispatch limit in its resource consent or development approval; the consent
-- year starts on the first day of consent_year_starts (a month number).
create table sites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  country text not null check (country in ('NZ','AU')),
  consent_ref text,
  consent_limit_t numeric(12,2) check (consent_limit_t > 0),
  consent_year_starts integer not null default 1 check (consent_year_starts between 1 and 12),
  manager_name text,
  manager_cert text,
  manager_cert_expires date,
  royalty_payee text,
  royalty_per_t numeric(8,4) check (royalty_per_t >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table weighbridges (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  site_id uuid not null references sites,
  name text not null,
  verification_mark text,
  last_tested_on date,
  test_ref text,
  test_every_days integer not null default 365 check (test_every_days > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  price_per_t numeric(10,2) not null check (price_per_t >= 0),
  min_stock_t numeric(12,2) not null default 0 check (min_stock_t >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  email text,
  phone text,
  account boolean not null default true,
  credit_hold boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A job is a customer's contract or project: an agreed product, price, cartage
-- and quoted tonnes. Tickets on a job take the job's price.
create table jobs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  customer_id uuid not null references customers,
  name text not null,
  address text,
  product_id uuid not null references products,
  price_per_t numeric(10,2) not null check (price_per_t >= 0),
  cartage_per_t numeric(10,2) not null default 0 check (cartage_per_t >= 0),
  quoted_t numeric(12,2) check (quoted_t > 0),
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trucks keep a stored tare and the most they may weigh in total (their GVM or
-- GCM, or the mass limit on their permit). A stored tare goes stale.
create table trucks (
  id uuid primary key default gen_random_uuid(),
  rego text not null unique,
  carrier text,
  tare_t numeric(8,2) check (tare_t > 0),
  tare_on date,
  max_gross_t numeric(8,2) check (max_gross_t > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A ticket is one weighing over the bridge. Weights, product, truck, customer and
-- price are fixed once printed; a wrong ticket is voided with a reason and reissued.
create table tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_no text not null unique,
  site_id uuid not null references sites,
  weighbridge_id uuid references weighbridges,
  truck_id uuid not null references trucks,
  customer_id uuid not null references customers,
  job_id uuid references jobs,
  product_id uuid not null references products,
  weighed_at timestamptz not null,
  gross_t numeric(8,2) not null check (gross_t > 0),
  tare_t numeric(8,2) not null check (tare_t > 0),
  net_t numeric(8,2) generated always as (gross_t - tare_t) stored,
  stored_tare boolean not null default true,
  price_per_t numeric(10,2) not null check (price_per_t >= 0),
  cartage_per_t numeric(10,2) not null default 0 check (cartage_per_t >= 0),
  cash boolean not null default false,
  paid boolean not null default false,
  invoice_ref text,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (gross_t > tare_t)
);

create table production (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites,
  product_id uuid not null references products,
  day date not null,
  tonnes numeric(12,2) not null check (tonnes > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A stockpile survey resets the book stock for a product at a site.
create table surveys (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites,
  product_id uuid not null references products,
  surveyed_on date not null,
  tonnes numeric(12,2) not null check (tonnes >= 0),
  surveyor text,
  unique (site_id, product_id, surveyed_on),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table royalty_returns (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites,
  period date not null check (extract(day from period) = 1),
  tonnes numeric(12,2) not null check (tonnes >= 0),
  amount numeric(12,2) not null check (amount >= 0),
  lodged_on date not null,
  ref text not null check (length(trim(ref)) > 0),
  unique (site_id, period),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table notes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs,
  site_id uuid references sites,
  body text not null check (length(trim(body)) > 0),
  check (job_id is not null or site_id is not null),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['sites','weighbridges','products','customers','jobs','trucks','tickets','production','surveys','royalty_returns','notes'] loop
    execute format('create trigger touch before update on %I for each row execute function touch_updated()', t);
  end loop;
end $$;

-- A printed ticket keeps its weights, product, truck, customer, site and price.
create function lock_ticket() returns trigger language plpgsql as $$
begin
  if new.gross_t <> old.gross_t or new.tare_t <> old.tare_t or new.product_id <> old.product_id
     or new.truck_id <> old.truck_id or new.customer_id <> old.customer_id or new.site_id <> old.site_id
     or new.price_per_t <> old.price_per_t or new.cartage_per_t <> old.cartage_per_t
     or new.weighed_at <> old.weighed_at or new.ticket_no <> old.ticket_no then
    raise exception 'Ticket % is printed: weights, product, truck, customer and price cannot change. Void it with a reason and weigh again.', old.ticket_no;
  end if;
  if old.void_reason is not null and new.void_reason is distinct from old.void_reason then
    raise exception 'Ticket % is already void', old.ticket_no;
  end if;
  return new;
end $$;
create trigger ticket_locked before update on tickets for each row execute function lock_ticket();

create function no_delete() returns trigger language plpgsql as $$
begin raise exception '% records are kept: void or close them instead of deleting', tg_table_name; end $$;
create trigger tickets_kept before delete on tickets for each row execute function no_delete();
create trigger royalty_returns_kept before delete on royalty_returns for each row execute function no_delete();

-- Every live ticket with its value and whether it left over the truck's limit.
create view v_tickets as
select t.id ticket_id, t.ticket_no, s.code site, b.code bridge, (t.weighed_at at time zone 'UTC')::date as day,
  t.weighed_at, k.rego truck, k.carrier, c.code customer_code, c.name customer, j.code job, p.code product,
  t.gross_t, t.tare_t, t.net_t, t.stored_tare, k.max_gross_t,
  case when k.max_gross_t is not null and t.gross_t > k.max_gross_t then round(t.gross_t - k.max_gross_t, 2) else 0 end over_t,
  t.price_per_t, t.cartage_per_t, p.price_per_t list_per_t,
  round(t.net_t * (t.price_per_t + t.cartage_per_t), 2) value, t.cash, t.paid, t.invoice_ref,
  t.site_id, t.product_id, t.customer_id, t.job_id
from tickets t join sites s on s.id = t.site_id left join weighbridges b on b.id = t.weighbridge_id
join trucks k on k.id = t.truck_id join customers c on c.id = t.customer_id
left join jobs j on j.id = t.job_id join products p on p.id = t.product_id
where t.void_reason is null;

create view v_job_progress as
select j.id job_id, j.code, j.status, c.name customer, j.name, p.code product, j.price_per_t, j.cartage_per_t, j.quoted_t,
  coalesce(sum(v.net_t), 0) delivered_t,
  case when j.quoted_t is null then null else round(j.quoted_t - coalesce(sum(v.net_t), 0), 2) end remaining_t,
  case when j.quoted_t is null then null else round(100 * coalesce(sum(v.net_t), 0) / j.quoted_t, 1) end pct,
  count(v.ticket_id) loads, max(v.day) last_load, c.credit_hold
from jobs j join customers c on c.id = j.customer_id join products p on p.id = j.product_id
left join v_tickets v on v.job_id = j.id
group by j.id, j.code, j.status, c.name, j.name, p.code, j.price_per_t, j.cartage_per_t, j.quoted_t, c.credit_hold;

-- Book stock: the last survey, plus production since, less tonnes sold since.
create view v_stock as
with pairs as (
  select site_id, product_id from surveys union select site_id, product_id from production
  union select site_id, product_id from tickets where void_reason is null
), last_survey as (
  select distinct on (site_id, product_id) site_id, product_id, surveyed_on, tonnes from surveys
  order by site_id, product_id, surveyed_on desc
)
select s.code site, p.code product, ls.surveyed_on last_survey, coalesce(ls.tonnes, 0) survey_t,
  coalesce((select sum(tonnes) from production x where x.site_id = pr.site_id and x.product_id = pr.product_id
    and (ls.surveyed_on is null or x.day > ls.surveyed_on)), 0) produced_t,
  coalesce((select sum(net_t) from v_tickets x where x.site_id = pr.site_id and x.product_id = pr.product_id
    and (ls.surveyed_on is null or x.day > ls.surveyed_on)), 0) sold_t,
  p.min_stock_t, pr.site_id, pr.product_id
from pairs pr join sites s on s.id = pr.site_id join products p on p.id = pr.product_id
left join last_survey ls on ls.site_id = pr.site_id and ls.product_id = pr.product_id;

create view v_stock_book as
select site, product, last_survey, survey_t, produced_t, sold_t, round(survey_t + produced_t - sold_t, 2) book_t, min_stock_t,
  (survey_t + produced_t - sold_t) < min_stock_t low, site_id, product_id
from v_stock;

-- Tonnes dispatched in the current consent year against the consent limit.
create view v_consent as
with yr as (
  select s.*, make_date(extract(year from current_date)::int - case when extract(month from current_date) < s.consent_year_starts then 1 else 0 end,
    s.consent_year_starts, 1) year_start
  from sites s
)
select y.code site, y.consent_ref, y.year_start, y.consent_limit_t,
  coalesce((select sum(net_t) from v_tickets v where v.site_id = y.id and v.day >= y.year_start), 0) dispatched_t,
  case when y.consent_limit_t is null then null else round(100 * coalesce((select sum(net_t) from v_tickets v where v.site_id = y.id and v.day >= y.year_start), 0) / y.consent_limit_t, 1) end pct,
  y.id site_id
from yr y;

-- One row per site and month with tonnes sold, from the first sale to last month.
-- A return is due on the 20th of the following month (house default; set yours).
create view v_royalties as
with months as (
  select v.site_id, date_trunc('month', v.day)::date period, sum(v.net_t) tonnes
  from v_tickets v where v.day < date_trunc('month', current_date)
  group by v.site_id, date_trunc('month', v.day)
)
select s.code site, s.royalty_payee payee, m.period, m.tonnes, s.royalty_per_t,
  round(m.tonnes * s.royalty_per_t, 2) amount, (m.period + interval '1 month' + interval '19 days')::date due,
  r.lodged_on, r.ref, s.id site_id
from months m join sites s on s.id = m.site_id left join royalty_returns r on r.site_id = m.site_id and r.period = m.period
where s.royalty_per_t is not null;

create view v_compliance as
select 'OVERLOAD' rule, ticket_no record,
  truck || ' left at ' || gross_t || ' t gross, ' || over_t || ' t over its ' || max_gross_t || ' t limit (' || day || ')' issue
from v_tickets where over_t > 0
union all
select 'TARE-STALE', rego, 'Stored tare ' || coalesce(tare_t::text, 'missing') || ' t taken ' || coalesce(tare_on::text, 'never') || ', older than 90 days'
from trucks where active and (tare_on is null or tare_on < current_date - 90)
union all
select 'MASS-LIMIT-MISSING', rego, 'No maximum gross mass recorded: the bridge cannot check this truck for overload'
from trucks where active and max_gross_t is null
union all
select 'CONSENT-LIMIT', site, dispatched_t || ' t of ' || consent_limit_t || ' t since ' || year_start || ' (' || pct || '%)'
from v_consent where pct >= 90
union all
select 'WEIGHBRIDGE-TEST', code, case when last_tested_on is null then 'No test on record' else 'Last tested ' || last_tested_on || ', due every ' || test_every_days || ' days' end
from weighbridges where last_tested_on is null or last_tested_on + test_every_days < current_date
union all
select 'SITE-MANAGER', code, case when manager_name is null then 'No quarry manager recorded'
  when manager_cert_expires is null then manager_name || ' has no certificate expiry recorded'
  else manager_name || ' certificate ' || coalesce(manager_cert, '') || ' expired ' || manager_cert_expires end
from sites where country = 'NZ' and (manager_name is null or manager_cert_expires is null or manager_cert_expires < current_date)
union all
select 'ROYALTY-RETURN', site || ' ' || to_char(period, 'YYYY-MM'), tonnes || ' t, ' || amount || ' to ' || coalesce(payee, 'the payee') || ', due ' || due
from v_royalties where lodged_on is null and due < current_date;

create view v_attention as
select 'cash load unpaid' kind, ticket_no record, day due, customer || ', ' || value detail from v_tickets where cash and not paid
union all
select 'loads not invoiced after 7 days', customer_code, min(day) + 7, count(*) || case when count(*) = 1 then ' load, ' else ' loads, ' end || sum(net_t) || ' t, ' || sum(value) || ', oldest ' || min(day)
from v_tickets where not cash and invoice_ref is null and day < current_date - 7 group by customer_code
union all
select 'job on credit hold', code, current_date, customer || ', ' || name from v_job_progress where status = 'open' and credit_hold
union all
select 'job near quoted tonnes', code, current_date, customer || ', ' || delivered_t || ' of ' || quoted_t || ' t' from v_job_progress where status = 'open' and pct >= 90
union all
select 'stock below minimum', site || ' ' || product, current_date, book_t || ' t on the book, minimum ' || min_stock_t || ' t' from v_stock_book where low
union all
select 'royalty return due', site || ' ' || to_char(period, 'YYYY-MM'), due, amount || ' to ' || coalesce(payee, 'the payee') from v_royalties where lodged_on is null
union all
select 'weighbridge test due', code, last_tested_on + test_every_days, name from weighbridges where last_tested_on is not null and last_tested_on + test_every_days < current_date + 30
union all
select 'manager certificate to renew', code, manager_cert_expires, coalesce(manager_name, '') from sites where manager_cert_expires is not null and manager_cert_expires < current_date + 60
union all
select 'tare re-weigh due', rego, coalesce(tare_on + 90, current_date), coalesce(carrier, '') from trucks where active and (tare_on is null or tare_on < current_date - 76)
union all
select 'consent limit close', site, current_date, pct || '% of ' || consent_limit_t || ' t used' from v_consent where pct >= 90;
