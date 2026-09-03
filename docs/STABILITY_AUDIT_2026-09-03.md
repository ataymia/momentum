# Momentum Platform Stability Audit

Date: 2026-09-03
Branch under test: `codex/momentum-v1`
Baseline head at audit start: `f8d02652d836a5fd0603124ddffe9f3025aa12b3`
Purpose: establish a stable, cohesive product-layer stopping point before Firebase/backend integration.

## Status rules

- ✅ = stress-tested through the connected workflow and accepted at the current product layer.
- ❌ = defect, contradiction, dead-end, unsafe control, incomplete pathway, or materially confusing UX found. The row must state what is wrong and what must change.
- ⬜ = not yet fully stress-tested. It cannot be represented as complete.

A feature is not ✅ merely because a component renders or a unit test passes. Acceptance requires checking its entry point, permission boundary, source record, state transition, downstream dependency, exception/return path, audit/history, deep-link behavior, and the next responsible owner.

## Pre-Firebase release gate

The browser product layer is ready for backend integration only when:

1. All P0/P1 workflow defects are resolved.
2. Role permissions agree with the visible permission model and day-in-the-life requirements.
3. Every major task/approval/exception opens the exact source record.
4. No critical workflow ends on a generic department page or relies on the user remembering the next step.
5. No duplicate UI surface owns the same business fact.
6. Every material state transition preserves history and has a defined correction path.
7. Notification events and user preference requirements are defined before server workers are wired.
8. Current CI passes lint, TypeScript, logic tests, static export, artifact verification, and Pages deployment on the final audit head.
9. No live/customer/employee/payroll/financial data is introduced until Firebase authorization, persistence, file security, audit durability, and environment configuration are verified.

## Human acceptance lens

Every page is reviewed from three perspectives:

- Trainee: Can a new employee tell what to do next without knowing how Momentum was built?
- Manager/operator: Can the person responsible for the result see the source facts, make the decision, and handle an exception without leaving a dead-end?
- Buyer/owner: Does the software present one coherent operating system, or does it expose contradictory rules, duplicate surfaces, demo artifacts, or unfinished wiring?

## Day in the life test harness

### Owner / executive

Expected day:
1. Open Home and see company-level operational signals without unsupported vanity metrics.
2. See urgent approvals, exceptions, cash/receivable, inventory, staffing, and performance signals appropriate to authority.
3. Drill every material number or alert to its source record.
4. Approve/escalate only items requiring owner/admin authority.
5. Review manager/company reports and unresolved risks.
6. Receive important notifications according to preference and escalation policy.
7. End the day with a clear view of what changed, what is blocked, and who owns the next action.

### Director of Operations / administrator

Expected day:
1. Open My Work and resolve cross-functional approvals/exceptions.
2. Review company data health and overdue work.
3. Coordinate Sales, Operations, HR, Finance, Marketing and management handoffs.
4. Review exact source records before approvals.
5. Track warehouse/inventory/order exceptions and staffing/timecard issues.
6. Review department reports and audit history.
7. Configure users, permissions, notification policy, locks and integrations without editing business truth from a diagnostic screen.
8. Finish with an auditable queue of remaining owners/deadlines.

### Sales Manager

Expected day:
1. Open team pipeline, visits, orders, placements, follow-ups and exceptions.
2. Review direct-report approvals and exact source records.
3. Coach reps from source-linked activity and performance records.
4. Review team timecards and HR requests where authorized.
5. Access own HR, payroll, reimbursement and training information.
6. Request/view Marketing support as authorized.
7. Submit/review reports and receive account/team alerts.
8. Never see unrelated company-sensitive payroll/HR/finance records.

### Sales Representative

Expected day:
1. Clock in / manage own time and see schedule.
2. See assigned accounts, appointments and required follow-ups.
3. Prepare for visit from account history/contact/next action.
4. Complete visit with outcome, notes and required next action.
5. Place/order or trigger reorder with correct pricing and approval path.
6. Record/inspect placement and sales evidence.
7. See Partner Pricing/bonus progress from source orders without editing calculated outcomes.
8. Submit expenses/marketing requests/training/timecard/PTO as applicable.
9. Access own pay, HR files and notifications.
10. End workday with daily reporting if required by company policy.

### Operations / warehouse

