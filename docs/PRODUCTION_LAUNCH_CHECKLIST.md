# Momentum Production Launch Checklist

## Scoring model

This is the authoritative running checklist for the product-layer launch audit. `INT-*` items are the internal 90% that can be completed before external production services are connected. `EXT-*` items are the reserved final 10% for production integrations.

Current baseline after audit pass: **256/272 internal items checked = 84.7% of the 90-point internal layer. External: 0/13 = 0.0%. Overall production readiness: 84.7%.**

A checked item means the capability has current code/evidence and has passed its most recent applicable static/unit/control review. The release-candidate gate stays unchecked until one exact frozen SHA passes lint, TypeScript, all logic tests, static export, artifact verification, and final acceptance smoke tests.

Run `npm run readiness` for the machine-counted score. Business/legal configuration gates are tracked separately because they are not software integrations and must not be guessed.

## Release, build, and runtime
- [x] INT-REL-001 Node/runtime version is pinned for the supported build.
- [x] INT-REL-002 Lint runs in the release workflow.
- [x] INT-REL-003 TypeScript no-emit type checking runs in the release workflow.
- [x] INT-REL-004 Expanded logic test suite is wired into CI.
- [ ] INT-REL-005 Exact launch-candidate SHA passes every logic test.
- [ ] INT-REL-006 Exact launch-candidate SHA completes static export.
- [ ] INT-REL-007 Exported Pages artifact passes artifact verification.
- [x] INT-REL-008 Demo-only seed/reset behavior is separated from production runtime mode.
- [x] INT-REL-009 Demo warehouse identity and demo-only SKU are blocked outside demo runtime.
- [ ] INT-REL-010 Frozen launch candidate receives final role-by-role smoke test with no code changes afterward.

## Identity, session, roles, and navigation
- [x] INT-IAM-001 Defined roles are Administrator, Sales Manager, Sales Representative, Operations, Warehouse, and Customer.
- [x] INT-IAM-002 Page-level navigation is role scoped.
- [x] INT-IAM-003 Customer navigation is limited to customer-facing areas.
- [x] INT-IAM-004 Administrator has company-wide product-layer scope.
- [x] INT-IAM-005 Sales Manager scope uses direct reports and explicitly managed teams.
- [x] INT-IAM-006 Same-team membership alone does not grant management authority.
- [x] INT-IAM-007 Sales Representative sales scope is limited to responsible accounts and own field work.
- [x] INT-IAM-008 Operations and Warehouse scopes exclude unrelated CRM/people administration.
- [x] INT-IAM-009 Manager self-approval is blocked where a second approver is required.
- [x] INT-IAM-010 Breadcrumb/navigation targets are functional rather than display-only.
- [ ] INT-IAM-011 All independent authorization helpers are reconciled to the centralized scope model.

## Canonical data and persistence safety
- [x] INT-DATA-001 Workspace hydration validates users and rejects forged canonical identities.
- [x] INT-DATA-002 Workspace hydration validates account ownership and cross-record references.
- [x] INT-DATA-003 Workspace hydration validates order amounts against cases times price.
- [x] INT-DATA-004 Workspace hydration refuses unsupported Paid state without settlement evidence.
- [x] INT-DATA-005 Workspace hydration validates inventory lot quantities and recalculates availability.
- [x] INT-DATA-006 Workspace hydration validates appointments, time records, approvals, placements, notifications, and bulletins.
- [x] INT-DATA-007 Enhanced commercial overlay hydration validates account patches, orders, appointments, approvals, activities, and inventory lots.
- [x] INT-DATA-008 HCM hydration validates employee-linked records and cross-record relationships.
- [x] INT-DATA-009 Malformed persisted records fail closed instead of silently becoming authoritative.
- [x] INT-DATA-010 Arizona calendar utilities are used for company-date business logic.
- [ ] INT-DATA-011 Final repository sweep confirms no remaining UTC-date business logic where Arizona local date is required.

