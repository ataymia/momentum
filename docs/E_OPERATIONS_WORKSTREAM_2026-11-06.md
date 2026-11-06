# E workstream handoff: operations, fulfillment and purchasing
Date: 2026-11-06 | Owner: E specialist | Branch: workstream/e-operations-2026-11-06
Base (unchanged): prototype/unified-workspace-redesign-2026-11-03 at b6f837ce9125e77f8887ee66e806bf4d4a99afe8
Draft review: https://github.com/ataymia/momentum/pull/170

## Release boundary
Nothing in this workstream is deployed, merged or user-accepted. No live purchasing record, warehouse receipt posting, actual vendor liability, supplier credit, bank settlement, delivery ETA, driver GPS tracking or route optimization is created. All new purchasing mutations require BOTH demo runtime AND local persistence. Current connected purchasing records have no verified source, so connected mode remains explicitly read-only. Real fulfillment and rep self-delivery engines are preserved.

## Canonical checklist (IDs and candid status)
| ID | Code delivered / preserved | Status and missing acceptance |
| --- | --- | --- |
| E01 | Existing inventory/lot directory supplemented by best-by, quality, negative custody and over-reservation exception filters. | Built prototype; UI, connected data and mobile QA pending; not accepted. |
| E02 | Existing adjustments, packages, shipments and movement ledger views retained. Fulfillment operations now show detected reconciliation issues. | Partial; live adjustment/packages transaction parity and end-to-end tests pending. |
| E03 | Existing inventory nodes, lots, reservations and movements retained. New read-only assessment flags quality, aging and custody risks without changing availability. | Partial; warehouse reconciliation, live traceability and FEFO policy need approval. |
| E04 | Mobile driver shell now shows assigned-only delivery stop manifest and user-triggered map destination links, without invented route/ETA. | Partial; real route planning, navigation/provider choice and physical mobile QA pending. |
| E05 | Existing statuses, signatures, custody ledger and delivery workflow preserved; management queue adds sorting, date filters, evidence exception filter, signature/posted-case comparison. | Partial; provider GPS, route sequencing, browser acceptance and exception resolution testing pending. |
| E06 | Existing rep self-delivery route and server workflow intentionally unchanged. | Retained, regression testing pending; no redesign completion claim. |
| E07 | Existing office Dispatch intentionally NOT retired. | Blocked pending route, allocation, dispatch exception, reassignment, staff permission and delivery parity verification. |
| E08 | Seven linked purchasing directories with distinct forms and records: vendors, expenses, purchase orders, purchase receipts, bills, payments made and vendor credits. | Built isolated local prototype. No real secure backend, supplier onboarding, A/P posting, bank settlement or posted inventory receipts. |
| E09 | Pure purchase transition engine: order validation; submit/independent approval; supplier/lot/warehouse receipt validation; unique supplier invoices; exact three-way match; independent bill/expense/credit reviews; bounded pending references; who/what/when review history. | Built isolated policy + regression tests. No server authorization, tamper-proof audit, external financial reconciliation or production approvals. |

## Normal flow and controls (new review prototype)
1. Administrator registers an actual *entered* supplier, not a seeded fictional vendor. Purchasing actor prepares a one-SKU purchase order, selecting an existing product ID and entering quoted USD cost, whole cases, warehouse and expected date.
2. Purchasing submits PO. A different administrator approves; the preparer cannot self-approve. Approved PO is the prerequisite for receiving.
3. Operations/warehouse records actual counted cases, batch/lot, best-by and the PO warehouse. Quantity must not exceed unreceived PO cases. The record remains **pending inventory posting**. It does not modify the operational custody ledger.
4. Administrator enters supplier invoice number, billed cases and amount. Duplicate invoice numbers per vendor and order overbilling are blocked. Another administrator checks approved PO, recorded receipt coverage, and exact invoice-to-PO amount before approval.
5. Payment references are review-only, never proof of settlement and never reduce the verified payable. Credit requests stay pending until independent local review, and even approved local credits require external document verification and financial-ledger integration before production use. The external bank/payment process remains outside the demo.
6. Every transition records actor ID, time, action, record ID and control note in the local review. Browser storage is editable by the browser owner; **this audit is NOT tamper-proof**.

## Exceptions and required owner decisions
- **Authorization (critical):** Confirm who may onboard vendors, submit/approve POs and bills, record physical receipts, approve credits and reconcile disbursements. Demo defaults are conservative; do not transplant client roles to production.
- **Supplier finance:** Confirm approved vendor records, purchase terms, currencies, taxes, freight, landed cost allocation, invoice approval thresholds, PO lines and multi-warehouse support. One-SKU-per-PO is a prototype limitation.
- **Stock and FEFO:** Approve receiving discrepancy process, quarantine, damaged and over/short count handling, lot uniqueness, best-by hold/disposal rules, return-to-vendor and immutable posting/reversal strategy.
- **Delivery:** Confirm preferred driver routing service and ETA capabilities, stop ownership, reassignment/rep self-delivery parity and when office dispatch can be safely hidden.
- **Systems of record:** Specify Firestore collections/security and approved backend transactional stock posting, vendor invoice ledger and settlement provider. Do not use local demo records as live liabilities.

## Cross-functional dependencies
- D09 / D16: delivery-order-invoice/payment reconciliation and provider confirmation.
- F13 and G07/G10: enforce per-record permissions and tamper-proof audit server-side, then real multi-role staging tests.
- A01/A02/A11: deep links, mobile layout, browser refresh/Back tests.
- Company finance approval: supplier, landed costs, disbursement authority and accounting source of truth.

## Acceptance and release checklist
- Automated TypeScript, ESLint, logic tests, Firestore/Storage emulator tests, Functions lint/build and Next build on exact E branch HEAD must pass. Earlier green SHAs are not proof of final commit.
- Admin/Operations/Warehouse/Sales Rep/Delivery Driver/Customer account isolation, unauthorized mutations, duplicated receipt/payment, multi-user races, offline replay and cross-record reference injection must be tested in staging.
- Physical warehouse count, FIFO/FEFO and traceability must be reconciled to inventory ledger; payment references must be verified against bank settlement before reducing A/P.
- Driver mobile browser, Back/Forward/refresh, actual signature capture, reassignments and administrator override must pass acceptance.
- Mia explicitly authorizes any integration, merge, staging or deployment. Draft PR is **not** authorization.

## MASTER HANDOFF
Workstream E | 2026-11-06
Verified: repository branch and source-code changes in draft PR #170; preservation of the legacy self-delivery and office dispatch routes. No live outcomes verified.
Actions: E engineering to resolve exact-SHA CI, wire backend only after authorization model and receiving/AP rules are approved; Mia/authorized executive to decide stock/disbursement roles and permitted live integration. Deadlines: **not confirmed**.
KPI affected: potential stock variance, on-time delivery, proof-of-delivery completeness, 3-way invoice mismatch and payable reconciliation. These remain **metrics to define**, not proven results.
Blockers: backend source, server access, approved supplier terms, physical warehouse controls, commercial order linkage, staging and Mia's release approval.
Recommended next decision: approve the purchasing/receiving decision-rights matrix and designate the backend record-of-truth owner before enabling live inventory or supplier money movement.