Expected day:
1. See fulfillment/dispatch/inventory work assigned or available to role.
2. Receive stock, preserve lot and custody evidence, reserve/allocate inventory and fulfill authorized orders.
3. Never advance a sales approval or mark customer cash paid merely because delivery occurred.
4. Resolve holds only with required reason/evidence/authority.
5. Record every material inventory movement and exception.
6. Access own HR/time/pay/expense/training functions.
7. Receive low-stock, order, delivery and exception alerts appropriate to role.

### HR / People administrator

Expected day:
1. Manage canonical employee records and reporting relationships.
2. Handle recruiting → interview → offer → onboarding → active employee → offboarding lifecycle.
3. Review documents, acknowledgments, training, PTO, benefits, goals/reviews and HR requests.
4. Ensure manager/employee self-service routes to the exact record.
5. Preserve effective dates and history rather than overwriting employment facts.
6. Hand approved time/benefits/compensation records to payroll exactly once.
7. Receive deadline/missing-document/training/timecard/lifecycle alerts.

### Payroll / Finance administrator

Expected day:
1. Consume approved source time, effective compensation, eligible bonuses and benefit deductions.
2. Build, review, approve and release pay runs with duplicate-source protection.
3. Reconcile employee disbursements and tax liabilities separately from approval.
4. Process reimbursement/receivable/payment/credit/refund source records.
5. Translate eligible source events into balanced accounting records under configured rules.
6. Lock periods and correct posted/released records through controlled reversal/reissue paths.
7. Drill every amount back to source records.

### Marketing

Expected day:
1. Receive/request retailer support and collateral needs.
2. Manage campaigns, approved budget, actual spend, assets/materials and partnerships.
3. Preserve physical material movement and account/campaign linkage.
4. Record field touches and evidence.
5. Attribute commercial outcomes only where evidence exists.
6. Route approvals, returns, fulfillment and budget exceptions to the correct owner.

### Customer

Expected day:
1. See only linked account/location information.
2. Place/repeat orders at the currently authorized price.
3. See order status without internal compensation/HR/finance information.
4. Receive order/appointment/customer-facing changes through configured notification channels.
5. Never see internal audit, employee, inventory-cost, margin, payroll, or unrelated customer data.

## Feature stress-test ledger

### Platform shell, identity, navigation, permissions

| ID | Feature | Status | Audit result / required fix |
| --- | --- | --- | --- |
| P-01 | Login / demo identity | ⬜ | Trace login, session restore, invalid credentials, logout and role switch. |
| P-02 | Sidebar navigation by role | ⬜ | Verify every visible page is authorized and every authorized self-service page is reachable. |
| P-03 | Breadcrumb navigation | ⬜ | Verify prior path/home is clickable and never traps user. |
| P-04 | Global search | ⬜ | Verify result scope, exact-record deep link and no unauthorized search leakage. |
| P-05 | Notifications popover | ⬜ | Verify in-app unread/read counts and source/event relevance. |
| P-06 | Role permission model | ❌ | Administration promises Manager/Rep HR, payroll, finance and marketing/self-service access, but `lib/access.ts` blocks those pages. Reconcile code, tests and displayed permission table. |
| P-07 | Record-level scope | ⬜ | Test customer, rep, manager, operations, warehouse and admin access across every record collection. |
| P-08 | Exact-record deep linking | ❌ | Timecard and inventory were corrected, but Retail, Finance, Marketing and Reports still require full exact-record verification and fixes where destination ignores focus ID. |
| P-09 | Responsive/mobile navigation | ⬜ | Verify critical workflows at narrow widths, dialogs, tables and action buttons. |
| P-10 | Demo reset | ⬜ | Verify all local stores reset together and no stale store survives. |
| P-11 | Runtime mode guardrails | ⬜ | Verify production mode removes demo reset/tour behavior and does not imply integrations are connected. |

### My Work / approvals / exception routing

| ID | Feature | Status | Audit result / required fix |
| --- | --- | --- | --- |
| W-01 | Approval queue | ⬜ | Verify source facts, authority and self-approval prevention for every approval type. |
| W-02 | Timecard review | ✅ | Exact source timecard is shown before decision; return reason required and follows returned record. Re-check after later permission changes. |
| W-03 | Order approval | ⬜ | Test normal and low-stock order approval, return/correction and exact-record navigation. |
| W-04 | Inventory exception | ⬜ | Exact lot focus added; verify hold closeout, permissions and action refresh end to end. |
| W-05 | Retail exception | ❌ | Action can carry placement ID but Retail destination still needs exact-placement consumption verified/fixed. |
| W-06 | Completed decision history | ⬜ | Verify source record remains discoverable after approval/return and status copy stays accurate. |
| W-07 | Exception deduplication | ⬜ | Ensure same underlying exception does not create competing tasks across pages. |
| W-08 | Ownership / due dates | ⬜ | Every actionable item needs a responsible owner and actionable due/trigger date. |