## CRM, accounts, contacts, opportunities, and responsibility
- [x] INT-CRM-001 Account creation requires complete minimum account/contact fields.
- [x] INT-CRM-002 Account duplicate detection blocks duplicate creation.
- [x] INT-CRM-003 Account search and stage filtering work within role scope.
- [x] INT-CRM-004 Commercial account classification fields are editable only by allowed roles.
- [x] INT-CRM-005 Pricing tier changes are restricted to authorized management.
- [x] INT-CRM-006 Multiple CRM contacts support Customer and Location scope.
- [x] INT-CRM-007 Only one primary contact survives per contact scope.
- [x] INT-CRM-008 CRM interactions validate location/contact relationship.
- [x] INT-CRM-009 Interactions enforce paired next-action and next-action date.
- [x] INT-CRM-010 Opportunity creation is scoped to visible locations and canonical responsibility.
- [x] INT-CRM-011 Opportunity lifecycle enforces valid Open/Won/Lost stage/status combinations.
- [x] INT-CRM-012 Lost opportunities require a loss reason.
- [x] INT-CRM-013 Account responsibility transfer is restricted to allowed sales management scope.
- [x] INT-CRM-014 Historical sales attribution is not rewritten by later account ownership changes.
- [x] INT-CRM-015 Historical CRM responsibility chain is preserved when canonical ownership changes.
- [x] INT-CRM-016 Responsibility history is rebuilt/reconciled from canonical transfer evidence when necessary.
- [x] INT-CRM-017 Account detail links to scheduling and order drafting preserve exact account focus.
- [x] INT-CRM-018 Account history exposes linked orders, placement, activities, pricing, and responsible user.

## Pricing and sales incentives
- [x] INT-PRICE-001 Partner Pricing engine uses source orders instead of editable account totals.
- [x] INT-PRICE-002 Introductory Partner Pricing uses the configured 60-day measurement period.
- [x] INT-PRICE-003 Opening Partner Pricing qualification uses the 10-case opening threshold.
- [x] INT-PRICE-004 Partner continuation counts paid cases only.
- [x] INT-PRICE-005 Partner continuation threshold is 20 paid cases per eligibility period.
- [x] INT-PRICE-006 Outside-Partner B/C fallback is explicit rather than silently invented.
- [x] INT-BONUS-001 Sales-rep opening bonus requires a qualifying first order of at least 10 cases.
- [x] INT-BONUS-002 Opening $25 is earned only after qualifying payment settlement.
- [x] INT-BONUS-003 Sustained $25 milestone uses 40 total settled cases, including the opening order.
- [x] INT-BONUS-004 Sustained milestone uses the 90-day account window.
- [x] INT-BONUS-005 10 opening plus 29 additional cases does not earn the second bonus.
- [x] INT-BONUS-006 10 opening plus 30 additional cases earns the second bonus when settlement timing qualifies.
- [x] INT-BONUS-007 A qualifying 40-case opening order can earn both milestones after settlement.
- [x] INT-BONUS-008 Bonus evidence retains source order IDs and settlement dates.

## Orders, approval, and customer ordering
- [x] INT-ORD-001 Order creation is limited to permitted roles and visible accounts.
- [x] INT-ORD-002 Order quantity requires positive whole cases.
- [x] INT-ORD-003 Order product must exist in canonical inventory.
- [x] INT-ORD-004 Order price comes from current pricing engine, not user-entered binding price.
- [x] INT-ORD-005 Order amount is derived from cases times current price.
- [x] INT-ORD-006 Order creation requires explicit current custody availability and has no silent inventory fallback.
- [x] INT-ORD-007 Low-stock state creates the required approval path.
- [x] INT-ORD-008 Source placement linkage is validated to account and product.
- [x] INT-ORD-009 Customer self-service ordering is constrained to linked customer accounts.
- [x] INT-ORD-010 Order approval cannot be performed by an unauthorized requester.
- [x] INT-ORD-011 Fulfillment status can only advance through the allowed sequence.
- [x] INT-ORD-012 Sales roles cannot directly advance warehouse fulfillment.
- [x] INT-ORD-013 Paid account lifetime cases/reorders are recomputed from source paid orders when settlement changes.
- [x] INT-ORD-014 Corrected replacement order flow re-evaluates current pricing and inventory.
- [ ] INT-ORD-015 Final caller audit proves every UI/import/reorder path supplies custody-ledger availability rather than stale lot availability.

