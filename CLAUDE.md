# Quarry for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Business:** [YOUR BUSINESS]
- **Operator:** [YOUR NAME], [your role]
- **What matters most:** [the one or two outcomes you care about]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything about a record, read its full history first.
3. **Plain language.** Short sentences. No filler. Numbers in tables.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or faces a customer waits for a yes in this session.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| the check before the first truck | `/gate-open` |
| weigh a load out, print a ticket | `/weigh` |
| a truck weighed empty | `/tare` |
| a wrong ticket | `/void` |
| what needs chasing | `/attention` |
| today's loads, the end of the day | `/today`, `/day-end` |
| sales for a day | `/day-sales` |
| jobs and quoted tonnes | `/jobs`, `/job-progress`, `/job` |
| one ticket or one site | `/ticket`, `/site` |
| overloads and mass limits | `/overloads`, `/carrier-loads` |
| stored tares | `/tare-due` |
| consent tonnes | `/consent` |
| royalties | `/royalties`, `/draft-royalty`, `/lodge-royalty` |
| stockpiles | `/stock`, `/produce`, `/survey` |
| invoices and cash | `/uninvoiced`, `/invoice`, `/unpaid`, `/paid`, `/draft-statement` |
| prices charged below agreed | `/price-check` |
| customers and products | `/customers`, `/customer-tonnes`, `/products`, `/product-sales` |
| weighbridge tests | `/weighbridges`, `/test-bridge` |
| the quarry manager and certificate | `/manager`, `/quarry-manager` |
| credit hold, closing a job | `/hold`, `/close` |
| the month-end close | `/month-end` |
| the Monday review | `/weekly-review` |
| records against the rules | `/compliance` |
| new site, bridge, product, customer, job or truck | `/add` |
| a note | `/log` |
| bring data from WinWeigh | `/import` |
| a copy of everything | `/export` |
| sites, bridges, trucks, tickets lists | `/sites`, `/weighbridges`, `/trucks`, `/tickets` |
| change a field or rule | `/customise` |
| a new dashboard | `/new-view` |

If an ask fits nothing here, run the CLI directly (`npm run quarry -- help`) and then propose a new command for it.

## Hard rules

- Never send email or messages from here. Draft to `drafts/`, a person sends.
- Never delete records without an explicit yes in this session. Prefer marking closed or archived.
- Never invent a record. If a name is ambiguous, list the candidates and ask.
- The database is the source of truth. If the answer is not in it, say so.
- A printed ticket keeps its weights, product, truck, customer and price. A wrong ticket is voided with a reason and weighed again, never edited.
- Never weigh out a load the system refuses (overload, stale tare, credit hold, consent limit). Say why it stopped and what fixes it.
- Weights come off the weighbridge. Never type a weight nobody read.
- The record checks in `docs/compliance.md` are house defaults. Do not tell anyone their site complies; say what the records show.

## Where things live

- `scripts/` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `docs/` the record checks and their sources, the thesis and the guide for moving off WinWeigh.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/winweigh
