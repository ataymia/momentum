# Momentum Notification Policy v1

Status: Approved operating policy
Approved by: Mia, Director of Operations
Date: 2026-10-17

## Purpose

This document is the source-of-truth roadmap for the Momentum notification-system refactor. Notification behavior must be derived from one canonical policy instead of separate Action Center, bell, audit, and email rules.

## Channel model

- Audit log: historical record. Routine successful activity belongs here, not in notifications.
- Action Center: work the user must take or resolve.
- Bell / in-app: important awareness, reminders, status changes, and actionable exceptions.
- Email: reserved for customer milestones and selected employee events that need prompt attention outside the app.
- SMS: out of scope. Do not send SMS.
- A normal audit event does not automatically become a bell, Action Center item, or email.
- A bell item does not automatically become an email.

## Customer email routing

- General customer status emails: Accounts Payable email first, then billing email, then the location/account primary email.
- Invoice delivery: billing email only. Do not silently fall back to A/P or primary email for an invoice.
- If the required billing email is missing at delivery, create an internal in-app exception instead of sending the invoice elsewhere.
- Automated sender: Momentum Distribution <notifications@momentumdci.com>.
- Current Reply-To: ataymia@momentumdci.com.

## Order and delivery policy

| Event | Recipient | Action Center | Bell / Portal | Email | Rule |
|---|---|---:|---:|---:|---|
| Order submitted for approval | Authorized approver | Yes | Yes | No | Customer is not notified yet. Submitted is not confirmed. |
| Order returned / correction required | Requesting rep | Yes | Yes | Yes | Prompt correction required. |
| Order approved / confirmed | Customer | No | Yes | Yes | "Confirmed" means approved by an Administrator, not merely submitted by a rep. |
| Order approved | Owning / credited rep | No | Yes | No | In-app awareness only. |
| Confirmed order cancelled | Customer | No | Yes | Yes | Only customer-facing once the order had already been confirmed. |
| Confirmed order cancelled | Owning / credited rep | No | Yes | Yes | Cancellation is important enough for external interruption. |
| Ordinary order edit | Nobody | No | No | No | Audit only. |
| Delivery assigned | Assigned driver | Yes | Yes | No | Work assignment. |
| Packed / allocated | Nobody | No | No | No | Status only, no notification. |
| Out for delivery | Customer | No | Yes | Yes | Customer milestone. |
| Out for delivery | Owning / credited rep | No | Yes | No | In-app awareness only. |
| Delivered | Customer | No | Yes | Yes | Delivery email includes signed invoice PDF. |
| Delivered | Owning / credited rep | No | Yes | No | In-app awareness only. |
| Failed delivery | Nobody | No | No | No | Event/state is not part of Momentum's business process and must be eradicated from notification logic. |

## Invoice policy

- Do not create separate "invoice issued," "invoice overdue," or similar invoice-notification events.
- Normal policy is DELIVERY ONLY.
- Before delivery, an invoice may exist internally as a draft/pre-delivery record but is not live/owed by the customer.
- The invoice becomes live when delivery is completed or an authorized Administrator delivery override records delivery.
- Delivery requires the customer's delivery signature unless an authorized Administrator override is used.
- Immediately upon delivery, send the invoice once as a PDF to the customer's billing email.
- The PDF must contain the delivery signature when a signature exists and must reflect the authorized delivery record.
- Customer obligation begins when product is delivered, not merely when an order is approved or fulfillment begins.
- If delivery cannot be fulfilled, the customer does not owe the invoice under this normal flow.

## Payment policy

| Event | Recipient | Action Center | Bell / Portal | Email | Rule |
|---|---|---:|---:|---:|---|
| Payment received / cleared | Customer | No | Yes | Yes | Send only after payment is confirmed/cleared. |
| Payment received / cleared | Owning / credited rep | No | Yes | No | In-app awareness. |
| Payment failed | Customer | No | Yes | Yes | One failed-payment email at most every 30 minutes, with a maximum of two failed-payment emails in any rolling 24-hour window for the same customer account and recipient email. |
| Payment refunded / reversed | Customer | No | Yes | Yes | Customer-facing confirmation. |
| Payment refunded / reversed | Relevant internal owner(s) | As applicable | Yes | Yes for the responsible rep; Admin remains in-app | Final recipient resolver must avoid irrelevant broadcasts. |

