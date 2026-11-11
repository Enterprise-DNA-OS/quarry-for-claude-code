<h1 align="center">Quarry for Claude Code</h1>

<p align="center">
  <strong>The open-source quarry weighbridge, sales and compliance system that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Works with Claude Code, Codex, OpenCode or Cursor.
</p>

<!-- three-doors -->
<table align="center">
  <tr>
    <td align="center"><strong>Do it yourself</strong><br/>Clone it, run it, own it. Free, MIT.<br/><a href="#quick-start">Quick start</a></td>
    <td align="center"><strong>We customise it</strong><br/>Your fields, your rules, your WinWeigh data brought across.<br/><a href="https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=winweigh">Book a call</a></td>
    <td align="center"><strong>We run it for you</strong><br/>Installed, connected and operated inside Omni. Setup fee, then a retainer.<br/><a href="https://enterprisedna.co/omni/instead-of/winweigh?utm_source=github&utm_medium=readme&utm_campaign=winweigh">How it works</a></td>
  </tr>
</table>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#instead-of-winweigh">Instead of WinWeigh</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Quarry for Claude Code does the job you pay WinWeigh for, as a Postgres database and a set of agent commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) (or Codex, OpenCode, Cursor: see `AGENTS.md`) and ask for what you want in plain language. It runs the right query, and it can answer questions the WinWeigh dashboard cannot.

NWI does not publish WinWeigh prices: the software is quoted on request, with the cloud portal, the Chain of Responsibility automation levels, cameras, plate recognition, RFID, boom gates and driver terminals scoped on top. Ask for your own invoice total, software and support, before you compare.

Want the same thing with a web front end, or built on a different stack? That is a customisation, and it is exactly what Enterprise DNA does: [book a call](https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=winweigh).

It is for quarries, sand and gravel pits and landscape supply yards in New Zealand and Australia, with one to a handful of sites. It holds the weighbridge tickets, customers, jobs and contract prices, trucks with their stored tares and mass limits, stockpiles, consent tonnes and royalty returns in one database: what went over the bridge today, which truck left overloaded, which site is close to its consent limit, which royalty return is owed and which stockpile is running low. It does not read your weighbridge indicator or open the boom gate.

