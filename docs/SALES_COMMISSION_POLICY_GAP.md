# Sales commission implementation gap

## Approved rate structure

The approved standard split for representative-generated qualifying sales is:

- Sales Representative: 2.50% of Qualifying Net Collected Sales
- Sales Manager override: 0.50% of Qualifying Net Collected Sales
- Maximum standard combined commission on the same qualifying revenue: 3.00%

This replaces the prior 1.50% representative + 0.50% manager standard split prospectively once the compensation change has a written effective date.

## Current platform gap

Momentum currently has a fixed sales-representative account bonus engine for the opening and sustained-account bonuses, but it does not yet have a complete percentage-commission ledger feeding payroll.

Do not implement percentage payout by simply multiplying paid order totals. The governing definition is Qualifying Net Collected Sales, which means revenue actually received and retained by Momentum and excludes applicable non-retained amounts such as refunds, returns, credits, rebates, promotional allowances, chargebacks, uncollected invoices, bad debt, customer discounts, separately charged freight, sales taxes, and other amounts not ultimately retained as product sales revenue.

The current commerce model can represent cleared/reversed payments, payment allocations, applied credits, and settled refunds. It does not yet separately classify every exclusion named by the compensation plan. Any commission engine must therefore fail closed when required exclusion data is unavailable rather than treating gross invoiced revenue as commissionable revenue.

## Required controls before payroll integration

1. Record the written effective date of the 2.50% + 0.50% structure. Do not recalculate already-earned commission under a later rate.
2. Define and store immutable commission attribution for each qualifying sale or earning event, including credited representative and credited manager/override recipient where applicable.
3. Build a commission earnings ledger from reconciled collection events and qualifying adjustments, not from current account ownership alone.
4. Link refunds, credits, reversals, and other qualifying adjustments back to the original earning so future payroll can adjust without rewriting released payroll history.
5. Produce a commission statement showing account, qualifying net collected sales, rate/allocation, earning date, adjustments, and resulting commission.
6. Keep the fixed new-account bonus program separate from percentage commission.
7. Add tests for reporting-line changes, account transfers, payment reversals, settled refunds, applied credits, duplicate payment allocations, and already-consumed payroll earnings.

## Open business control

The new rate's written effective date is not yet recorded in the platform requirements. Until it is, percentage commission must not be auto-calculated or added to a payroll run.
