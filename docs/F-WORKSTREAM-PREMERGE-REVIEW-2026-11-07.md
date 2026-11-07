# Momentum Distribution F workstream: pre-merge evidence and blockers

**Review date:** 2026-11-07 (Arizona). **Scope:** Canonical F01–F14 only.
**Source branch:** `prototype/unified-workspace-redesign-2026-11-03`.
**Merge/deploy status:** Not authorized. Prototype code, automated checks and permission-policy tests are not production acceptance.
**Rule:** No F requirement may be marked Accepted merely because a component compiles, a route exists, a test is green, or a view resembles a finished module.

## F01–F14 acceptance matrix

| ID | Requirement | Implementation / evidence | What prevents full acceptance |
|---|---|---|---|
| F01 | Separate Human Resources and Marketing | Distinct navigation groups and role-scoped self-service links; navigation test suite | Multi-role browser and cross-workstream navigation sign-off |
| F02 | HR specialist employee-management redesign | HR overview, employee records, workforce profiles, onboarding queue | Screen-by-screen browser parity review and real-role staging |
| F03 | Employee directory, profiles, onboarding, documents, leave, attendance, training, performance | Specialized registers, scoped drill-downs, exports; existing engines preserved | End-to-end edits/approvals/notifications and mobile acceptance |
| F04 | Separate Payroll with pay runs, approvals, earnings, liabilities, corrections, processing | Administrator-only payroll prototype and guarded local demo mutations | Production payroll provider, statutory tax validation, settlement and error handling |
| F05 | Employee-specific HR and payroll without companywide exposure | Scoping logic, employee payroll context filter, admin-only payroll deep link, Firestore rules/emulator coverage | Real-user privacy verification. Shared pay runs are not yet an approved employee pay-stub service |
| F06 | Production-ready onboarding, tax forms, signatures, compliance | Evidence and exception register; verified form metadata checks | Trusted signed originals, employer I-9 examination, Arizona reporting, secure signing, retention and legal approval |
| F07 | Marketing campaigns, ambassadors and measured outcomes | Campaign requests, approval/spend/material/partner prototype; ambassador tools retained; no invented default campaign | Connected production writes/authorizations, source-backed attribution and spend reconciliation evidence |
| F08 | Forecasts, Reports, Dashboards and drilldowns | Scoped cash views, exports, metrics, cash lookbacks, illustrative scenarios; unresolved refunds gate | Commerce-level multi-order refund mapping, bank/provider reconciliation, business-defined KPI targets, browser QA |
| F09 | Customer-support Cases | Demo intake, role visibility, assignment, allowed transitions, notes and history | Production per-case persistence, account-level server authorization, tamper-resistant audit, notifications |
| F10 | Documents with access controls | Scoped index of HR, training and approved asset metadata; safe external link handling | Secure authenticated file retrieval, signing, retention and original-byte verification |
| F11 | Preserve Administration, permissions, audit, integrations, data exchange | Legacy modules retained; readiness wording reviewed; integration selections preserved | Real environment authorization and integration operation acceptance |
| F12 | Administrator Employee Profiles and Directory | Administrator destinations, roster, detail subviews and scoped exports | Personnel editor and archived-employee parity testing |
| F13 | Department/role/user/action permissions | Route denials, Firestore/Storage tests, F-specific visibility and export filtering | Browser/staging with real claims, negative-action tests, approval of action matrix |
| F14 | Exclude Calls, Solutions, internal messaging and duplicate Gmail | Excluded from the redesign navigation and regression assertions | Final integrated navigation sweep across all workstreams |

## Deep-dive findings repaired in this branch

- Test-only orders and quality-held warehouse lots cannot inflate reporting aggregates.
- The Marketing state starts empty instead of displaying an invented campaign, approved logo asset or collateral inventory.
- Non-admin Marketing users see approved asset metadata only in the Documents index.
- Case events and assignments have stricter validation; sales reps need both case responsibility and continued account access.
- Browser-local demo case histories are not shown in connected mode.
- Scenarios and key cash KPIs fail closed when a settled refund applies to a payment spanning multiple orders. The underlying Commerce source has no refund invoice ID.
- Marketing spend cannot be marked locally reconciled without a recorded receipt reference and prior approval. This **does not** verify an external original or bank settlement.
- HR, Marketing, Reports, Documents and Cases include role and negative-access regression checks. None of these replaces manual signed-in-user acceptance.

## Manual acceptance sequence and owners

1. **Release coordinator / G:** Recheck that F commits are integrated with the latest main and all other specialist branches without overwriting work. Run complete integration CI. Owner: release coordinator.
2. **Administrator + one account per operational role:** Sign in as Administrator, Marketing, Operations, Warehouse, Delivery Driver, Sales Manager, Sales Representative, Brand Ambassador and Customer. Attempt every authorized/forbidden deep link, export and mutation. Record screenshots and source identities. Owner: designated platform QA.
3. **HR/Payroll owner:** Complete a real-form test with synthetic identity only: I-9 Section 1/2, W-4, Arizona A-4 where applicable, official original retention, restricted download, void/reissue, payroll settlement, and a denied unauthorized write. Owner: authorized HR/compliance reviewer and provider.
4. **Commerce owner / C:** Add an invoice/credit linkage to settled refunds or an audited, explicit allocation. Reconcile multi-order refunds across both different and same account representatives. Re-run F08 metrics. Owner: Commerce workflow.
5. **Support owner / F plus security reviewer:** Approve case record-level storage, signed-in account authorization, immutable/auditable event history, server-side validation and notification expectations before connected writes are enabled.
6. **Marketing owner / F plus commercial reviewer:** Verify approved asset source and QR link, request approvals, spend evidence, attribution source, and no inferred marketing revenue/ROI.
7. **Design reviewer + Mia:** Check phone/tablet/desktop screen sizes, error/empty/loading states, keyboard navigation and task-completion flows. Confirm the final copy/layout. No automated build proves this.
8. **Mia:** Only after the above evidence is recorded decide whether to approve merge and separately whether to approve deployment.

## Merge gate summary

**Code QA:** Check the latest exact-commit Actions workflow before accepting.
**Production acceptance:** **BLOCKED**, pending external/e2e proof for F04, F05, F06, F07, F09, F10 and F13 and unresolved Commerce refund attribution.
**Do not infer:** Completed payroll, filed official forms, connected e-signature, settled purchases, secured support backend, verified sell-through, commercial ROI, or a production-ready dashboard.
