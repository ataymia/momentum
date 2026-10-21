# Momentum Administrator Audit Center

## Status and deployment boundary
The audit is a read-only Administrator-only review under Administration. It does not correct punches, change wages, attribute misconduct, or modify GPS records. [PR #76](https://github.com/ataymia/momentum/pull/76) owns the existing ten-Phoenix-day field route retention and midnight job. Do not replace or duplicate those services. This PR requires CI, authenticated role smoke tests, and release-owner signoff before deployment.

## Sitewide midnight clock-out
`functions/src/workforce-retention.ts` runs at 00:01 America/Phoenix and iterates the Firestore `userDomains` documents. For **every employee role**, open prior-day punches are marked `clockOut: 23:59`, `clockOutAt` at midnight and a distinct `Automatically closed at Arizona midnight` note. The server audit retains the affected punch IDs. Closing a stale punch **does not verify hours worked**. Payroll holds unreviewed auto-closures for correction and review under the existing timekeeping workflow. The Admin Audit Center surfaces these exceptions across the selected people; it does not modify the closure.

## Physical repeat-visit audit
**Source:** `crm.interactions` where `type=Visit`, `physicalVisit=true`, with a valid `userId`, stable `locationId`, and timestamp inside the selected period. A saved visit record is an activity log, not independent proof a person arrived. Geolocation does not create or increment visit counts. `locationId` can be a linked customer location or an **unlinked Quick Visit** identifier derived from normalized input business name; freehand records may describe the same physical business using different IDs. Do not silently merge those identifiers by name.

**Metrics:** Each rep and location combination has `visits = count(qualifying Visit IDs)`; `return visits = max(0, visits - 1)` within the selected period; `distinct visit days = count(unique Phoenix business dates)`; `unsuccessful visits = count(visits with visitUnsuccessful=true)`; `selected-team visits = sum(visits across selected employees for the exact locationId)`. Show first/last timestamps and each recorded visit date. Two visits logged on one day count as two records and one distinct day. Company-wide totals require selecting all staff, not just one rep.

**Sales linkage:** A location's paid-order count is shown only when the location is linked to an actual account and the order is credited to the rep, fully paid and settled in the selected period. An unlinked Quick Visit never creates a customer sale or account automatically. Existing paid-order and net-collected rules remain authoritative.

**Other sales metrics:** Overall distinct locations visited is the denominator for visit-to-order conversion. Repeats add visit workload, **not** more unique prospects. Return visits and locations revisited are explanatory activity measures, not performance targets that outweigh paid commercial outcomes.

## Order-based sales definition and CRM autonomy
- **Accounts sold:** Count distinct account IDs with non-cancelled orders credited to the rep and placed during the selected Phoenix reporting period. Unpaid orders count; paid invoices are not required to establish an order-based sale. Seven orders on one account count as seven orders and **one account sold**. Cancelled orders are excluded. Date-only `placedAt` values use their actual Arizona calendar date, without UTC conversion.
- **Visit-to-order:** Distinct locations visited by the rep in the period with a qualifying order on or after the first logged visit's date, divided by unique locations visited. Repeated stops do not inflate the denominator.
- **New-account-to-order:** Newly opened accounts with qualifying placed orders divided by newly opened accounts in the period. Current ownership and historic account creation remain separate.
- **Owned-book ordering:** Currently owned accounts with qualifying non-cancelled orders placed in the period divided by current owned accounts. Payment-status and cash-collection reports remain separate.
- **Prospect autonomy:** Sales staff are not required to set callback dates or next actions in CRM interactions, opportunities, account detail, or visit closeout. The Dashboard and Admin Audit do not flag overdue prospect follow-up dates. Existing historical fields remain stored for backward compatibility and must not cause account deletion. Pricing expirations and actual account inactivity remain valid commercial signals.
- **Interface:** Default to Sales tab, other audit modules opt-in. Omit boilerplate explanations, account follow-up exception panels, and metric limitations from user-facing PDF and UI. Preserve internal source/metric definitions in this document for audit traceability.

## Governance and audit limitations
| Control | Rule |
| --- | --- |
| Frequency | Run weekly, compare week over week using the same date windows |
| Review owner | Director of Operations or authorized Administrator |
| Underlying source of truth | Existing CRM, account, order, payment, HCM, timekeeping, and field-tracking records |
| Data availability | Older GPS expires after ten Phoenix calendar days; timekeeping and CRM records have independent storage and retention |
| Exclusions | Nonphysical interactions, samples, call notes, unverified inferred locations, CRM events outside period, unlinked visit-to-order conversion |
| Gaming risk | Repeated visits, duplicate manually logged visits, renaming Quick Visit businesses, backdated records, and meaningless log entries can increase activity counts |
| Audit method | Investigate unusual repetition with original interaction IDs and source timestamps; compare contact outcomes, account creation, settled orders, and field evidence where available |
| Action | Investigate repeated unsuccessful visits without sales advancement, verify duplicate activity logs, revisit territory and account strategy; do not infer lost work time or misconduct from gaps |
| Access | Administrator-only audit UI and PDF generation; validate authentication and Firestore permission rules during release QA |
| Exports | PDFs are confidential and should be stored in restricted company-controlled locations |

## Release acceptance
1. Confirm scheduler iterates multiple real employee roles and preserves pay history; verify existing midnight closure marker is visible for each relevant employee.
2. Record two visits to a linked business, one to another, and one freehand Quick Visit; check per-rep counts and distinct dates.
3. Have a second rep visit the same linked business; confirm the per-rep totals remain separate while selected-team total includes both.
4. Verify zero-visit and zero-order denominator behavior, settled refunds, and no GPS coordinates in the PDF.
5. Confirm non-admin cannot open or export the audit through the UI or backend. Approve deployment only after authenticated production-like tests and owner signoff.
