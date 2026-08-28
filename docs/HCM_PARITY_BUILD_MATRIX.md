# Momentum Native HCM / Workforce Parity Matrix

## Product requirement

Momentum will provide a cohesive in-house workforce experience rather than sending employees and managers into a separate HR/payroll product for normal company work. External infrastructure may authenticate users, store files, deliver messages, or move money, but Momentum owns the HR, payroll, benefits, time, talent, compensation, workflow, reporting and audit records.

This matrix is the build checklist for reaching full modern HCM/workforce-platform coverage.

| Capability | Momentum destination | Current state | Build requirements |
| --- | --- | --- | --- |
| Employee system of record | People & HR | Shell live | Canonical employment record, effective dates, status history, manager hierarchy, job/location/department history |
| Employee self-service | People & HR / Payroll | Shell live | Profile changes, acknowledgments, tax/pay elections, secure change approval and audit |
| Document vault | People & HR | Shell live | Firebase Storage, versioning, categories, signatures/acknowledgments, retention, access logs |
| Time clock | People & HR | Live demo | Production clock events, device/source, correction request, geofence/device rules only if approved |
| Meal/break tracking | People & HR | Live demo | Rule configuration, exception detection and manager review |
| Timecard approval | People & HR | Live demo | Multi-level routing, corrections preserving originals, payroll lock/reopen rules |
| PTO/time off | People & HR | Request flow live | Policy engine, accrual/front-load, balances, carryover, waiting periods, protected categories, blackout/coverage rules |
| Workforce scheduling | People & HR / Schedule | Partial | Employee shifts, availability, coverage, open shifts, schedule changes, time-off impact |
| Benefits plan setup | People & HR | Designed | Plan years, coverage tiers, effective dates, employee/employer contribution rules |
| Benefits enrollment | People & HR | Designed | Open enrollment, new-hire enrollment, life events, dependents, evidence, confirmations, deductions |
| Benefit deductions | Payroll | Designed | Effective-dated deductions tied to enrollment and pay periods |
| Payroll employee setup | Payroll | Live demo | Pay groups, frequency, earning codes, tax jurisdiction, deductions, direct-deposit token/instruction data |
| Gross-to-net | Payroll | Live demo shell | Overtime, taxable wages, pretax/post-tax deductions, federal/state/local tables, employer taxes, rounding |
| Variable compensation | Sales / Payroll | Bonus engine live | Commission plans, overrides, tiers, earning dates, reversals, disputes, payout ledger |
| Payroll pay runs | Payroll | Live demo | Pay calendar, locks, preview, exception checks, multi-level approval, correction/void/reissue |
| Duplicate-payment controls | Payroll | Live demo | Persistent earning/timecard consumption ledger and immutable release history |
| Pay statements | Payroll | Live demo shell | Full earning/deduction/tax lines, YTD values, secure employee access, downloadable statement |
| Payroll disbursement | Payroll | Designed | ACH/direct-deposit/check instruction generation, bank/payment rail, settlement/error reconciliation |
| Payroll tax liability | Payroll / Finance | Designed | Tax tables, deposit schedules, liability ledger, filing records, amendments and year-end process |
| Recruiting / ATS | People & HR | Planned | Requisition, candidate, stage, interview, scorecard, offer, disposition and source tracking |
| Onboarding | People & HR | Designed | Offer-to-employee conversion, forms, documents, tasks, access, equipment, training and due dates |
| Offboarding | People & HR | Designed | Separation record, access removal, property, final pay inputs, document retention and handoffs |
| Learning management | People & HR | Shell live | Courses/materials, role paths, assignment rules, completion evidence, quizzes/certifications if needed |
| Performance goals | People & HR | Designed | Effective-period goals, measures, check-ins, source metrics and controllability |
| Performance reviews | People & HR | Designed | Cycles, manager/employee review, calibration, acknowledgment, development actions |
| Compensation planning | Payroll / People & HR | Planned | Salary changes, merit budgets, promotion changes, approval chain and effective dates |
| Expenses | Finance & Expenses | Live demo | Policy engine, receipt Storage, duplicate detection, coding, manager/Finance approval and payment |
| Employee reimbursements | Finance / Payroll | Live demo | Payout method, payroll vs separate reimbursement, settlement and accounting |
| HR workflows | My Work / People & HR | Partial | Configurable request types, routing, delegation, due dates, escalations and notifications |
| Employee inbox / alerts | Home / My Work | Partial | Persistent tasks, announcements, acknowledgments, reminders and escalation |
| Org chart / directory | People & HR | Planned | Department/team/job hierarchy, manager tree, searchable directory and privacy rules |
| Compliance acknowledgments | People & HR | Shell live | Policy versions, required audiences, due dates, signatures/acknowledgments, exception reporting |
| Workforce analytics | Reports | Partial | Headcount, turnover, absence, labor cost, training, payroll, recruiting and performance metrics |
| Audit history | All modules | Partial design | Immutable actor/event/before-after/reason/timestamp records for every material change |
| Role security | Administration | Demo enforced | Firebase Auth + Firestore/Storage rules, field/document restrictions, admin audit |
| Mobile usability | All employee modules | Partial responsive | Mobile-first time, PTO, pay, benefits, expenses, training and approvals |
| Workflow automation | Cross-platform | Rule engines started | Event workers, scheduled evaluations, task creation, notifications, retries and reconciliation |

## Build rules

1. Do not create a separate HR truth and payroll truth for the same fact. Effective-dated employee records feed downstream systems.
2. A request is not a decision. Preserve request, reviewer, decision, reason, effective date and downstream result separately.
3. A payroll amount must drill to source time, earning, deduction and tax records.
4. A benefit deduction must drill to the benefit enrollment/effective period that created it.
5. A time-off balance must be calculated from a policy plus accrual/use/adjustment ledger, never a silently edited total.
6. A performance metric must drill to the same source records used elsewhere in Momentum.
7. A compensation earning ID can be consumed by only one active payroll payment record unless a documented reversal/reissue occurs.
8. Employee documents and sensitive HR records require stricter access rules than general company records.
9. Production automation must be server/event driven. Browser-local calculations are only the interactive development shell.
10. Unknown company policies remain configurable placeholders; no wage, tax, benefit, leave, deduction or disciplinary rule is invented.

## Near-term HCM sequence

1. Canonical employee + job/manager/effective-date data model.
2. PTO policy/balance ledger and schedule impact.
3. Benefits plan/enrollment/dependent/contribution model.
4. Payroll earning/deduction/tax data model and immutable pay-run ledger.
5. Recruiting + onboarding/offboarding.
6. Learning paths + acknowledgments.
7. Goals/reviews/compensation planning.
8. Workforce analytics and audit exports.
9. Firebase migration, security rules, Storage and event automation.
10. Money-movement rails, filing/export interfaces and production reconciliation.