## Inventory, custody, fulfillment, and warehouse controls
- [x] INT-INV-001 Inventory uses lot-level records with received/best-by dates.
- [x] INT-INV-002 Quality-hold inventory is not treated as sellable availability.
- [x] INT-INV-003 Reservations are represented by custody/ledger source events rather than CSV-editable reserved balances.
- [x] INT-INV-004 CSV inventory import rejects nonzero reserved quantity.
- [x] INT-INV-005 Inventory import validates dates, quantities, product, lot code, and duplicate lot code.
- [x] INT-INV-006 Inventory product status is derived from custody ledger.
- [x] INT-INV-007 Order allocation checks reservation evidence.
- [x] INT-INV-008 Out-for-delivery transition checks outbound custody movement.
- [x] INT-INV-009 Delivered transition checks delivered quantity evidence.
- [x] INT-INV-010 Low-stock/reorder conditions surface in Action Center.
- [x] INT-INV-011 Inventory reporting uses custody-ledger on-hand/available values.
- [x] INT-INV-012 Warehouse and Operations permissions are separated from sales permissions.
- [x] INT-INV-013 Physical inventory data can be exported for audit/reconciliation.
- [ ] INT-INV-014 Final end-to-end inventory regression covers receive to reserve to allocate to outbound to delivered to reversal/exception.

## Dispatch, scheduling, and field execution
- [x] INT-DSP-001 Schedule creation validates date, time, duration, objective, account, and role scope.
- [x] INT-DSP-002 Sales representatives can only assign their own field work.
- [x] INT-DSP-003 Sales managers can schedule within managed sales scope.
- [x] INT-DSP-004 Operations schedule assignment is constrained to Operations scope.
- [x] INT-DSP-005 Appointment reassignment requires management authority and Scheduled state.
- [x] INT-DSP-006 Drag/move schedule changes validate new owner/date/time.
- [x] INT-DSP-007 Unassigned due work surfaces as an Action Center item.
- [x] INT-DSP-008 Appointment closeout requires outcome, note, next action, and next-action date.
- [x] INT-DSP-009 Completed appointment updates account next-action evidence.
- [x] INT-DSP-010 Dispatch board company-date logic uses Arizona local dates.

## Field geolocation
- [x] INT-GEO-001 Continuous field tracking applies only to Sales Representatives.
- [x] INT-GEO-002 Continuous field tracking requires an active time entry.
- [x] INT-GEO-003 Tracked work requires assignment to the current rep.
- [x] INT-GEO-004 Arrival capture requires a usable geolocation reading.
- [x] INT-GEO-005 Fixed geofence rule is applied consistently.
- [x] INT-GEO-006 GPS accuracy limits are enforced.
- [x] INT-GEO-007 Arrival verification produces traceable evidence.
- [x] INT-GEO-008 Route samples are retained during active tracked field work.
- [x] INT-GEO-009 Sustained outside-geofence movement produces departure evidence/alert.
- [x] INT-GEO-010 Offsite exceptions require documented reason/evidence.
- [x] INT-GEO-011 Tracked appointment closeout records location/geofence decision.
- [x] INT-GEO-012 Rep clock-out/logout is blocked while an active tracked field visit requires closeout.

## Retail placement and reorder evidence
- [x] INT-RET-001 Placement records are linked to exact accounts and products.
- [x] INT-RET-002 Placement observations validate nonnegative stock/facings/price.
- [x] INT-RET-003 Placement source distinguishes physical count, customer estimate, and demo POS feed.
- [x] INT-RET-004 Placement health/status is recorded separately from sales claims.
- [x] INT-RET-005 Placement history can launch a source-linked reorder draft.
- [x] INT-RET-006 Reorder metrics derive from paid order/account evidence.