### CRM & Sales

| ID | Feature | Status | Audit result / required fix |
| --- | --- | --- | --- |
| S-01 | Parent customer / location hierarchy | ⬜ | Test independent and multi-location account structures. |
| S-02 | Account creation | ⬜ | Validate required fields, source activity and access. |
| S-03 | Duplicate detection | ⬜ | Test exact and near-duplicate paths plus allowed same-brand/different-location case. |
| S-04 | Contacts / decision roles | ⬜ | Verify create/edit/delete/history and account linkage. |
| S-05 | Ownership / account manager / originator / closer | ⬜ | Trace handoff and compensation attribution through transfers. |
| S-06 | Responsibility transfer | ⬜ | Verify authority, acceptance/history and no orphan account. |
| S-07 | Pipeline/stage | ⬜ | Check valid progression, lost/at-risk paths and no unsupported automatic stage claims. |
| S-08 | Next action / due date | ⬜ | Ensure every actionable account has one authoritative next action and overdue behavior. |
| S-09 | Activity history | ⬜ | Calls, notes, visits, orders and system events should be distinguishable and auditable. |
| S-10 | Opportunity/order linkage | ⬜ | Verify sales intent becomes order without losing owner/account context. |
| S-11 | Preferred Partner pricing | ⬜ | Stress 60-day intro, 20-case continuation, lapse and re-entry boundary dates/payment states. |
| S-12 | Price enforcement at order entry | ⬜ | Partner price locked; standard price requires authorized price. Verify no alternative path bypasses rule. |
| S-13 | Sales-rep account bonus | ⬜ | Stress first-order amount/payment, 40-case window, late payment, returned/refunded payment and ownership changes. |
| S-14 | Commission/manager override | ❌ | Full commission/override engine is not final/fully implemented because controlling business rules are not approved. Must remain visibly unresolved, never inferred. |
| S-15 | Account health | ⬜ | Verify status is source-defined and not an ambiguous progress badge. |
| S-16 | Manager team view | ⬜ | Verify manager sees managed reps/accounts only and can drill to source. |

### Dispatch / field work

| ID | Feature | Status | Audit result / required fix |
| --- | --- | --- | --- |
| D-01 | Create appointment | ⬜ | Validate account, owner, date/time, priority, purpose and role authority. |
| D-02 | Assign/unassign appointment | ⬜ | Verify manager/operations authority, holding state and history. |
| D-03 | Drag/reschedule | ⬜ | Verify state, audit and constraints; no move after workflow becomes active/closed unless explicit correction path. |
| D-04 | Dispatch lifecycle | ⬜ | Scheduled → dispatched → en route → arrived → closeout. |
| D-05 | Closeout | ⬜ | Outcome, closeout note, next action/date required and reflected on account. |
| D-06 | Follow-up creation | ⬜ | Verify closeout next action actually appears where rep/manager will work it. |
| D-07 | Exact appointment deep link | ⬜ | Search/action links should open selected appointment and preserve date context. |
| D-08 | Appointment notifications | ❌ | Native notification foundation exists, but reminder/change event policy and external email/SMS delivery are not complete. |

### Retail execution

| ID | Feature | Status | Audit result / required fix |
| --- | --- | --- | --- |
| R-01 | Placement register | ⬜ | Verify role scope and account linkage. |
| R-02 | Placement observation | ⬜ | Stock, facings, cold, shelf price and timestamp update source record. |
| R-03 | Photo/evidence | ❌ | UI explicitly defers file evidence until Firebase Storage. Product path must be ready but cannot be marked production-ready. |
| R-04 | Placement → account | ⬜ | Exact linked account must open. |
| R-05 | Placement → reorder | ⬜ | Must preselect correct account/product/price and preserve placement context. |
| R-06 | Exact placement deep link | ❌ | My Work/action focus IDs need exact-placement handling instead of generic Retail page. |
| R-07 | Sell-through claims | ⬜ | Verify no unsupported consumer sell-through is calculated without source. |

