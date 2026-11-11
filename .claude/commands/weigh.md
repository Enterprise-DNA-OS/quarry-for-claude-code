---
description: Weigh a load out: the ticket for one truck
---

Run `npm run quarry -- weigh <truck> --site=.. --job=.. --gross=t` (or `--customer=.. --product=..` for a load with no job; `--tare=t` when the truck is weighed empty; `--cash` to take cash). The system refuses an overloaded truck, a stale stored tare, a customer on credit hold, a closed job and a load that takes the site past its consent limit. Never work around a refusal: say why it stopped and what fixes it. Read the record back after the change and show it. If a name is ambiguous, list the candidates and ask which one.
