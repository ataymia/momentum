# E01–E09 premerge deep audit
Review date: 2026-11-07
Repository: ataymia/momentum
Workstream branch: workstream/e-operations-2026-11-06
Draft PR: https://github.com/ataymia/momentum/pull/170
Original E branch base: b6f837ce9125e77f8887ee66e806bf4d4a99afe8

## Independent recommendation
**NO-GO for live release or direct merge.** Code-level work substantially improves E01–E09, but purchasing is deliberately disconnected and restricted to an isolated local demonstration. Office Dispatch has not reached replacement parity. Other specialist work advanced the shared prototype after E branched, so automatic file replacement would discard code. Exact-head CI and staged multi-role acceptance are required, and Mia has not authorized a merge or deployment.

## Requirement-by-requirement audit

| ID | Confirmed code on E | Current readiness |
| --- | --- | --- |
| E01 | Lot-level searchable/sortable inventory with quality hold, aged best-by, reservation and custody exceptions in inventory-experience.tsx | Prototype built; connected warehouse/UI acceptance pending |
| E02 | Existing adjustment, package, shipment and ledger directories retained, supported by fulfillment-experience.tsx and existing ledger/policy | Partial; complete audited write workflows and real exception parity missing |
| E03 | inventory-locations-experience.tsx now provides physical warehouse/bin/quality-hold locations, movement/custody/variance drilldowns with restricted role access | Built read-only; physical warehouse and multi-location reconciliation pending |
| E04 | driver-route-board.tsx provides assigned-only stop manifest, address-to-maps links and recorded task/proof states | Prototype built; real route ordering/ETA and physical mobile/browser QA pending |
| E05 | Delivery operations compares signed proof, order status, posted quantities and custody; flags overposted cases and loaded/departed orders without full recorded outbound | Read-only management view built; live exception workflows and browser QA pending |
| E06 | rep-self-delivery.tsx redesigned into a dedicated order/recipient-signature workspace retaining existing server repSelfDelivery endpoint and cloud reconciliation | New UI built; multi-role cloud and mobile staging testing pending |
| E07 | Original legacy office dispatch-board.tsx and route explicitly retained; regression guard added | NOT retired; parity in scheduling, reassignment, geofence, exceptions and driver route controls missing |
| E08 | purchasing-experience.tsx provides separate Vendors, Expenses, Purchase Orders, Purchase Receipts, Bills, Payments Made and Vendor Credits screens, local forms, search/filter/sort, record-detail drilldowns and event evidence | Isolated local demo; secure production backend, real suppliers, A/P/stock provider integrations missing |
| E09 | purchasing-review.ts provides PO and bill validation, independent approvals, exact three-way matching, duplicate invoice protection, bounded credit/payment notes and local audit events | Isolated pure policy; server permissions, ledger transactions and verified financial reconciliation missing |

## Source and data-integrity findings
1. Purchasing mutations require demo runtime, local persistence and absence of Firebase session context. Live financial and inventory records are not changed.
2. Purchase receipts never increase live on-hand quantity. Receipt inventoryPosted is false and the physical batch/warehouse data is a local review note, not a ledger posting. The existing inventory ledger also synthesizes opening DEMO receipts from initial lot records; these balances are not evidence of physically verified receiving. The location UI warns about this distinction.
3. The purchasing SKU selector uses catalog IDs, NOT a claim of current supplier-approved SKU availability. User-entered quoted prices are not an approved vendor price book.
4. Payment references never authorize bank transfers or establish settlement. Unverified payment notes do not reduce supplier payable. Credit requests require independent local review; supplier/GL verification is still unimplemented.
5. The local demo audit can be edited by the device owner. It is NOT a tamper-proof production audit, and client routes/role checks are NOT server authorization.
6. Drivers receive only their own tasks in the stop manifest. The manifest makes no GPS, optimized ETA, live navigation or automatic route-sequencing claims.
7. Existing rep self-delivery endpoint retains server-side signed steps, signature capture, cloud confirmation, and deduplication/retry controls. New UI calls the existing endpoint rather than mutating inventory from the browser.
8. Preview decision rights are proposed, not management-approved: Administrator registers vendors and approves POs, bills, credits and expenses; Operations can prepare POs, bills, credit requests and expenses; Warehouse can record PO receipts; payment notes are Administrator-only, never bank-executed.
9. The legacy office Dispatch creates, schedules, moves and reassigns appointments. The new delivery status queue does not replace all these capabilities, so retirement is unsafe.

## Merge and integration conflicts
The shared prototype branch advanced independently after the E branch point, including updates to HR, Insights, Marketing and administration. Exact overlaps require integration in:
- components/prototype/operations-hub.tsx: preserve newer HR/Insights imports and routes while incorporating E purchasing, locations and rep-self-delivery.
- lib/navigation-route-registry.ts: preserve updated F permissions and add E route-state/role rules for purchasing, inventory locations and self-delivery.
- package.json: union new E tests and all upstream tests without deleting scripts.
- tests/navigation-role-routes.test.ts: preserve upstream role expectations and adapt self-delivery to the new prototype-backed route.

A previous attempt to copy the newer shared hub without its actual dependent components caused missing-module build errors. It was reverted. Do not overwrite those four shared files with E copies during consolidation. Resolve conflicts with full source and CI review on a dedicated integration commit only after approval.

## Required acceptance before merge
1. Final E commit exact SHA: TypeScript, ESLint, all logic regressions, Firestore/Storage emulator security tests, generated rules integrity, Firebase Functions compile/lint, Next production build and unchanged tracked source must all pass.
2. Integration commit: run the same full audit after reconciling overlapping E/A/F routes, imports, tests and module files. A green isolated E branch is insufficient.
3. Authenticated browser/staging: Administrator, Operations, Warehouse, Sales Representative, Delivery Driver and Customer route access; Back/Forward, refresh and deep links; phone/tablet; real signature/pick/lot/exception flows; multi-tab concurrency and offline retries.
4. Purchasing production: approve the supplier record-of-truth, user/action rights, separate reviewer policy, approval dollar limits, receiving/discrepancy controls, document evidence, payable ledger, bank disbursement and settlement verification. Add authenticated server operations and immutable audit before handling real liabilities.
5. Dispatch migration: prove every existing office feature and its exceptions is preserved before hiding/removing the legacy page.
6. Mia expressly approves the integration, staging and eventual release separately. No merge/deployment has been authorized.

## MASTER HANDOFF
Workstream E, date November 7, 2026.
Decisions and facts: Draft E workstream isolated; no production purchasing activation; self-delivery server functionality preserved; office Dispatch stays. Actual customer/vendor, pricing and inventory data have not been invented.
Assumptions and open questions: Purchasing role model is provisional; official vendors, cost/terms, accounting source, approval limits and routing provider are unverified; existing dispatch retirement depends on actual feature parity.
Actions: E engineer to pass exact-head audit and reconcile failures, then coordinate manual shared-file integration with owners A/F; Operations and Finance to approve decision rights and real receiving/accounts-payable workflow; Mia to review and explicitly authorize integration or release. Deadlines not confirmed.
KPIs affected: warehouse variance, order accuracy, delivery closeout integrity, three-way invoice mismatch, payables reconciliation. No operational or financial gain measured.
Blockers and escalation: branch conflict, missing trusted backend, audit/permission testing, missing staging and mobile acceptance, authority to post inventory or disburse.
Master updates: keep E01–E09 unchecked until independently accepted; record exact SHA/test links and the four integration conflicts. Recommended next decision: assign purchasing system-of-record and independent approval authority.