The fictional Kowhai Aggregates demo has three sites, four weighbridges and about 120 tickets. Two trucks left over their mass limit, one stored tare is 200 days old, the Taranui pit has used 93% of its consent tonnes, a weighbridge is overdue for its test, a quarry manager's certificate has expired, a royalty return is late, the drainage metal stockpile is under its minimum and a cash load went out below list price.

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them. No export, no lock-in.
- No seats, no tiers, no add-ons. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/quarry-for-claude-code.git
cd quarry-for-claude-code
npm install
npm run demo
```

Then open the folder in Claude Code and type `/gate-open` for the check before the first truck, or `/attention` for everything that needs chasing. `npm run view` writes the week, compliance and stockpile views to `views/`; `npm run docs` writes weighbridge tickets, statements, royalty summaries and consent reports to `docs-out/`, in the brand set in `brand.json`.

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-seat fee.

## The commands

The working week, in the weighbridge office's and the quarry manager's words: `/gate-open` before the first truck, `/weigh` as each load goes out, `/day-end` at close, `/month-end` for royalties and consent, `/quarry-manager` for the manager's review, `/weekly-review` on Monday.

| Command | What it does |
|---|---|
| `/add` | Add a site, weighbridge, product, customer, job or truck |
| `/attention` | What needs chasing today: unpaid cash, loads to invoice, credit holds, low stock, royalties, tests, certificates, tares, consent |
| `/carrier-loads` | Loads per carrier over 90 days: average net, how close to the limit, overloads |
| `/close` | Close a job so nothing more is weighed against it |
| `/compliance` | Check the records against the rules this industry lives under (the ones listed in docs/compliance.md) and report what is missing, late, or about to breach, with the rule cited. |
| `/consent` | Tonnes dispatched this consent year against each site consent limit |
| `/customer-tonnes` | Tonnes and value per customer over the last 90 days |
| `/customers` | Customers, cash or account, and who is on credit hold |
| `/customise` | Make this system yours in plain language. Add a field, rename stages, change a rule, add a column to a document. Writes the migration, applies it, updates the commands that touch it. |
| `/day-end` | The end of day check at the weighbridge |
| `/day-sales` | Loads, tonnes and value by site and product for one day |
| `/draft-royalty` | Draft a site's royalty return for a month from the tickets |
| `/draft-statement` | Draft the list of a customer's loads waiting to be invoiced |
| `/export` | Export every record to JSON files |
| `/gate-open` | The weighbridge check before the first truck |
| `/hold` | Put a customer on or off credit hold |
| `/import` | Bring customers, products, vehicles and weighing history across from WinWeigh CSV exports |
| `/invoice` | Record the invoice reference for one ticket or every open account load for a customer |
| `/job-progress` | Open jobs by how much of the quoted tonnes has gone out |
| `/job` | One job with its tickets and notes |
| `/jobs` | Every job with quoted, delivered and remaining tonnes |
| `/lodge-royalty` | Record a royalty return as lodged |
| `/log` | Add a note to a job or a site |
| `/manager` | Record the quarry manager and their certificate for a site |
| `/month-end` | The month-end close: royalties, consent, stock and invoicing |
| `/new-view` | Add a read-only HTML view (a dashboard page) from a plain-language description, rendered in the operator's brand by `npm run view`. |
| `/overloads` | Tickets where the truck left over its maximum gross mass |
| `/paid` | Mark a cash load paid |
| `/price-check` | Loads charged below the job price or list price, and what it cost |
| `/produce` | Record tonnes crushed or screened into a stockpile |
| `/product-sales` | Tonnes, value and average price per product and site over 30 days |
| `/products` | Products with list price per tonne and the minimum stock to hold |
| `/quarry-manager` | The quarry manager's review: compliance, consent, stock and weighbridges |
| `/royalties` | Royalty tonnes and amounts by site and month, lodged or owed |
| `/site` | One site: consent, stock, weighbridges and notes |
| `/sites` | Sites with consent limits, quarry managers and royalty rates |
| `/stock` | Book stock per site and product from the last survey, production and sales |
| `/survey` | Record a stockpile survey, which resets book stock |
| `/tare-due` | Trucks whose stored tare is overdue or due for a re-weigh |
| `/tare` | Record a truck weighed empty as its new stored tare |
| `/test-bridge` | Record a weighbridge test or certificate of accuracy |
| `/ticket` | One weighbridge ticket in full |
| `/tickets` | The latest 200 weighbridge tickets with weights and value |
| `/today` | Every load over the bridge today, in time order |
| `/trucks` | Trucks with carrier, stored tare, tare date and maximum gross mass |
| `/uninvoiced` | Account loads with no invoice reference, oldest first |
| `/unpaid` | Cash loads that have not been paid |
| `/void` | Void a wrong ticket with the reason |
| `/weekly-review` | The Monday review written from the tickets, the jobs and the checks |
| `/weigh` | Weigh a load out: the ticket for one truck |
| `/weighbridges` | Each weighbridge, its verification mark, last test and when the next is due |

Every command runs `npm run quarry -- <command>`; add `--json` for machine output. Codes and names match without case; a prefix works when it is unique. An ambiguous name lists the candidates and exits with status 1. A printed ticket keeps its weights, product, truck, customer and price, and tickets and royalty returns cannot be deleted.

## Ten questions to ask

Each one runs against the demo today.

1. Which trucks left over their mass limit, and whose were they? `overloads`
2. How close is each site to its consent tonnes for the year? `consent`
3. Which royalty returns are owed, how much, and to whom? `royalties`
4. Which stockpiles are below the level we want on hand? `stock`
5. Which loads went out below the agreed or list price, and what did it cost us? `price-check`
6. Which trucks are running on a stored tare that is too old? `tare-due`
7. Which carriers load closest to their limit, and how often do they go over? `carrier-loads`
8. Which jobs are about to pass their quoted tonnes? `job-progress`
9. Which account loads have not been invoiced, oldest first? `uninvoiced`
10. What did each site sell yesterday, by product? `day-sales --date=YYYY-MM-DD`

## Your first hour: ten things to ask for

1. Put our business name, logo and colours in brand.json.
2. Add our sites with their consent references, consent limits and the month our consent year starts.
3. Import our customers, products, vehicles and last year's tickets from WinWeigh and compare the tonnes by month.
4. Set the stored tare limit to the one our Chain of Responsibility procedure uses.
5. Add a minimum stock level for every product we sell.
6. Add the royalty rate and payee for each site from our agreements.
7. Add a delivery address and a cartage zone to every job.
8. Add a view of today's loads by carrier for the loader drivers.
9. Put our terms of trade on the customer statement.
10. Move the database to a hosted Postgres with backups.

## Instead of WinWeigh

Export your customer, product and vehicle lists and your weighing records from WinWeigh as CSV and run `/import`, dry run first. [docs/replace-winweigh.md](docs/replace-winweigh.md) covers the headings, mapping files and what does not carry over in the free version (the indicator link, cameras, boom gates, driver terminals and payment terminals).

The record checks and their sources are in [docs/compliance.md](docs/compliance.md). They check your records; they do not certify a weighbridge, replace your quarry manager or tell you that you comply with your consent.

Not affiliated with or endorsed by NWI Group.

## Architecture

```
quarry-for-claude-code/
  CLAUDE.md                 how the operator wants this run (routing table + house rules)
  AGENTS.md                 the same, for Codex / OpenCode / Cursor / Gemini CLI
  .claude/commands/         the slash commands
  scripts/                  the CLI the commands drive
  scripts/lib/db.mjs        one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/      plain SQL schema
  supabase/seed.sql         demo data
  docs/                     the thesis and the migration guide
```

## Built for coding agents

The database, CLI and command recipes work with Claude Code, Codex, OpenCode or Cursor. Ask your coding agent for a new command and have it implement and test the change against the same records.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end.

## Want it installed and run for you?

Enterprise DNA installs Quarry for Claude Code for your business, migrates your WinWeigh data, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: [enterprisedna.co/omni/book](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=winweigh)
- Read more: [enterprisedna.co/omni/instead-of/winweigh](https://enterprisedna.co/omni/instead-of/winweigh?utm_source=github&utm_medium=readme&utm_campaign=winweigh)

## License

MIT. Copyright (c) 2026 Enterprise DNA.
