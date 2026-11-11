-- Fictional Kowhai Aggregates: two New Zealand sites and one in Queensland, four
-- weighbridges, six products, five customers, five jobs and about 120 tickets,
-- dated relative to today so there is always something to chase. Idempotent:
-- running it twice changes nothing and never resets operational changes.

insert into sites(code,name,country,consent_ref,consent_limit_t,consent_year_starts,manager_name,manager_cert,manager_cert_expires,royalty_payee,royalty_per_t)
select v.code,v.name,v.country,v.consent,v.lim,v.starts,v.mgr,v.cert,current_date+v.cert_days,v.payee,v.rate from (values
 ('KOW','Kowhai quarry','NZ','DEMO-RC-1043',250000::numeric,7,'Aroha Ngata','B-grade DEMO-118',40,'Kowhai Station (landowner)',0.85::numeric),
 ('TAR','Taranui river pit','NZ','DEMO-RC-2210',1500::numeric,extract(month from current_date-60)::int,'Mike Rowe','B-grade DEMO-207',-10,null,null),
 ('WAR','Warrill Creek quarry','AU','DEMO-DA-77',120000::numeric,7,'Dean Carter','DEMO-SSE-31',300,'Warrill landholder',0.60::numeric)
) v(code,name,country,consent,lim,starts,mgr,cert,cert_days,payee,rate)
on conflict (code) do nothing;

insert into weighbridges(code,site_id,name,verification_mark,last_tested_on,test_ref)
select v.code,s.id,v.name,v.mark,current_date-v.days,v.ref from (values
 ('KOW-1','KOW','Kowhai inbound bridge','DEMO-VM-5521',200,'DEMO-COA-881'),
 ('KOW-2','KOW','Kowhai outbound bridge','DEMO-VM-5522',400,'DEMO-COA-612'),
 ('TAR-1','TAR','Taranui bridge','DEMO-VM-6010',350,'DEMO-COA-700'),
 ('WAR-1','WAR','Warrill bridge','DEMO-VM-7101',100,'DEMO-COA-902')
) v(code,site,name,mark,days,ref) join sites s on s.code=v.site
on conflict (code) do nothing;

insert into products(code,name,price_per_t,min_stock_t) values
 ('AP40','GAP40 basecourse',32.00,2000),
 ('AP20','GAP20 driveway metal',38.00,0),
 ('SAND','Concrete sand',41.00,500),
 ('DRAIN','20-40 drainage metal',45.00,800),
 ('RIP','Rip rap 300-500',55.00,0),
 ('PIT','Pit run',18.00,0)
on conflict (code) do nothing;

insert into customers(code,name,email,phone,account,credit_hold) values
 ('HARBOUR','Harbour Civil','accounts@harbour-civil.example','09 400 2000',true,false),
 ('RIDGE','Ridgeline Earthworks','office@ridgeline.example','09 400 3000',true,true),
 ('KAHU','Kahu Landscapes','yard@kahu-landscapes.example','09 400 4000',true,false),
 ('NORTHSIDE','Northside District Roads','roads@northside.example','09 400 5000',true,false),
 ('CASH','Cash sales',null,null,false,false)
on conflict (code) do nothing;

insert into jobs(code,customer_id,name,address,product_id,price_per_t,cartage_per_t,quoted_t)
select v.code,c.id,v.name,v.address,p.id,v.price,v.cartage,v.quoted from (values
 ('J100','HARBOUR','Kaiwaka bypass subbase','State Highway 1, Kaiwaka','AP40',29.50::numeric,0::numeric,1200::numeric),
 ('J101','RIDGE','Lot 9 driveway','9 Totara Lane, Ruakaka','AP20',36.00::numeric,6.50::numeric,200::numeric),
 ('J102','NORTHSIDE','Reseal metal stockpile','Northside depot','AP20',34.00::numeric,0::numeric,5000::numeric),
 ('J103','KAHU','Garden centre sand','Kahu yard','SAND',40.00::numeric,0::numeric,null),
 ('J104','HARBOUR','Bridge abutment drainage','Kaiwaka stream bridge','DRAIN',44.00::numeric,0::numeric,300::numeric)
) v(code,customer,name,address,product,price,cartage,quoted)
join customers c on c.code=v.customer join products p on p.code=v.product
on conflict (code) do nothing;