## Program pricing policy

| Event | Recipient | Action Center | Bell / Portal | Email | Rule |
|---|---|---:|---:|---:|---|
| 30-day pricing expiration warning | Customer | No | Yes | Yes | One warning per account/program/version. |
| 30-day pricing expiration warning | Account rep | Watch | Yes | Yes | Gives rep time to reconnect before expiration. |
| Pricing expired | Customer / account rep as applicable | No | Yes | No | Platform only. Do not email an "expired" message. |

## Weekly reporting policy

| Event | Recipient | Action Center | Bell | Email | Rule |
|---|---|---:|---:|---:|---|
| Sunday weekly-summary reminder | Sales Representative | Yes | Yes | Yes | Scheduled server-side reminder. |
| Sunday weekly-summary reminder | Sales Manager | Yes | Yes | Yes | Applies to manager's own required report. |
| Weekly report submitted | Manager | No | No | No | Normal work, no notification. |
| Rep weekly report delinquent | Rep | Yes | Yes | No | In-app only. |
| Rep weekly report delinquent | Sales Manager | Yes | Yes | No | In-app only. |

## Timekeeping policy

Timekeeping notifications are shelved until Momentum has a concrete timekeeping workflow. Do not generate Action Center, bell, or email notifications for submitted, returned, approved, or other timekeeping states yet.

## Expense policy

All expense workflow notifications are in-app only.

- Expense submitted: approver Action Center + bell.
- Expense returned: requester Action Center + bell.
- Manager approved: next authorized reviewer Action Center + bell.
- Finance approved: requester bell; relevant internal workflow may remain in Action Center.
- No email for expense events.
- No "reimbursement ready for payment" notification.
- No "reimbursement paid" notification.

## HR and training policy

- HR workflow notifications may remain in-app while Mia is handling the function directly.
- No HR emails for now.
- Do not add broader HR outbound email coverage until actual department staffing/workflow warrants it.
- Training notifications are currently disabled entirely. Mia trains the team personally.
- Training assignment, due, completion, and similar events should not create bell/email noise right now.

## Marketing policy

In-app only:
- Marketing request submitted.
- Marketing request returned.
- Marketing request approved.
- Campaign budget awaiting approval.

No marketing workflow email notifications for now.

## Inventory policy

| Event | Recipient | Action Center | Bell | Email | Rule |
|---|---|---:|---:|---:|---|
| Reorder threshold reached | Administrator, Warehouse, Operations | Yes | Yes | Yes | Immediate inventory-risk notification. |
| Low stock blocks sale | Relevant internal users | Yes | Yes | No | In-app operational exception. |
| Ordinary inventory movement | Nobody | No | No | No | Audit only. |

## Dispatch and appointment policy

- Do not notify for scheduled work being unassigned.
- Do not create "former employee still owns appointment" notifications.
- When an employee separates, their future/scheduled appointments must disappear from active schedules/work queues rather than generating reassignment alerts.
- Preserve necessary audit/history even though the appointment disappears from active workflow.
- A replacement employee starts fresh rather than inheriting the former employee's scheduled appointments.
- Appointment rescheduled: no notification.
- Appointment completed: no notification.
- Remove the current Action Center rule that generates "Reassign former employee's appointment."

## CRM / account policy

- Prospect/account reassigned: no notification. Existing workflow is sufficient.
- Prospect ownership released: bell notification to the relevant rep/manager scope. No email.
- Normal CRM notes, visits, edits, placement updates, and successful activity: no notification. Audit only.

## Accounting policy

- No "accounting event ready" notification.
- No "accounting policy blocked" notification.
- Mia currently handles accounting directly.
- Accounting records remain available in the accounting/finance workflow and audit log without bell/email noise.

