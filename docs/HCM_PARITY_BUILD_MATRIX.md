# Momentum Native HCM / Workforce Parity Matrix

## Parity definition

Momentum owns the employee, HR, time, scheduling, benefits, recruiting, lifecycle, learning, performance, compensation, payroll, workflow, reporting and audit experience. Employees and managers do not need a second HCM product to perform normal company workflows.

There are two different completion standards and they must not be confused:

- **Product-layer parity** means the native Momentum application has the record model, user workflow, approvals, ledgers, controls, reporting and audit path for the capability.
- **Production readiness** means the product layer is connected to production identity, encrypted persistent storage, official tax/compliance data, file storage, messaging, bank/payment rails and filing endpoints as applicable.

The browser-local build now reaches **product-layer HCM parity** across the workforce capability set below. Production readiness still has explicit infrastructure gates; those are not hidden or treated as completed.

| Capability | Momentum destination | Product-layer state | Production dependency / remaining hardening |
| --- | --- | --- | --- |
| Employee system of record | People & HR | Functional | Firebase persistence, field-level security, complete historical migration |
| Employee self-service | People & HR / Payroll | Functional | Production identity verification and secure field restrictions |
| Document vault | People & HR | Functional metadata/version/ack flow | Encrypted Firebase Storage, retention rules, access logs, e-signature provider only if legally required |
| Time clock | People & HR | Functional | Production event persistence and approved device/location policy, if any |
| Meal/break tracking | People & HR | Functional | Company/jurisdiction rule configuration and exception schedules |
| Timecard approval | People & HR | Functional | Server-side locks and durable correction audit |
| PTO/time off | People & HR | Functional policy + ledger + approval | Actual company policy configuration, protected-leave rules and server-side scheduled accrual jobs |
| Workforce scheduling | People & HR | Functional | Durable notifications and calendar/dispatch integration where useful |
| Benefits plan setup | People & HR | Functional | Actual carrier/plan terms and plan documents |
| Benefits enrollment | People & HR | Functional | Carrier feeds or exports where required; production evidence storage |
| Benefit life events | People & HR | Functional | Actual eligibility windows and carrier rules |
| Benefit deductions | Payroll | Functional | Actual plan contribution configuration and payroll tax treatment |
| Payroll employee setup | Payroll | Functional | Production account tokens and verified tax/jurisdiction setup |
| Gross-to-net | Payroll | Functional configurable engine | Official federal/state/local tax tables, legal overtime configuration, rounding and jurisdiction validation |
| Variable compensation | Sales / Payroll | Functional account-bonus engine | Additional commission/override plans only after business rules are approved |
| Payroll pay runs | Payroll | Functional | Durable locks, production approval identity and bank cutoff calendar |
| Duplicate-payment controls | Payroll | Functional | Server-side transaction guarantees |
| Pay statements | Payroll | Functional | Secure document generation/download and retention |
| Payroll disbursement | Payroll | Functional instruction/reconciliation ledger | Selected ACH/check/bank rail and settlement webhooks/files |
| Payroll tax liability | Payroll / Finance | Functional liability ledger | Official deposit schedules, filing endpoints/forms, amendments and year-end filing services/data |
| Recruiting / ATS | People & HR | Functional | Production email/calendar delivery and applicant file storage |
| Interviews | People & HR | Functional | Calendar/email connector for external invitations |
| Offers | People & HR | Functional | Production document/e-signature delivery if used |
| Onboarding | People & HR | Functional | Production account provisioning, equipment integrations and secure forms |
| Offboarding | People & HR | Functional | Production access-revocation connectors and final-pay configuration |
| Learning management | People & HR | Functional | Production media/file storage; richer quiz/certification engine only if required |
| Performance goals | People & HR | Functional | Approved company goal templates and source-metric mappings |
| Performance reviews | People & HR | Functional | Approved rating/calibration policy and durable signatures where required |
| Compensation planning | People & HR / Payroll | Functional request/effective-record flow | Approved budgets, ranges and decision rights |
| Expenses | Finance & Expenses | Functional | Production receipt storage, accounting integration and payout rail |
| Employee reimbursements | Finance / Payroll | Functional workflow | Approved payout route and accounting treatment |
| HR workflows | People & HR | Functional | Server-driven routing timers, notifications and delegation |
| Employee inbox / alerts | People & HR / My Work | Functional task/request model | Production push/email/SMS delivery where approved |
| Org chart / directory | People & HR | Functional | Production privacy rules and complete workforce data |
| Compliance acknowledgments | People & HR | Functional | Production document retention, required audiences/due dates and e-signature standard if required |
| Workforce analytics | Reports | Functional source-defined metrics | Production data warehouse/export only if scale requires it |
| Audit history | HCM + material platform modules | Functional HCM event ledger | Append-only server persistence and export/retention controls |
| Role security | Administration | Demo + product permissions functional | Firebase Auth, Firestore and Storage rules; MFA/session policy |
| Mobile usability | All employee modules | Responsive product layer | Production device testing and accessibility verification |
| Workflow automation | People & HR | Functional exception-to-task rules | Server/event workers, scheduled execution, retries and production notifications |