### Orders, billing and order-to-cash

| ID | Feature | Status | Audit result / required fix |
| --- | --- | --- | --- |
| O-01 | Draft/create order | ⬜ | Validate quantity, product, account, price, role and source. |
| O-02 | Customer reorder | ⬜ | Verify authorized current price and no internal data leakage. |
| O-03 | Approval gate | ⬜ | Awaiting approval cannot fulfill. Low-stock condition requires correct authority. |
| O-04 | Returned order correction | ⬜ | Verify corrected replacement preserves original history and does not duplicate unintended business events. |
| O-05 | Allocation | ⬜ | Verify inventory reservation and order state stay consistent. |
| O-06 | Fulfillment progression | ⬜ | Only authorized Operations advances allocated/out-for-delivery/delivered. |
| O-07 | Proof of delivery | ⬜ | Verify source/evidence path and that delivery does not equal payment. |
| O-08 | Invoice generation | ⬜ | Verify amount/terms/order/account and no duplicate invoice. |
| O-09 | Payment recording | ⬜ | Cleared vs open/partial must remain separate from fulfillment. |
| O-10 | Payment allocation | ⬜ | Verify partial/multiple allocations and invoice balance. |
| O-11 | Credits/refunds | ⬜ | Verify financial/order/bonus/pricing consequences and reversal history. |
| O-12 | Receivable closeout | ⬜ | Settled invoices should reconcile to cleared payments/credits, not manual visual state. |
| O-13 | Exact order/invoice deep links | ⬜ | Search/My Work/account should land on exact source. |

### Inventory & fulfillment

| ID | Feature | Status | Audit result / required fix |
| --- | --- | --- | --- |
| I-01 | Product/SKU configuration | ⬜ | Verify one canonical pack configuration feeds pricing, order and unit logic. |
| I-02 | Inventory receipt | ⬜ | Lot, quantity, location, received date and custody entry. |
| I-03 | Lot register | ⬜ | Verify on-hand/reserved/available math and exact record selection. |
| I-04 | Movement ledger | ⬜ | Receipt/reserve/release/pick/load/deliver/adjust/return/sample/damage chain. |
| I-05 | Reservation/allocation | ⬜ | No oversell, duplicate reserve or negative availability. |
| I-06 | Quality hold | ⬜ | Hold blocks availability; release/retain requires authority and reason. |
| I-07 | Physical count/variance | ⬜ | Verify count and variance investigation/correction path. |
| I-08 | Low-stock alerts | ⬜ | Native alerts exist. Verify thresholds, recipients, duplicate suppression and clear condition. |
| I-09 | Inventory/accounting handoff | ⬜ | Source events must not invent COGS while valuation policy is unconfigured. |
| I-10 | Exact lot deep link | ⬜ | Code now consumes workflow focus; verify stale/missing IDs safely fall back. |

### Marketing

| ID | Feature | Status | Audit result / required fix |
| --- | --- | --- | --- |
| M-01 | Marketing support request | ⬜ | Submit, approve/return, fulfill, account/campaign linkage and requester notification. |
| M-02 | Campaign proposal | ⬜ | Objective, audience, dates, requested budget, success measure. |
| M-03 | Campaign approval | ⬜ | Requested vs approved budget stays distinct. |
| M-04 | Campaign lifecycle | ⬜ | Approved → active → complete with closeout. |
| M-05 | Spend request | ⬜ | Vendor/category/purpose/receipt/campaign and authority. |
| M-06 | Spend approval/reconciliation | ⬜ | Approved budget is not actual spend; source record remains traceable. |
| M-07 | Asset/version control | ⬜ | Only approved effective version eligible for external use. |
| M-08 | Physical collateral/materials | ⬜ | Opening quantity and movement ledger preserve account/campaign/request. |
| M-09 | Field touch/evidence | ⬜ | Verify account/campaign linkage and evidence handling. |
| M-10 | Attribution | ⬜ | Commercial credit requires explicit source/evidence and review. |
| M-11 | Partnerships | ⬜ | Verify stage, dates, contact, campaign and outcome history. |
| M-12 | Exact marketing deep link | ❌ | Action Center/source focus handling must be tested/fixed so a request/campaign/spend item does not land on a generic tab. |