insert into trucks(rego,carrier,tare_t,tare_on,max_gross_t)
select v.rego,v.carrier,v.tare,current_date-v.days,v.maxg from (values
 ('KTA101','Kowhai Transport',15.20::numeric,20,44.00::numeric),
 ('KTA102','Kowhai Transport',15.60::numeric,30,44.00::numeric),
 ('HCL55','Harbour Civil',16.10::numeric,200,46.00::numeric),
 ('RDG7','Ridgeline Earthworks',9.80::numeric,10,25.00::numeric),
 ('LND3','Kahu Landscapes',6.10::numeric,50,12.50::numeric),
 ('CAS123','Cash trailer',1.20::numeric,5,3.50::numeric),
 ('SUB9','Subbie Haulage',15.00::numeric,5,null),
 ('WAR22','Scenic Haulage',15.80::numeric,15,50.00::numeric)
) v(rego,carrier,tare,days,maxg)
on conflict (rego) do nothing;

-- Tickets. Each block: ticket number, site, bridge, truck, customer, job, product,
-- days ago, gross tonnes, price, cartage, cash, paid, invoice.
with t(no,site,bridge,truck,customer,job,product,days,mins,gross,price,cartage,cash,paid,inv) as (
  -- Harbour Civil subbase from Kowhai: 40 loads, 93% of the quoted tonnes.
  select 'K'||(1000+n), 'KOW', 'KOW-2', case when n%2=0 then 'KTA101' else 'KTA102' end, 'HARBOUR', 'J100', 'AP40',
    n%25+1, n*7, 44.00-(n%5)*0.30, 29.50::numeric, 0::numeric, false, false, case when n%25>=11 then 'INV-2041' end
  from generate_series(1,40) n
  union all
  -- Northside reseal metal from Taranui: 50 loads, close to the pit's consent limit.
  select 'T'||(2000+n), 'TAR', 'TAR-1', case when n%2=0 then 'KTA102' else 'SUB9' end, 'NORTHSIDE', 'J102', 'AP20',
    n%20+1, n*7, 43.50-(n%4)*0.20, 34.00, 0, false, false, case when n%20>=10 then 'INV-2042' end
  from generate_series(1,50) n
  union all
  -- Kahu Landscapes sand, and Harbour drainage metal, from Kowhai.
  select 'K'||(1100+n), 'KOW', 'KOW-1', 'LND3', 'KAHU', 'J103', 'SAND', n*3, 60+n, 12.00, 40.00, 0, false, false, case when n>=3 then 'INV-2043' end
  from generate_series(1,6) n
  union all
  select 'K'||(1200+n), 'KOW', 'KOW-2', 'HCL55', 'HARBOUR', 'J104', 'DRAIN', n*2, 90+n, 45.00, 44.00, 0, false, false, null
  from generate_series(1,4) n
  union all
  -- Warrill Creek: Harbour Civil at list price, no job.
  select 'W'||(100+n), 'WAR', 'WAR-1', 'WAR22', 'HARBOUR', null, 'AP40', n*2, 30+n, 49.00-(n%3)*0.40, 32.00, 0, false, false, case when n>=4 then 'INV-2044' end
  from generate_series(1,8) n
  union all
  select * from (values
   -- An overloaded truck over the Kowhai bridge, and one at Warrill Creek.
   ('K0999','KOW','KOW-2','KTA101','HARBOUR','J100','AP40',12,400,45.10,29.50,0::numeric,false,false,null::text),
   ('W0109','WAR','WAR-1','WAR22','HARBOUR',null,'AP40',3,500,50.60,32.00,0,false,false,null),
   -- Ridgeline loads before its account went on hold.
   ('K1301','KOW','KOW-2','RDG7','RIDGE','J101','AP20',40,300,24.20,36.00,6.50,false,false,'INV-1980'),
   ('K1302','KOW','KOW-2','RDG7','RIDGE','J101','AP20',33,310,24.40,36.00,6.50,false,false,null),
   -- Cash trailer loads, one not paid and one weighed under list price.
   ('K1401','KOW','KOW-1','CAS123','CASH',null,'DRAIN',2,200,2.90,45.00,0,true,true,null),
   ('K1402','KOW','KOW-1','CAS123','CASH',null,'AP20',1,210,3.10,38.00,0,true,false,null),
   ('K1403','KOW','KOW-1','CAS123','CASH',null,'SAND',4,220,2.70,39.00,0,true,true,null)
  ) x
)
insert into tickets(ticket_no,site_id,weighbridge_id,truck_id,customer_id,job_id,product_id,weighed_at,gross_t,tare_t,price_per_t,cartage_per_t,cash,paid,invoice_ref)
select t.no,s.id,b.id,k.id,c.id,j.id,p.id,((current_date-t.days)+time '07:00'+make_interval(mins=>t.mins)) at time zone 'UTC',
  t.gross,k.tare_t,t.price,t.cartage,t.cash,t.paid,t.inv
