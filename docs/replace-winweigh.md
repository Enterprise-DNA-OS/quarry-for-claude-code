# Moving from WinWeigh

WinWeigh can export reports to CSV and send data to accounting systems by CSV upload or API. Export four files and bring them across in one command, with a dry run first.

## 1. Export from WinWeigh

Save these as CSV in one folder. File names decide what each file is:

| File name starts with | What it holds | Columns read (first match wins) |
|---|---|---|
| `Customers` | Customer accounts | Customer Code or Account Code or Code; Customer Name or Name; Email; Phone; Account Type (Cash or Account); On Hold |
| `Products` | Product list | Product Code or Code; Product Name or Description or Name; Price or Unit Price or Price per Tonne |
| `Vehicles` or `Trucks` | Trucks and stored tares | Registration or Rego or Vehicle; Carrier or Owner or Haulier; Tare or Tare Weight; Tare Date; Max Gross or GVM or GCM or Mass Limit |
| `Transactions`, `Tickets`, `Weighings` or `Dockets` | Weighing records | Ticket No or Docket No; Date (YYYY-MM-DD or DD/MM/YYYY); Time; Site; Registration; Customer Code; Product Code; Gross; Tare; Net; Unit Price; Invoice |

Report headings differ between installs. If yours use other names, write a mapping file:

```json
{ "customers": { "Customer Code": "Acct No", "Customer Name": "Account Name" },
  "tickets": { "Ticket No": "Docket", "Gross": "Gross (t)" } }
```

## 2. Add your sites

Sites are not in the exports. Add each one first, with the code used in the weighing records:

```bash
npm run quarry -- add site KOW "Kowhai quarry" --country=NZ --consent=RC-1043 --limit=250000 --year-starts=7 --royalty=0.85 --payee="Kowhai Station"
npm run quarry -- add bridge KOW-1 "Inbound bridge" --site=KOW --tested=2026-06-01
```

## 3. Import, dry run first

```bash
npm run quarry -- import winweigh ./winweigh-export --dry-run
npm run quarry -- import winweigh ./winweigh-export --map=map.json
```

The dry run reports the rows per file and changes nothing. The real run is one transaction: one bad row and nothing is written. Running it again updates customers, products and vehicles and leaves tickets already held as they are. Each ticket's net is checked against gross less tare.

## 4. Check the counts

Compare tonnes by month with a WinWeigh report: `npm run docs -- consent-report`, or ask Claude Code for tonnes by site and month.

## What maps

- Customers, with cash or account and credit hold.
- Products and list prices.
- Trucks with carrier, stored tare and maximum gross mass.
- Weighing records with weights, price and invoice number. Imported tickets count toward consent tonnes and royalties, and the overload check runs over them.

## What does not carry over in the free version

- The weighbridge indicator link, cameras, plate recognition, RFID, boom gates, traffic lights and unmanned driver terminals. The free version takes weights you enter or import.
- Payment terminal links and accounting integration. Invoice references are recorded; invoices are raised in your accounts system.
- Jobs and contract pricing, unless your export carries them. Add them with `/add`.
- Seasonal pricing and voucher programs.

Enterprise DNA connects the weighbridge, cameras and accounts and brings across the history you agree, as part of a customised install.
