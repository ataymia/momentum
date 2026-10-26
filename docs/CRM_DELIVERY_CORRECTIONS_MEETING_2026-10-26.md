# October 26 CRM meeting brief: delivery corrections and locations

**Status:** design decisions captured; high-risk transaction features NOT implemented or approved for production. Do not claim that draft requests, test orders or delivery cleanup are available until server, security and integration tests pass.

## Decision made by Flo and Mia

- Any authorized workflow participant can **submit** a delivery correction, but no correction may take effect before an **Administrator approves** it.
- Edits must be available before handoff and after a delivery is recorded. No one should directly rewrite historical delivery evidence.
- On approval, apply the correction to the same order, inventory custody, invoice and payment ledger under a server-validated transaction. Revision-based invoice notifications must only be sent **after** committed, reconciled evidence is confirmed.
- Full Administrator controls should be available for test and erroneous delivery records, subject to a preserved audit trail and inventory reconciliation.

## Required correction request model

`deliveryCorrectionRequests/{id}` (proposed new collection, not yet deployed):
- originalOrderId, originalTaskId, requesterUid, requestTimestamp, state (Submitted, Returned, Rejected, Approved, Applying, Applied, Failed/Reconciliation required)
- reason, changeType (Quantity, SKU, Recipient/address, Delivery status, Collection reference, Driver note, Void test)
- observedDeliveredQuantities (by lot/SKU), requestedDeliveredQuantities (by lot/SKU), evidenceReference, optional recipient acknowledgement
- snapshot hash/version of order + delivery + invoice + inventory movement source records
- approvalUid, approvalTimestamp, approvalNote, appliedAt, resultingMovementIds, originalInvoiceId, replacementInvoiceRevisionId, notificationId
- idempotency key and a history of state transitions

Only employees with explicit delivery access can submit. Only an active Administrator can approve, reject, or apply. A requester may not self-approve, even if the requester is an Administrator. Review must display a full before/after diff. Firestore rules must deny arbitrary client mutation of approved/applied requests. Use a trusted Firebase Function for state transitions.

## Posting and payment controls

1. Lock order, delivery task, ledger lots/reservations and invoice against the saved revision or fail closed on concurrent changes.
2. Distinguish **undelivered** from **returned after delivered** and **never loaded**. A delivery shortfall does not automatically establish sellable returned stock in the warehouse.
3. Post explicit correcting/reversing inventory movements linked to the original movement IDs; validate nonnegative location/driver/warehouse balances, lot statuses, expiry and physical location.
4. Recompute order totals and invoice line quantities from approved, exact SKU/case values and original contractual unit prices. Never change prices silently.
5. If payment already settled, produce credit/refund/adjustment workflow, not a retroactively overwritten settled invoice. Preserve original PDF and revision lineage. Reconcile amount collected and outstanding balance.
6. Use outbox idempotency: only one amended invoice notice for each successful approved revision. Retry failures without repeating stock movements.
7. Keep original signature, who accepted which cases, original timestamps, and all historical delivery tasks in auditable storage.

## Legacy/test clean-up

- First export and reconcile every claimed test delivery against inventory, accounting and signed emails.
- Full Administrators may **void/archive** a confirmed test delivery only after identifying its source. Never physically delete completed inventory, invoice or custody evidence.
- "Release to inventory" is permissible only after the cases are physically accounted for and their lot/condition is verified, not from a deletion click.
- Set up a **separate sandbox/test product and isolated test inventory/payment environment**. A $0 item in production inventory is not isolation. Sandbox transactions must never trigger real invoicing, payment collection, sales incentives, or real SKU stock movements.
- Ground Shaker and other currently stuck orders require specific order IDs, affected accounts, current task/order/lot statuses, exact error text and last cloud-sync result before an individual repair.

## One customer, multiple delivery locations

The current schema already defines `CustomerAccount` as billing parent and `Account.customerId` as the link for physical locations. Do not introduce a second disconnected `Account` or overwrite existing location histories.

Proposed workflow: open customer -> Add location -> site label, business address, distinct delivery address, contacts, territory, responsible rep, delivery instructions -> server duplicate check -> create one new location child linked to immutable existing `customerId`. Each location retains unique orders, payment references, geofences, custody destination and activity. Billing settings remain inherited from the parent with explicit per-site exceptions if supported. Concurrent creation, ownership scope, and existing historical account records need migration checks.

## Operational acceptance tests

- Rep requests a 10->8 case correction; nothing changes before Administrator approval.
- Wrong lot or overdraw, stale revision, separated requester/approver, duplicate approval, and missing signature all fail closed.
- Approval creates exactly one inventory adjustment and one invoice revision, and does not duplicate the email on retry.
- A signed 10-case delivery altered to 8 cases retains both the original proof and reasoned correction; the customer's original and revised invoice remain traceable.
- Real delivered stock is not returned to warehouse by voiding a test record.
- A multi-location customer's new site appears in the parent list and new order/address search, while old site orders stay correctly linked.
- The delivery queue never asks a driver to sign again when order/task records already disagree.
