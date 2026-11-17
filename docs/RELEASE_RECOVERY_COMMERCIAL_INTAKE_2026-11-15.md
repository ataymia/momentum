# Momentum connected release recovery: commercial intake through order-to-cash

**Recorded:** November 15, 2026 (America/Phoenix)
**Work branch:** integration/a-g-unified-2026-11-07
**Control:** This is engineering evidence, not owner acceptance, authorization to sell, or deployment permission.

## What the current connected code can do

1. An active Administrator or Sales Manager can create a prospective business/location without writing a verified tax status, credit limit, or price.
2. A manager can transfer a prospect to a permitted active representative, with server-controlled history and replay protection.
3. An assigned representative can qualify the prospect and record a physical Quick Visit and optional sample notation. A sample record alone does not post inventory custody.
4. An authorized sales employee can submit a **nonbinding** product-and-case order-intake request. The server validates the existing account, employee scope and canonical catalog, and stores immutable submission and audit evidence separately from the sales order ledger.
5. An Administrator can read the most recent 40 source intake requests. The queue does not authorize conversion into a sale; older requests may exist outside this view.

**Cross-domain automated evidence:** isolated Firestore emulator source records, replay, user-scope denials and transaction atomicity; test file \`functions/test/trusted-crm-lead-emulator.test.cjs\` follows one synthetic business from creation to the nonbinding order-intake record. \`functions/test/trusted-order-intake-emulator.test.cjs\` covers identity, manager scope, input forgery, duplicate submissions and non-posting.

## Not complete: source dependencies and release blockers

| Decision / workflow | Owner | Required verified source before release | Current position |
| --- | --- | --- | --- |
| Distribution rights and legal sales readiness | Business owner / Mia's authorized leadership | Current entities, territory rights, product/SKU authority and license/insurance review | Unverified in code; an intake is NOT a sale |
| Price and profitability approval | Business owner / Finance | Signed-off price book, discounts, minimums, true landed case cost, gross margin and approved terms | No server-authorized quote or committed priced order |
| Real order conversion | Sales / Administrator | Customer authority, quote acceptance, stock/lot and credit checks, distinct request→order ID trail, one Administrator decision | Not implemented for connected intake |
| Physical inventory custody | Operations | Receiving source, lot/expiry, physical on hand, reservations, pick/pack, delivery proof and exceptions | Not proven end to end |
| Invoicing and collected cash | Finance | Authorized invoices, processor/bank settlement, signed events, reversals and account allocations | No connected provider settlement; simulated Paid is not money |
| Actual payroll and commissions | HR / Finance | Accepted employment facts, trusted timecard review, payment-eligible sales and approved compensation rules | Not release-ready |
| Employee compliance onboarding | HR / legal reviewer | Verified current official forms, lawful signatures, I-9 handling, signed original retention and access | Not release-ready |
| Tenant/customer privacy | Engineering / security reviewer | Actual deployed server rules, multi-role cross-owner tests, restricted customer data views | Staging verification outstanding |

## Release evidence ladder

- **Built:** Code exists at a traceable SHA. It can still be broken, incomplete, or unsafe for connected data.
- **Automated verified:** Exact SHA passes logic, Firestore/Storage security, Functions transaction emulator, compilation/lint and production build.
- **Browser verified:** Relevant UI SHA passes isolated, synthetic navigation and device-role browser checks.
- **Staging verified:** Authorized, non-production Firebase environment with separate real authentication sessions proves create, readback, retries, incorrect roles, stale state, changing ownership, session transitions and no unwanted downstream writes.
- **Owner accepted:** Mia explicitly signs off the entire applicable R or A–G requirement and its exceptions.
- **Released:** Explicitly authorized merge/deployment, rollback plan and observed production evidence.

The original **98 A01–G10 IDs** are separate from **R01–R87** owner corrections. \`docs/USER_CORRECTION_REGISTER_R01_R77_2026-11-07.md\` is historical and only contains R01–R77; do not represent it as the complete 87-correction ledger. No owner acceptance is implied by this document.

## Now / Next / Later

**Now:** Preserve the green exact-head CI and commit lineage. Obtain authorization for isolated staging and run an Administrator → Sales Manager → Sales Representative → unauthorized-role test journey with synthetic accounts. Capture Firebase project, function revision, source record IDs and negative-case evidence.

**Next:** Resolve legal distribution and price/cost prerequisites, then implement server-authorized quote and order conversion with distinct approval, inventory and invoicing gates. In parallel, select and verify an external HR document/signature workflow before any onboarding original is treated as compliant.

**Later:** Provider-settled payments, actual payroll and commissions, returns/reconciliation and scorecards built on financially trustworthy records, then owner acceptance and production rollout.

**Release decision remains NO DEPLOY.** Mia must authorize staging setup, external spending, provider connections, production merge and deployment separately.
