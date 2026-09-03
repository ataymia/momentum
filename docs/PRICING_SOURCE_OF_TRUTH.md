# Momentum Pricing Source of Truth

Updated: 2026-09-03

## Confirmed commercial structure

- One Golden Eagle case contains 24 cans.
- Tier A is the same commercial state as Partner Pricing.
- Tier A / Partner Pricing is $24 per case, or $1.00 per can.
- Tier B is $27 per case.
- Tier C is $30 per case.
- A new ordering account begins at Tier A / Partner Pricing. The opening order starts the 60-day introductory pricing window.
- The retailer does not have to satisfy the sales-representative opening-bonus threshold in order to receive its introductory Tier A price. Customer pricing eligibility and employee bonus eligibility are separate rules.
- During the first 60 days, paid case volume is tracked against the 20-case continuation threshold.
- Reaching 20 paid cases during the introductory period carries Tier A / Partner Pricing into the next 90-day eligibility period.
- During each active 90-day Partner Pricing period, 20 paid cases are required to retain Tier A for the next period.
- If Partner Pricing lapses, the account is outside Tier A and uses an authorized Tier B or Tier C price.
- An account outside Partner Pricing can requalify for Tier A after restoring 20 paid cases inside the defined rolling 90-day requalification logic.
- The requalification order starts the new active 90-day Tier A period and is not counted a second time toward the next continuation threshold.

## Separate sales-representative bonus rule

The sales-representative account bonus does not control customer pricing.

- The first rep bonus is $25 only when the first order is at least 10 cases and its customer payment settles.
- Order placement starts the account-health timing and provides the claim/source record, but placement alone does not earn the bonus.
- Once a qualifying payment has first settled, that earning event is locked for compensation purposes. A later receivable reopening, refund, credit, or other customer-account correction does not automatically erase an already-earned rep bonus.
- A first order below 10 cases does not earn that opening $25 even though the retailer still begins at the Tier A introductory customer price.
- The second $25 milestone is independent and requires 40 cumulative cases whose qualifying payments first settle inside the 90-day account-health bonus window that starts on the first order date.
- Sales-representative bonuses are processed on the monthly payroll cadence after qualification has occurred.

## Refund boundary

The company has not yet approved a complete refund policy and Momentum must not invent one.

Current operating direction:

- Refunds are not a general satisfaction or change-of-mind policy.
- Retailers sample/taste the product before ordering, so dislike after purchase is not currently an approved refund basis.
- Refunds are expected only for a verified quality issue attributable to the company/product side, subject to the future formal policy and authority controls.
- Quality checks are part of the normal process and are intended to make those cases rare.
- No automatic employee-bonus clawback rule is approved. If leadership later wants a clawback or future-pay offset for a specific refund scenario, it must be defined explicitly before Momentum enforces it.

## Open commercial rule that must not be invented

The exact rule that determines whether an account outside Partner Pricing belongs in Tier B ($27) or Tier C ($30) is not yet defined in the platform source of truth.

Until that rule is approved:

- Momentum may display and enforce B or C when an authorized tier has been assigned.
- Momentum must not automatically choose B versus C based on an invented volume, channel, account-health, delinquency, or discretionary rule.
- The pricing engine may automatically determine whether Tier A / Partner Pricing is active under the confirmed Partner eligibility logic.
- Any later non-volume disqualifier or manual pricing exception must be modeled explicitly, with authority, effective date, reason, and audit history.

## Implementation control

Every customer-facing and internal order path must resolve price from one effective pricing decision before the order is created. UI labels, account health, customer portal, order entry, invoices, sales incentives, reporting, and audit history must not maintain competing price logic.