### People & HR / HCM

| ID | Feature | Status | Audit result / required fix |
| --- | --- | --- | --- |
| H-01 | Employee system of record | ⬜ | Verify one employee identity/reporting relationship and effective employment history. |
| H-02 | Employee self-service navigation | ❌ | Current page access blocks Sales Manager/Sales Representative self-service despite visible permission model and HCM blueprint. |
| H-03 | Time clock | ⬜ | Clock-in → meal start → meal end → clock-out constraints and history. |
| H-04 | Timecard submission | ⬜ | Open/returned only, no open punches, attestation and pending approval dedupe. |
| H-05 | Manager timecard review | ✅ | Exact card review, return instructions, employee correction/resubmission path exists. Re-test permissions after access fix. |
| H-06 | Time entry correction | ⬜ | Validate temporal rules, before/after history, reason, actor and payroll consumption. |
| H-07 | PTO policy/ledger | ⬜ | Balance must derive from ledger and actual company policy remains configurable. |
| H-08 | PTO request/approval | ⬜ | Employee → manager → ledger/staffing/payroll impact → employee result. |
| H-09 | Workforce scheduling | ⬜ | Availability, shifts, publish/open shift/claim/approval and role access. |
| H-10 | Benefits plans | ⬜ | Plan/tier/effective dates; no invented real plan terms. |
| H-11 | Benefits enrollment/life event | ⬜ | Eligibility, dependents, election/waiver, effective dates and payroll deduction handoff. |
| H-12 | Documents/policies | ⬜ | Version, audience, acknowledgement and secure future file path. |
| H-13 | Training catalog | ⬜ | Verify discoverability after HCM cleanup. |
| H-14 | Training assignment/completion | ⬜ | Assigned → due/overdue → complete/evidence → manager/HR visibility. |
| H-15 | Recruiting/ATS | ⬜ | Requisition → candidate → interview → offer → disposition/hire. |
| H-16 | Onboarding | ⬜ | Hire creates owned task ledger, due dates, evidence and completion. |
| H-17 | Offboarding | ⬜ | Access/property/final-pay/tasks with due dates and status. |
| H-18 | Goals/performance reviews | ⬜ | Self/manager/rating/acknowledgement distinct; approved templates still configurable. |
| H-19 | Compensation change | ⬜ | Request/approval/effective record, no silent pay-rate edits. |
| H-20 | HR inbox/requests | ⬜ | Exact request, owner, status, response and history. |
| H-21 | Org chart/directory | ⬜ | Privacy/scope and reporting relationship consistency. |
| H-22 | HCM duplicate surfaces | ⬜ | Advanced HCM duplicate shell was removed; verify no hidden/competing pages remain. |

### Payroll

| ID | Feature | Status | Audit result / required fix |
| --- | --- | --- | --- |
| Y-01 | Pay groups | ⬜ | Frequency/overtime config and effective use. |
| Y-02 | Payroll employee setup | ⬜ | Employee/group/payment instruction; sensitive data boundaries. |
| Y-03 | Effective compensation consumption | ⬜ | Payroll must consume HR source, not duplicate pay-rate truth. |
| Y-04 | Approved time consumption | ⬜ | Only eligible approved cards, exact period, no duplicate consumption. |
| Y-05 | Bonus consumption | ⬜ | Earned source IDs consumed once and reversible when upstream event reverses. |
| Y-06 | Benefit deductions | ⬜ | Active enrollment/effective tier only. |
| Y-07 | Withholding profile | ⬜ | Configurable demo logic; never represent as production tax compliance before official tax integration. |
| Y-08 | Gross-to-net calculation | ⬜ | Hours/rate/OT/bonus/benefits/tax/deductions math and rounding. |
| Y-09 | Draft pay run | ⬜ | Validate period/date locks and empty/incomplete setup behavior. |
| Y-10 | Approve/release | ⬜ | Valid state progression and authority. |
| Y-11 | Void/reissue | ⬜ | Original remains immutable-style; liabilities/disbursements reverse consistently. |
| Y-12 | Pay statement/YTD | ⬜ | Released-only totals and exact source drill-down. |
| Y-13 | Tax liabilities | ⬜ | Separate accrue/schedule/pay; production schedules unresolved. |
| Y-14 | Disbursement register | ⬜ | Release vs settlement distinct; external rail future. |
| Y-15 | Period locks | ⬜ | Locked periods reject mutations and release behavior is auditable. |
| Y-16 | Payroll self-service access | ❌ | Sales Manager/Sales Rep are blocked by current page-access engine even though Administration/HCM model says own payroll is allowed. |