## Commerce, receivables, payments, credits, refunds
- [x] INT-COM-001 Invoices are source-linked to orders/accounts.
- [x] INT-COM-002 Invoice terms and due dates are admin-controlled.
- [x] INT-COM-003 Payment record amount cannot exceed recordable invoice amount.
- [x] INT-COM-004 Cleared payment requires valid settlement evidence.
- [x] INT-COM-005 Payment allocations link exact payment and invoice records.
- [x] INT-COM-006 Payment failure is represented separately from clearing.
- [x] INT-COM-007 Cleared payments can be reversed with reason/evidence.
- [x] INT-COM-008 Order Paid/Partially paid/Open state reconciles from cleared payment allocations.
- [x] INT-COM-009 Credits cannot exceed allowed invoice balance.
- [x] INT-COM-010 Credit approval and application are separate states.
- [x] INT-COM-011 Refund requests retain payment source, amount, reason, and evidence.
- [x] INT-COM-012 Refund approval, sent, settled, and failed states remain distinct.
- [x] INT-COM-013 Voiding an invoice is controlled and requires reason.
- [x] INT-COM-014 Cash-management mutations are restricted to Administrator product-layer authority.

## Accounting and finance controls
- [x] INT-ACC-001 Source commerce/payroll events can generate accounting events.
- [x] INT-ACC-002 Unprocessed accounting events surface for review.
- [x] INT-ACC-003 Accounting source reversals remain traceable.
- [x] INT-ACC-004 Accounting event dates use source/effective business dates.
- [x] INT-ACC-005 Period lock controls prevent rewriting locked accounting periods.
- [x] INT-FIN-001 Employee expense submissions retain requester, merchant, amount, business purpose, and receipt metadata.
- [x] INT-FIN-002 Expense manager review is scoped through centralized management authority.
- [x] INT-FIN-003 Finance approval and payment-ready states remain distinct.
- [x] INT-FIN-004 Employee-facing finance totals are limited to visible expenses, not company-wide aggregates.
- [x] INT-FIN-005 Action Center deep-links exact expense records.
- [ ] INT-FIN-006 Final audit confirms no aggregate finance/accounting metric leaks across role scope.

## Timekeeping and timecards
- [x] INT-TIME-001 Clock-in/clock-out records are tied to authenticated user.
- [x] INT-TIME-002 Meal start/end are recorded as separate events.
- [x] INT-TIME-003 Timecard submission preserves week boundaries and source entries.
- [x] INT-TIME-004 Manager approval cannot approve own timecard.
- [x] INT-TIME-005 Time corrections require reason and preserve before-state evidence.
- [x] INT-TIME-006 Raw time-entry/timecard CSV import is intentionally blocked.
- [x] INT-TIME-007 Timekeeping company dates use Arizona local calendar.
- [x] INT-TIME-008 Shift punctuality evidence reports variance without inventing a late threshold.

## People, HCM, benefits, talent, and employee lifecycle
- [x] INT-HCM-001 Employee employment record and manager hierarchy exist.
- [x] INT-HCM-002 Employee private-profile changes use request/review workflow.
- [x] INT-HCM-003 Private employee data is excluded from ordinary coworker directory view.
- [x] INT-HCM-004 Document metadata supports category, version, status, effective/expiry, and acknowledgment.
- [x] INT-HCM-005 Policy acknowledgment binds to exact policy version.
- [x] INT-HCM-006 PTO policies, assignments, and append-only ledger model are present.
- [x] INT-HCM-007 Approved PTO usage must reconcile exactly to one approved leave request.
- [x] INT-HCM-008 Duplicate PTO deduction for one leave request is blocked.
- [x] INT-HCM-009 Availability is self-service scoped.
- [x] INT-HCM-010 Shift creation/update is management scoped.
- [x] INT-HCM-011 Shift requests retain request and decision separately.
- [x] INT-HCM-012 Benefit plans support plan years and tiers.
- [x] INT-HCM-013 Dependents are employee-owned and enrollment-linked.
- [x] INT-HCM-014 Benefit enrollment validates plan/tier/dependent relationships.
- [x] INT-HCM-015 Overlapping active enrollment in the same plan is blocked.
- [x] INT-HCM-016 Benefit life events use employee submission and management review.
- [x] INT-HCM-017 Compensation records are effective-dated.
- [x] INT-HCM-018 Compensation change requests remain separate from approved compensation records.
- [x] INT-HCM-019 Recruiting supports requisitions, candidates, interviews, and offers.
- [x] INT-HCM-020 Sales Manager recruiting actions are limited to assigned requisitions.
- [x] INT-HCM-021 Onboarding/offboarding use lifecycle task ledgers.
- [x] INT-HCM-022 Training supports course catalog, assignment, completion evidence, and score.
- [x] INT-HCM-023 Performance reviews separate employee submission, manager review, rating, and acknowledgment.
- [x] INT-HCM-024 HR workflows and tasks retain owner/source/status evidence.
- [x] INT-HCM-025 HCM mutation boundary requires authenticated actor and matching audit event.
- [x] INT-HCM-026 HCM persisted-state hydration rejects forged identities and malformed financial/benefit evidence.
- [x] INT-HCM-027 HCM business-date logic uses Arizona local date.

