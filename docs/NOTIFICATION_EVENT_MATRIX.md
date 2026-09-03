# Momentum Notification Event Contract

Status: pre-backend product specification
Date: 2026-09-03

## Core rule

Audit and notification are different systems.

- Audit records every material create/update/delete with actor, time, source record and changed fields.
- Notification sends only a defined business event to people who need to know or act.
- An audit mutation must never automatically become an email or SMS merely because it changed.
- Notification copy must be safe for the recipient. Sensitive values do not belong in SMS/email subjects or lock-screen text.
- A notification must link to the exact authorized source record in Momentum.

## Channels

Each user/customer can independently choose:

- In-app
- Email
- SMS

Supported combinations: any single channel, any combination, all three, or all off except mandatory security/compliance notices that the company later explicitly defines.

A destination is required before its channel can be enabled:

- Email requires a verified email address.
- SMS requires a verified mobile number and consent/status required by the selected provider and applicable law.

## Preference model

Preferences should be owned by the individual account, with optional administrator policy only for company-required notices.

Recommended categories:

1. Orders & payments
2. Accounts & sales
3. Appointments & schedule
4. Inventory & fulfillment
5. HR & time
6. Payroll & benefits
7. Expenses & finance
8. Training & performance
9. Marketing requests
10. System/security

Recommended importance levels:

- Critical: blocking, failed, cancelled, security or action required immediately.
- Important: approval, return, assignment, schedule/order change, due soon.
- Routine: completion, acknowledgement, informational update.

Users should be able to choose channels by category and optionally suppress Routine notifications while retaining Important/Critical alerts.

## Event matrix

| Domain | Business event | Primary recipient | Secondary/escalation | Default importance | Exact source |
| --- | --- | --- | --- | --- | --- |
| Customer order | Order submitted | customer/requester | responsible rep | Important | Order |
| Customer order | Order approved | customer/requester | responsible rep | Important | Order |
| Customer order | Order returned/correction required | requester | responsible manager | Important | Order |
| Customer order | Order allocated | customer when customer-facing status is enabled | responsible rep/ops | Routine | Order |
| Customer order | Out for delivery | customer | responsible rep/ops | Important | Order/delivery |
| Customer order | Delivered | customer | responsible rep | Important | Order/delivery |
| Customer order | Invoice issued | customer billing contact | account owner | Important | Invoice |
| Customer order | Payment cleared | customer billing contact | account owner/finance | Routine | Payment/invoice |
| Customer order | Payment failed/reversed/refunded | customer billing contact | finance + account owner | Critical | Payment/refund |
| Sales account | Account assigned/transferred | new/current responsible rep | sales manager | Important | Account |
| Sales account | Material contact/decision-maker change | responsible rep | sales manager when configured | Routine | Account/contact |
| Sales account | Account marked at risk/blocking | responsible rep | manager | Important | Account |
| Sales account | Partner Pricing status changes | responsible rep | manager; customer only if company approves customer-facing pricing notice | Important | Account/pricing evaluation |
| Sales account | Sales bonus milestone earned | credited rep | manager/payroll | Routine | Bonus earning/source orders |
| Appointment | New appointment assigned | assignee | manager/dispatch | Important | Appointment |
| Appointment | Appointment time/owner/location changed | assignee | customer when customer-facing; manager | Important | Appointment |
| Appointment | Upcoming appointment reminder | assignee | customer if configured | Important | Appointment |
| Appointment | Appointment cancelled | assignee + customer if applicable | manager | Critical | Appointment |
| Appointment | Closeout missing/overdue | assignee | manager | Important | Appointment |
| Inventory | Quality hold created | ops/warehouse | director/admin | Critical | Lot/hold |
| Inventory | Quality hold disposition required | authorized reviewer | director/admin escalation | Critical | Lot/hold |
| Inventory | Product below reorder threshold | warehouse/ops | director/admin | Important | Product inventory status |
| Inventory | Product below manager-approval threshold | sales manager + ops | director/admin | Critical | Product inventory status |
| Fulfillment | Order ready for warehouse action | operations/warehouse | director if overdue | Important | Order/allocation |
| Fulfillment | Delivery exception | assigned operations | manager/director | Critical | Delivery/order |
| Time | Timecard ready to submit | employee | manager if overdue after policy threshold | Important | Timecard |
| Time | Timecard submitted | approving manager | employee in-app confirmation | Routine | Timecard |
| Time | Timecard returned | employee | manager | Critical | Timecard |
| Time | Timecard approved | employee | payroll queue | Routine | Timecard |
| Time | Missing/open punch near submission deadline | employee | manager if unresolved | Important | Time entry/timecard |
| Time off | Request submitted | manager/approver | employee confirmation | Important | Leave request |
| Time off | Approved/returned | employee | manager/HR | Important | Leave request |
| Benefits | Enrollment/life event submitted | HR/approver | employee confirmation | Important | Enrollment/event |
| Benefits | Enrollment approved/returned | employee | payroll when deduction-affecting | Important | Enrollment |
| HR | Required document/policy acknowledgement assigned | employee | HR/manager if overdue | Important | Document/policy |
| HR | Onboarding/offboarding task assigned | task owner | HR/admin escalation | Important | Lifecycle task |
| Training | Training assigned | employee | manager/HR | Important | Training assignment |
| Training | Training due soon | employee | manager if policy says | Important | Training assignment |
| Training | Training overdue | employee | manager/HR | Critical | Training assignment |
| Performance | Daily report due after work is detected | employee | manager if overdue | Important | Daily report requirement |
| Performance | Report submitted for review | manager | employee confirmation | Important | Performance report |
| Performance | Review completed/note added | employee | manager | Routine | Performance report |
| Payroll | Pay statement released | employee | payroll admin | Important | Pay run/pay statement |
| Payroll | Payroll setup blocks employee from run | payroll admin | HR/admin | Critical | Payroll employee/setup record |
| Payroll | Disbursement failed | payroll admin | director/admin; employee with safe copy if pay affected | Critical | Disbursement |
| Expense | Expense submitted | manager | requester confirmation | Important | Expense |
| Expense | Expense returned | requester | manager | Critical | Expense |
| Expense | Manager approved | finance/admin | requester confirmation optional | Important | Expense |
| Expense | Reimbursement approved/paid | requester | finance | Routine | Expense |
| Marketing | Support request submitted | marketing/admin owner | requester confirmation | Important | Marketing request |
| Marketing | Request approved/returned/fulfilled | requester | marketing owner | Important | Marketing request |
| Marketing | Campaign/spend approval required | authorized approver | owner/escalation if overdue | Important | Campaign/spend request |
| System | Permission/security-sensitive account change | affected user/admin | security/admin | Critical | User/security record |
| System | Integration delivery failure | administrator | integration owner | Critical | Delivery/integration log |