## Product rules enforced by the design

1. One fact has one business source of truth. Compensation is effective-dated in HCM and payroll consumes it instead of maintaining a second pay-rate record.
2. A request is not a decision. Requests preserve submitter, source values, requested values, reviewer, decision and downstream result separately.
3. Payroll amounts drill to source timecards, compensation, variable-earning IDs, benefit enrollments and withholding configuration.
4. Benefit deductions drill to active benefit enrollment tiers and effective dates.
5. PTO balances are ledger sums from accrual/front-load/use/adjustment/reversal events; there is no silently editable balance field.
6. Approved PTO use posts once. Scheduled accrual posting is idempotent for the same employee, policy and accrual date.
7. A compensation earning ID or timecard can be consumed by only one active payroll run unless the prior payment is explicitly voided/reissued.
8. Released payroll creates separate tax-liability and employee-disbursement records. Payment settlement is not inferred from payroll approval.
9. Recruiting preserves requisition, candidate source/stage, interviews, offer terms and disposition instead of collapsing hiring into a generic employee note.
10. Onboarding and offboarding are task ledgers with due dates and completion evidence, not memory-based checklists.
11. Performance cycles preserve employee submission, manager submission, rating and employee acknowledgment as separate events.
12. Policy acknowledgments are tied to the exact policy version.
13. Workforce reports calculate from HCM source records and expose the formula/rule behind the displayed metric.
14. HR automation creates owned tasks from source exceptions without mutating or erasing the source exception.
15. Unknown company, tax, wage, leave, benefit, discipline or legal rules remain configurable. Momentum does not invent them.

## Current product-layer coverage

### Employee and manager experience
- Employee directory and reporting hierarchy
- Canonical employment records and effective changes
- Employee profile-change requests
- Time clock, meal events, timecard submission and approval
- PTO policies, assignments, ledger balances, requests and approvals
- Availability, shift creation, publishing, open-shift claiming and approval
- Benefit plans, multiple tiers, dependents, enrollment/waiver and life events
- Employee documents, policy versions and acknowledgments
- HR request center and employee HR inbox

### Talent and performance
- Requisitions and candidate pipeline
- Interview scheduling and recorded interview disposition
- Offer drafting and recorded sent/accepted/declined/withdrawn status
- Onboarding and offboarding task cases
- Course catalog, assignments and completion records
- Goals
- Performance review cycles, self review, manager review/rating and acknowledgment
- Compensation change requests and effective compensation records

### Payroll
- Pay groups and configurable overtime threshold
- Effective HCM compensation consumption
- Approved-time consumption
- Sales bonus consumption
- Benefit deductions from active enrollment
- Configurable employee withholding profiles and employer tax rules
- Gross-to-net calculations
- Draft/approve/release/void/reissue lifecycle
- Duplicate source-consumption controls
- Pay statements and YTD released totals
- Tax liability ledger
- Disbursement instruction and settlement register

### Controls, analytics and audit
- Material HCM audit history
- Source-defined workforce reporting
- Manager-scoped workforce reporting
- Missing-document, overdue-training, lifecycle and review exception rules
- Exception-to-task automation with deduplication
- Responsive employee workflows

## Production critical path

1. Move HCM/payroll browser-local stores into the canonical production database with immutable identifiers and migrations.
2. Enforce authentication, MFA/session policy, role/field/document security and append-only material audit events server-side.
3. Connect encrypted employee/document storage with retention and access logging.
4. Load verified company policies: employment classifications, PTO/leave, schedules, benefits, compensation decision rights and payroll calendars.
5. Integrate official payroll tax tables/jurisdiction logic and filing/deposit calendars. Do not substitute manually guessed rates for production tax compliance.
6. Connect selected payment rails for payroll, customer payments and reimbursements using tokenized instructions and settlement reconciliation.
7. Add production event workers for accruals, deadlines, alerts, retries and exception escalation.
8. Connect calendar/email/SMS only where a workflow actually needs external delivery.
9. Run role-by-role acceptance tests, payroll parallel tests, security tests, restore tests and audit reconciliation before live employee data or money movement.