## Payroll
- [x] INT-PAY-001 Payroll employee/pay-group configuration exists.
- [x] INT-PAY-002 Pay groups support configurable pay frequency and overtime threshold.
- [x] INT-PAY-003 Payroll consumes effective HCM compensation rather than a duplicate pay-rate source.
- [x] INT-PAY-004 Regular payroll requires approved/payroll-ready source timecards.
- [x] INT-PAY-005 Overlapping or out-of-period source timecards are rejected.
- [x] INT-PAY-006 Hourly regular/overtime hours are derived from source time entries.
- [x] INT-PAY-007 Benefit deductions derive from active benefit enrollment and configured tax treatment.
- [x] INT-PAY-008 Unconfigured benefit tax treatment blocks pay-line calculation.
- [x] INT-PAY-009 Employee withholding percentages/deductions are validated.
- [x] INT-PAY-010 Malformed active employer tax configuration fails closed instead of being silently ignored.
- [x] INT-PAY-011 Gross pay reconciles to regular plus overtime plus bonus.
- [x] INT-PAY-012 Taxable wages reconcile after pretax deductions.
- [x] INT-PAY-013 Employee tax total reconciles to component taxes/additional withholding.
- [x] INT-PAY-014 Net pay reconciles to gross less deductions and employee taxes.
- [x] INT-PAY-015 Monthly bonus payroll consumes exact earned bonus IDs.
- [x] INT-PAY-016 A timecard/bonus source cannot be consumed by more than one active pay run.
- [x] INT-PAY-017 Pay-run lifecycle supports Draft, Approved, Released, Voided/reissue controls.
- [x] INT-PAY-018 Released payroll creates separate liability and disbursement records.
- [x] INT-PAY-019 Payroll reversals/corrections propagate through accounting evidence.
- [x] INT-PAY-020 Payroll settlement state is distinct from pay-run approval/release.

## Performance, KPI, scorecard evidence, and reports
- [x] INT-KPI-001 Management KPI dashboard supports period selection.
- [x] INT-KPI-002 Management KPI dashboard supports metric selection.
- [x] INT-KPI-003 Management KPI dashboard supports graph/list toggle.
- [x] INT-KPI-004 KPI export includes metric metadata and source record IDs.
- [x] INT-KPI-005 Collected revenue derives from paid source orders.
- [x] INT-KPI-006 Paid cases/orders derive from settlement-qualified orders.
- [x] INT-KPI-007 New paid accounts derive from first paid order attribution.
- [x] INT-KPI-008 Demo completion and new-business close rates expose numerator/denominator evidence.
- [x] INT-KPI-009 Reorder account/share metrics derive from source account/order evidence.
- [x] INT-KPI-010 Closeout completeness and arrival verification derive from appointment/field evidence.
- [x] INT-KPI-011 Offsite exceptions are traceable.
- [x] INT-KPI-012 Attendance/punctuality remains factual evidence and is not silently scored.
- [x] INT-KPI-013 Performance reports are employee/manager scoped.
- [x] INT-KPI-014 Manager weekly report metrics aggregate only users inside management scope.
- [x] INT-KPI-015 Historical sales credit uses order creditedRepId/current source attribution rule.