from t join sites s on s.code=t.site join weighbridges b on b.code=t.bridge join trucks k on k.rego=t.truck
join customers c on c.code=t.customer left join jobs j on j.code=t.job join products p on p.code=t.product
on conflict (ticket_no) do nothing;

-- Royalty months: a load two and three calendar months back at Kowhai, so one
-- return is lodged and the next is overdue whatever day this runs.
insert into tickets(ticket_no,site_id,weighbridge_id,truck_id,customer_id,job_id,product_id,weighed_at,gross_t,tare_t,price_per_t,cash,invoice_ref)
select v.no,s.id,b.id,k.id,c.id,null,p.id,((date_trunc('month',current_date)::date-v.back)+time '09:00') at time zone 'UTC',43.80,k.tare_t,32.00,false,v.inv
from (values ('K0990',40,'INV-1950'),('K0980',70,'INV-1901')) v(no,back,inv)
join sites s on s.code='KOW' join weighbridges b on b.code='KOW-2' join trucks k on k.rego='KTA102'
join customers c on c.code='HARBOUR' join products p on p.code='AP40'
on conflict (ticket_no) do nothing;

insert into royalty_returns(site_id,period,tonnes,amount,lodged_on,ref)
select s.id,date_trunc('month',date_trunc('month',current_date)::date-70)::date,28.20,round(28.20*0.85,2),date_trunc('month',current_date)::date-35,'DEMO-ROY-0412'
from sites s where s.code='KOW'
on conflict (site_id,period) do nothing;

insert into surveys(site_id,product_id,surveyed_on,tonnes,surveyor)
select s.id,p.id,current_date-v.days,v.t,'Demo Surveys Ltd' from (values
 ('KOW','AP40',35,4000::numeric),('KOW','SAND',35,600::numeric),('KOW','DRAIN',35,900::numeric),
 ('KOW','AP20',35,1500::numeric),('TAR','AP20',40,3000::numeric),('WAR','AP40',30,2500::numeric)
) v(site,product,days,t) join sites s on s.code=v.site join products p on p.code=v.product
on conflict (site_id,product_id,surveyed_on) do nothing;

insert into production(site_id,product_id,day,tonnes)
select s.id,p.id,current_date-v.days,v.t from (values
 ('KOW','AP40',20,900::numeric),('KOW','AP40',6,650::numeric),('KOW','SAND',14,120::numeric),('WAR','AP40',10,800::numeric)
) v(site,product,days,t) join sites s on s.code=v.site join products p on p.code=v.product
where not exists (select 1 from production x where x.site_id=s.id and x.product_id=p.id and x.day=current_date-v.days);

insert into notes(job_id,body)
select j.id,'Harbour asked to hold the last 80 t until the bypass inspection clears' from jobs j
where j.code='J100' and not exists (select 1 from notes n where n.job_id=j.id);