## Customer-safe rules

Customer notifications must never expose:

- internal sales compensation or bonus data
- internal margins/costs
- inventory quantities not intended for the customer
- employee or HR data
- internal approval commentary
- internal account-risk/coaching notes
- other customers/locations

Customer notification copy should use customer-facing order, invoice, payment, delivery, appointment and approved pricing language only.

## Reminder rules

Scheduled reminders are derived events, not fake record updates. They require backend/server workers after Firebase.

Examples:

- appointment reminder at configurable lead time
- timecard reminder near configured submission deadline
- overdue training/document acknowledgement
- overdue approval or unassigned appointment
- payment/invoice due reminders if company policy enables them

The worker must persist a deterministic reminder key such as `eventType:sourceId:recipient:scheduledWindow` so the same reminder is not sent repeatedly.

## Delivery lifecycle

Production delivery records need:

1. business event ID
2. source entity type + ID
3. recipient ID
4. channel
5. safe rendered template/version
6. destination snapshot (masked in normal UI)
7. queued timestamp
8. provider message/reference ID
9. sent/delivered/failed timestamps
10. failure code/reason
11. retry count and next retry
12. cancellation/suppression reason
13. user preference snapshot used for the decision

Recommended state path:

`Queued → Sent → Delivered`

Exception paths:

`Queued → Failed → Retrying → Sent/Delivered`

or

`Queued → Suppressed`

A dead-letter/failed-delivery queue belongs in Administration so important notices do not disappear silently.

## Backend integration contract

Firebase/server workers should own:

- event fan-out after committed business state changes
- scheduled reminder evaluation
- recipient authorization and preference evaluation
- dedupe/idempotency
- template rendering
- provider dispatch
- retry/dead-letter handling
- delivery receipts
- immutable notification/delivery history

Browser code should not contain provider secrets and should not be responsible for guaranteed delivery.

## Current product-layer findings

The existing notification engine already has In-app/Email/SMS channel concepts, per-user channel preferences, delivery records, audit-event routing, dedupe keys and in-app escalation. It is a useful base, but it currently needs these changes before outbound integration:

- separate business notification events from raw audit events;
- add event category and importance preferences;
- add individual self-service notification settings;
- support customer preferences and customer-safe event copy;
- make notifications open the exact authorized source record;
- consolidate legacy workspace notifications with the native delivery stream;
- add deterministic scheduled reminder events;
- add production queued/sent/delivered/retry/dead-letter states.