## Marketing
- [x] INT-MKT-001 Employees can submit marketing support requests.
- [x] INT-MKT-002 Marketing request approval/return/fulfillment is Administrator controlled.
- [x] INT-MKT-003 Campaign records retain objective, audience, date range, requested budget, and success measure.
- [x] INT-MKT-004 Campaign budget approval is distinct from requested budget.
- [x] INT-MKT-005 Marketing spend validates campaign state and transaction detail.
- [x] INT-MKT-006 Assets support version/status/effective-date metadata.
- [x] INT-MKT-007 Physical marketing materials have item and movement records.
- [x] INT-MKT-008 Marketing touches link campaign/account/evidence.
- [x] INT-MKT-009 Attribution links exact commercial source records instead of auto-crediting association.
- [x] INT-MKT-010 Campaign commercial activity is explicitly distinguished from reviewed attribution.
- [x] INT-MKT-011 Partnership records retain status/campaign/note context.
- [x] INT-MKT-012 Action Center marketing links open the exact focused record/tab.

## Employee directory and activity evidence
- [x] INT-DIR-001 Non-customer employee directory is searchable.
- [x] INT-DIR-002 Coworker profile exposes name/title/department/work email/work location/work hours without private HR data.
- [x] INT-DIR-003 Initials avatar fallback works before production photo storage is connected.
- [x] INT-DIR-004 Management profile view is limited to management scope.
- [x] INT-DIR-005 Management profile view exposes traceable sales/operational metrics.
- [x] INT-DIR-006 Last recorded activity sorts by actual timestamp.
- [x] INT-DIR-007 Stale prior-day field appointment does not create false active presence.
- [x] INT-DIR-008 Appointment and shift punctuality evidence is traceable to source records.

## Action Center, notifications, and deep links
- [x] INT-ACT-001 Action Center groups and ranks blocking/due/review/watch work.
- [x] INT-ACT-002 Training and HCM tasks surface to the correct employee/manager.
- [x] INT-ACT-003 Submitted performance reports surface to authorized reviewer.
- [x] INT-ACT-004 Expense review/payment states surface to authorized roles.
- [x] INT-ACT-005 Marketing request/campaign approvals surface to Administrator.
- [x] INT-ACT-006 Accounting exceptions/events surface to Administrator.
- [x] INT-ACT-007 Unassigned dispatch and inventory exceptions surface to operational owners.
- [x] INT-ACT-008 Exact focus record is passed through navigation for supported action items.

## Audit history and traceability
- [x] INT-AUD-001 Material record snapshots generate created/updated/deleted audit events.
- [x] INT-AUD-002 Audit events retain actor, role, module, collection, entity, label, summary, related records, and field changes.
- [x] INT-AUD-003 Sensitive HCM/payroll/accounting audit categories are classified as admin-sensitive.
- [x] INT-AUD-004 Sales Representative audit visibility is limited to own operational records/accounts.
- [x] INT-AUD-005 Operations/Warehouse audit visibility is limited to operational custody/order scope.
- [ ] INT-AUD-006 Sales Manager audit visibility consumes centralized canManageUser scope with regression coverage.
- [x] INT-AUD-007 HCM audit history is immutable at the client mutation boundary.
- [ ] INT-AUD-008 Final audit confirms no material module bypasses the common audit snapshot/event pipeline.