### Finance & accounting

| ID | Feature | Status | Audit result / required fix |
| --- | --- | --- | --- |
| F-01 | Expense submission | ⬜ | Amount/category/purpose/receipt/account/source. |
| F-02 | Manager expense review | ⬜ | No self-approval; managed scope only. |
| F-03 | Finance approval | ⬜ | Separate from manager decision. |
| F-04 | Reimbursement payable/paid | ⬜ | Finance-approved → payable → external settlement future → accounting closeout. |
| F-05 | Receivables | ⬜ | Invoice balance from invoice/payments/credits. |
| F-06 | Payables/purchasing | ❌ | Blueprint requires vendor/purchase/AP workflow; verify current product coverage because visible Finance page is primarily expenses + AR. |
| F-07 | Chart of accounts | ⬜ | Add/configure accounts and protect system roles. |
| F-08 | Accounting source-event inbox | ⬜ | Block unsupported events visibly. |
| F-09 | Effective accounting rules | ⬜ | Source type/effective date/debit/credit/memo and balanced output. |
| F-10 | Journal posting | ⬜ | Balanced drafts only; posted entries corrected through void/replacement. |
| F-11 | Reconciliation | ⬜ | Statement vs ledger balance and controlled completion. |
| F-12 | Inventory accounting | ⬜ | Must remain blocked until valuation/cost policy exists. |
| F-13 | Financial statements | ❌ | Blueprint requires statements/management reports; current accounting surface emphasizes trial balance/journals/reconciliation. Full statement coverage must be verified/built. |
| F-14 | Exact expense/finance deep link | ❌ | Action Center/source focus handling needs exact-record destination behavior. |
| F-15 | Finance self-service access | ❌ | Sales Manager/Sales Rep own reimbursement access conflicts with current `pageAccess`. |

### Performance & reports

| ID | Feature | Status | Audit result / required fix |
| --- | --- | --- | --- |
| Q-01 | Daily report | ⬜ | Work-date requirement, source snapshot, narrative and duplicate submission rules. |
| Q-02 | Manager weekly report | ⬜ | Team totals/scope/compliance and narrative. |
| Q-03 | Report review/notes | ⬜ | Manager authority, no silent edit of employee narrative. |
| Q-04 | KPI source definitions | ⬜ | Every displayed KPI requires formula/source/date/owner/action. |
| Q-05 | Manager scorecard | ⬜ | Verify source-defined metrics and no unapproved compensation/KPI rules. |
| Q-06 | Audit center | ⬜ | Role-scoped history, exact source link and sensitive-event restrictions. |
| Q-07 | Exact report deep link | ❌ | Action/focus IDs need exact report selection rather than generic Reports landing. |
| Q-08 | Rep/manager report access | ❌ | Current `pageAccess` denies Reports to Sales Representatives and broader self-service expectations need a deliberate decision; manager has Reports. Daily-report requirements cannot work for a role that cannot open Reports. |

### Notifications and communication

| ID | Feature | Status | Audit result / required fix |
| --- | --- | --- | --- |
| N-01 | Native notification record model | ⬜ | In-app/email/SMS delivery records, source event and status exist; stress event coverage/deduping. |
| N-02 | Recipient routing | ⬜ | Test account owner/manager/customer/admin/HR/payroll/warehouse routing and actor suppression. |
| N-03 | In-app alerts | ⬜ | Verify all material events create useful copy and exact source links. |
| N-04 | Email channel preference | ❌ | Engine supports preference field, but employee/customer account settings UI and transport are not complete. |
| N-05 | SMS channel preference | ❌ | Engine supports preference field, but employee/customer account settings UI and transport are not complete. |
| N-06 | Both/none preference | ❌ | Need simple user-facing notification settings with channel toggles and event-category/importance control. |
| N-07 | Customer order updates | ❌ | Define customer-safe order/payment/appointment events and notification copy; external delivery later. |
| N-08 | Appointment reminders/changes | ❌ | Need scheduled reminder/change event rules and server-worker delivery plan. |
| N-09 | Timecard reminders | ❌ | Need due/reminder rule based on schedule/timecard state and configurable company cadence. |
| N-10 | HR/training reminders | ❌ | Need due/overdue assignment, acknowledgement, PTO/request and lifecycle events mapped to recipients/channels. |
| N-11 | Account urgent-change alerts | ⬜ | Audit-based routing exists; define material event classes and urgency instead of notifying on every low-value field mutation. |
| N-12 | Escalation | ⬜ | In-app escalation engine exists; verify unresolved definition, duplicate prevention, manager/admin chain and quiet conditions. |
| N-13 | Delivery retries/failures | ❌ | Requires backend worker and external email/SMS transport with retry/dead-letter/reconciliation. |
| N-14 | Notification audit/history | ⬜ | Verify delivery records are traceable without recursively generating more notifications. |