## System notification policy

| Event | Recipient | Action Center | Bell | Email | Rule |
|---|---|---:|---:|---:|---|
| Customer email bounced | Administrator | As needed | Yes | No | In-app exception. |
| Customer email send failed | Administrator | As needed | Yes | No | In-app exception. |
| Email delivered successfully | Nobody | No | No | No | Delivery log only. |
| Backend/sync/storage error that remains unresolved | Administrator | As needed | Yes | No | Notify only after automatic resolution/retry has failed. |
| Routine successful sync | Nobody | No | No | No | Log only. |

## Admin / Operations channel rules

- Administrator: in-app/Action Center by default. Do not email routine administrative work.
- Operations: in-app/Action Center by default.
- Warehouse: in-app/Action Center by default, except reorder-threshold email.
- Customer and rep emails are intentionally selective to protect Resend volume and reduce alert fatigue.
- No SMS at this stage.

## Payment-failure email rate limit

- Scope: same customer account + recipient email.
- Minimum spacing: 30 minutes between failed-payment emails.
- Maximum: 2 failed-payment emails in any rolling 24-hour window.
- Repeated failed attempts inside the 30-minute cooldown remain visible in platform/payment history but do not create another email.
- After the second failed-payment email in the rolling 24-hour window, suppress additional failure emails until the rolling window permits another send.
- This limit applies to failed-payment email only. It does not suppress the underlying payment record, audit evidence, or in-app payment state.

## Anti-noise controls

Every production notification type must define:
1. Canonical event ID.
2. Trusted server-side source record/transition.
3. Recipient resolver.
4. Action Center behavior.
5. Bell/portal behavior.
6. Email behavior.
7. Template version.
8. Idempotency/deduplication key.
9. Cooldown or one-per-version rule where repeated state changes could spam.
10. Destination page/record.
11. Resolution rule.
12. Audit/log behavior.

Reading a bell notification does not mean the underlying work is complete. Escalation must be based on unresolved business state, not merely unread status.

## Implementation roadmap

### Phase 1 - Approved catalog
COMPLETE. This document is the approved policy baseline.

### Phase 2 - Canonical policy registry
Replace overlapping notification logic with one registry/source of truth. Remove contradictory legacy rules. Encode event, recipient, channels, source transition, dedupe, template, and target in one place.

### Phase 3 - Unified in-app surfaces
Make Action Center and bell derive from the same policy registry instead of independently generating alerts.

### Phase 4 - Resend email subset
Connect only policy rows with Email=Yes to the verified server-side Resend outbox. Keep browser clients unable to create send-authoritative outbox records.

### Phase 5 - Scheduled events
Implement server-side scheduling for:
- Sunday weekly-summary reminders.
- Delinquent weekly-report in-app state.
- 30-day program-pricing warnings.
- Any future recurring notification only after its policy is approved.

### Phase 6 - Acceptance testing and production activation
For every policy row, test:
- should notify,
- should not notify,
- correct recipient,
- correct channels,
- duplicate suppression,
- separated/inactive employee behavior,
- missing customer email behavior,
- customer billing invoice routing,
- provider bounce/failure handling,
- navigation target,
- no historical replay.

Production email remains disabled until this policy-backed implementation passes acceptance.

## Policy amendments

- 2026-10-17: Payment-failure email rate limit approved at one email every 30 minutes, maximum two emails per rolling 24 hours per customer account + recipient email.

## Verified infrastructure as of 2026-10-17

- Resend domain authentication verified for momentumdci.com.
- Sender verified: Momentum Distribution <notifications@momentumdci.com>.
- API key stored in Firebase Secret Manager.
- Signed Resend webhook deployed and rejects unsigned requests.
- Resend sending function deployed.
- Controlled direct provider test delivered successfully.
- Controlled Firestore outbox -> Firebase -> Resend -> inbox -> signed webhook -> Firestore Delivered round trip passed.
- Production automatic email sending returned to OFF after testing.