## CSV, settings, reset, and administration
- [x] INT-ADM-001 Admin CSV export covers accounts/locations.
- [x] INT-ADM-002 Admin CSV export covers inventory lots.
- [x] INT-ADM-003 Admin CSV export covers appointments.
- [x] INT-ADM-004 Admin CSV export covers orders.
- [x] INT-ADM-005 Admin CSV export covers placements.
- [x] INT-ADM-006 Admin CSV export covers employee profiles/shifts/time records as designed.
- [x] INT-ADM-007 Controlled account/inventory/appointment/order/placement/HCM imports validate schema and references.
- [x] INT-ADM-008 CSV order import cannot set Paid or override pricing.
- [x] INT-ADM-009 CSV parser round-trips quoted commas/newlines.
- [x] INT-ADM-010 Demo reset clears field tracking and module-local demo stores.
- [x] INT-ADM-011 Settings data-health date uses Arizona business date.
- [ ] INT-ADM-012 Final reset sweep confirms every current browser store is included or intentionally retained.

## UX, errors, and launch acceptance
- [x] INT-UX-001 Core mutations return/emit failure state instead of silently pretending success.
- [x] INT-UX-002 Empty states exist for major record lists.
- [x] INT-UX-003 Dangerous money/status transitions are permission gated.
- [x] INT-UX-004 Search/filter controls operate on role-scoped data.
- [ ] INT-UX-005 Final mobile-width smoke test covers every primary page and modal.
- [ ] INT-UX-006 Final keyboard/focus/accessibility smoke test covers critical workflows.
- [ ] INT-UX-007 Final browser reload/persistence smoke test covers every module store.
- [ ] INT-UX-008 Final role matrix acceptance test is recorded for all six roles.

## External integrations: reserved final 10%
- [ ] EXT-001 Firebase Authentication, production identity, MFA/session policy.
- [ ] EXT-002 Cloud Firestore shared production persistence with security rules and migrations.
- [ ] EXT-003 Append-only server-side audit/event persistence and background processing.
- [ ] EXT-004 Firebase Storage for employee documents, receipts, evidence, profile photos, and other files.
- [ ] EXT-005 Tokenized customer payment processor/bank rail plus settlement callbacks.
- [ ] EXT-006 Payroll/reimbursement disbursement rail plus settlement callbacks/files.
- [ ] EXT-007 Official payroll tax/jurisdiction tables, filing/deposit calendar, and filing/remittance endpoint or provider.
- [ ] EXT-008 Outbound email delivery integration.
- [ ] EXT-009 Outbound SMS/push delivery integration if enabled.
- [ ] EXT-010 Production scheduled/background workers for accruals, deadlines, retries, and escalations.
- [ ] EXT-011 Production backup/restore for database and file storage with tested recovery.
- [ ] EXT-012 Production observability/logging/alerting and secret/environment management.
- [ ] EXT-013 Production hosting/domain/TLS deployment configuration and final environment cutover.

## Business and operational go-live gates, not included in the software percentage

These do not become complete because the software is ready. They require verified company decisions/evidence before live operations can rely on the platform.

- [ ] BIZ-001 Verify legal employer/entity and Golden Eagle/Momentum relationship.
- [ ] BIZ-002 Verify Arizona distribution rights, territory, exclusivity, and restrictions.
- [ ] BIZ-003 Verify production SKUs, pack configuration, labels, lots, shelf-life, and product claims.
- [ ] BIZ-004 Verify case/pallet/container quantities and define exactly what the one-container-per-month target means.
- [ ] BIZ-005 Verify supplier terms, lead times, freight, duties, landed cost, and reorder triggers.
- [ ] BIZ-006 Approve standard price, Partner-program terms, discounts, rebates, credit/payment terms, and exception authority.
- [ ] BIZ-007 Verify licensing, registrations, tax setup, insurance, employment compliance, and required records.
- [ ] BIZ-008 Approve manager hierarchy, backup approvers, and whether Operations/Marketing manager roles must be added.
- [ ] BIZ-009 Approve compensation/commission/override/reversal/termination rules beyond the confirmed sales-rep account bonus.
- [ ] BIZ-010 Approve PTO/leave, benefits, overtime/payroll, withholding, filing, and reimbursement policies.
- [ ] BIZ-011 Approve inventory valuation/accounting rules, chart of accounts, purchasing/payables authority, and financial reporting definitions.
- [ ] BIZ-012 Approve document retention, mandatory training, device/location, privacy, and security policies.
