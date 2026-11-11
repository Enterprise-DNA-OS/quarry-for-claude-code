# Record checks for quarries and pits

Sources checked 11 November 2026. This system checks your own records against the rules below and lists what is missing, late or out of line. It does not certify a weighbridge, replace your quarry manager, your Chain of Responsibility procedures or your consent monitoring, and it is not legal advice.

## The rules behind the checks

**Chain of Responsibility (Australia).** Under the [Heavy Vehicle National Law, section 26C](https://www.legislation.qld.gov.au/view/whole/html/inforce/2026-08-01/act-2012-hvnlq), each party in the chain of responsibility for a heavy vehicle "must ensure, so far as is reasonably practicable, the safety of the party's transport activities relating to the vehicle". The [NHVR's list of parties](https://www.nhvr.gov.au/safety-accreditation-compliance/chain-of-responsibility/the-primary-duty/parties-in-the-cor) includes anyone who consigns goods for transport by a heavy vehicle and anyone who loads one. A quarry that loads and weighs trucks is both.

**Vehicle mass (New Zealand).** Mass limits for heavy vehicles are set by the Land Transport Rule: Vehicle Dimensions and Mass 2016, administered by NZ Transport Agency Waka Kotahi. Your Health and Safety at Work Act duties as a business loading those trucks sit alongside it.

**Weighbridges used for trade (New Zealand).** Trading Standards says that if you use a weighbridge for trade "it must be approved by Trading Standards" and "must also have the mark of verification stamped upon it", and recommends you "have your weighbridge tested annually and issued with a Certificate of Accuracy" ([Trade Measurement: weighbridges](https://trademeasurement.tradingstandards.govt.nz/for-business/equipment-used-for-weighing-and-measuring/weighbridges/)). In Australia, weighing instruments used for trade are regulated under the National Measurement Act 1960 and verified by licensed verifiers. Check the interval your verifier and your customers expect.

**Quarry manager (New Zealand).** The Health and Safety at Work (Mining Operations and Quarrying Operations) Regulations 2016 require a quarry operation to have a manager who holds the certificate of competence for that kind of operation. WorkSafe issues and renews certificates of competence. Record the certificate and its expiry for each site.

**Resource consent or development approval.** Most quarries and pits operate under a consent (NZ, Resource Management Act 1991) or a development approval (AU, the state planning law) whose conditions often limit the tonnes extracted or sent out each year. The limit, the consent year and how tonnes are measured are in your own conditions. Enter them per site.

**Royalties.** Royalties on extracted material are set by your lease, landowner agreement or the state or Crown regime that applies to your site. The rate, payee and due date are yours to enter.

## Implemented checks

| Rule | What it finds | Default | Basis |
|---|---|---|---|
| OVERLOAD | A ticket where gross mass was over the truck's recorded maximum gross mass | Any amount over | HVNL s26C (AU) and the Vehicle Dimensions and Mass Rule (NZ). `/weigh` refuses the load; the check finds imported or past tickets. |
| MASS-LIMIT-MISSING | An active truck with no maximum gross mass recorded | Missing limit | House rule: the bridge cannot check a truck for overload without one. |
| TARE-STALE | An active truck whose stored tare is older than 90 days or missing | 90 days | House rule for accurate net weights and mass checks. Set the interval in your CoR procedure. |
| CONSENT-LIMIT | A site that has sent out 90% or more of its consent tonnes this consent year | 90% warning; `/weigh` refuses a load that takes it over | Your consent or approval conditions. |
| WEIGHBRIDGE-TEST | A weighbridge with no test on record, or past its test interval | 365 days | Trading Standards recommends an annual test and Certificate of Accuracy (NZ). Set yours per bridge. |
| SITE-MANAGER | A New Zealand site with no quarry manager recorded, no certificate expiry, or an expired certificate | Any gap | Mining Operations and Quarrying Operations Regulations 2016. |
| ROYALTY-RETURN | A month with sales and a royalty rate but no return lodged, past the due date | Due the 20th of the following month | Your royalty agreement. The due day is a house default. |

`/attention` also lists bridges due for a test in the next 30 days, certificates expiring in the next 60 days, tares due for a re-weigh, stockpiles under their minimum and jobs past 90% of their quoted tonnes.

## What it does not do

- It does not read the weighbridge indicator. Weights are entered as read off the bridge or imported from the weighbridge system's export.
- It does not check axle group masses, load restraint or driver fatigue. Those stay in your CoR procedures.
- It does not lodge anything with a regulator, council or landowner. `/draft-royalty` and the consent report draft what you send.
- It does not decide what your consent conditions mean. Enter the limit and year your conditions set.