### Administration, audit, resilience and pre-backend controls

| ID | Feature | Status | Audit result / required fix |
| --- | --- | --- | --- |
| A-01 | Data-health diagnostics | ⬜ | Verify signals are correct and diagnostic only. |
| A-02 | Audit diff engine | ⬜ | Verify material creates/updates/deletes and related-user/account scope. |
| A-03 | Record history | ⬜ | Exact record history available where material. |
| A-04 | Period locks | ⬜ | Payroll/accounting lock scope and release controls. |
| A-05 | Integration status | ⬜ | Must accurately distinguish product-layer function from disconnected production rail. |
| A-06 | Error/loading/empty states | ⬜ | Every page must behave safely when data is absent, stale, unauthorized or partially configured. |
| A-07 | Local persistence consistency | ⬜ | No engine should overwrite another source or seed stale incompatible schema. |
| A-08 | Cross-engine reset | ⬜ | All local keys reset, providers reseed coherently. |
| A-09 | Accessibility | ⬜ | Keyboard, focus, labels, modal escape/close, contrast and semantic controls. |
| A-10 | Buyer-facing polish | ⬜ | Remove contradictory copy, duplicate boxes, dead controls, excessive diagnostics and obvious demo-only clutter from normal workflows. |
| A-11 | CI pipeline | ✅ | Audit baseline workflow on head `f8d02652...` completed successfully before new audit changes. Re-run on every audit-fix checkpoint. |
| A-12 | Firebase integration contract | ⬜ | Define canonical collections, IDs, authorization, audit events, workers, storage and migration only after product-layer workflows pass. |

## Known contradictions discovered at audit start

1. Administration says Human Resources = Manager "Team approvals + own", Sales Rep "Own"; Payroll = Manager/Rep "Own"; Finance = Manager "Team review + own", Rep "Own"; Marketing = Manager/Rep "Request / view". Current `lib/access.ts` denies Sales Managers access to Marketing/People/Payroll/Finance and denies Sales Representatives access to Marketing/People/Payroll/Finance/Reports. This must be reconciled with actual job workflows before Firebase rules copy the wrong permission model.
2. The notification engine already contains In app / Email / SMS preferences and delivery states, but the user-facing self-service preference experience and external transports are incomplete. The new requested feature should extend the existing notification spine, not create a second notification subsystem.
3. Exact-record routing is not yet a platform invariant. Timecards and inventory have targeted fixes, while other modules still require verification/repair.
4. The HCM parity document describes product-layer HCM parity as complete, but role access currently blocks key employee/manager self-service destinations. The parity claim must be revalidated after this audit.

## Audit execution order

1. Platform shell + role access + exact-record routing.
2. My Work approvals/exceptions.
3. CRM & Sales.
4. Dispatch and Retail execution.
5. Orders → invoice → payment → credits/refunds.
6. Inventory → fulfillment → accounting handoff.
7. People & HR → time → PTO → benefits → talent/training/performance.
8. Payroll.
9. Finance & accounting.
10. Marketing.
11. Reports/audit/KPIs.
12. Notifications and account settings specification.
13. Mobile/accessibility/buyer-polish pass.
14. Full role-by-role day-in-the-life acceptance run.
15. Final CI + static deployment checkpoint.
16. Only then begin Firebase/backend migration.

## Final acceptance output required

At the end of the pass this document must contain:

- a ✅/❌ decision for every row above;
- exact defect notes for every ❌;
- the commit(s) that resolve each fixed defect;
- unresolved business-policy dependencies separated from code defects;
- final role-by-role acceptance result;
- final pre-Firebase go/no-go decision and remaining production integration gates.
