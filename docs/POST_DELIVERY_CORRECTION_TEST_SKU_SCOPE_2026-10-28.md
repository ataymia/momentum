# P0 scope expansion: historic corrections + isolated test SKUs (2026-10-28)

**Status: design and partial implementation only. NOT safe for production.** No delivered-order edit must be exposed or deployed until server transactions, inventory custody, invoice reissue, rules, and notification tests pass.

## User requirements

1. Administrator can edit historical and delivered order lines, including quantities and SKU substitutions where valid. Authorized participants may request a correction; an Administrator other than requester approves it as the October 26 decision specifies.
2. Approved corrections automatically reconcile physical inventory by original lot/SKU, driver custody, customer delivered quantities, warehouse location, and explicit correction movements. Never merely edit order counts or refund stock to warehouse without proof it physically returned.
3. Retain original delivery signature, order revision, old invoice PDF, payments, credits and audit trail. Generate an amended invoice with revision number only after successful committed reconciliation; send one idempotent correction email to the customer's billing email.
4. Administrators can create and maintain SKU master records without source edits: SKU ID, description, pack size, active status, product class (sellable vs test), verified barcode optional; role-gated create/edit/deactivate, duplicate checking, explicit lifecycle and audit. Never allow stock quantities to be established by simply adding SKU metadata.
5. A clearly labeled **test product** supports QA without depleting real Golden Eagle inventory. Simply adding a $0 SKU in live production is NOT isolation: test lots, orders, inventory, payment, invoicing, email, commission, dashboards and external webhooks must use a separate test environment or equivalent server-enforced partition. Test transactions must never email real customers or result in real stock movements.

## Technical blockers found in current main

- Static hardcoded `GOLDEN_EAGLE_SKUS` currently used by sales, inventory and fulfillment. There is no persisted dynamic SKU master with role authorization.
- `normalizeCommerceState` rejects any invoice whose total does not equal current order amount. Historical revisions would disappear without an explicit immutable revision model.
- Delivered-invoice email currently chooses the first nonvoid invoice for an order and deduplicates by invoice ID. Reissue needs a revision-specific outbox and preserved original PDF.
- Inventory custody comes from lot-level movements; changing order quantities alone cannot adjust actual custody, particularly when cases already reached customers.
- Existing proposal code in this branch is only a *partial, fail-closed scaffold*: it does NOT yet support inventory-verified quantity or SKU corrections, complete invoice history compatibility, role-based request review UI, or notification reissue. Do NOT merge until these are complete.

## Acceptance gates

- Edit an older signed 10-case order to 8 cases using proof of two physically returned/undelivered cases: exactly one inventory movement for the correct lot and custody destination, distinct old/new invoices, retained signature, accurate balance, one amended email.
- Same request without returned-case evidence: fail closed, unchanged inventory/order/invoice.
- Wrong lot, SKU swap with no valid custody, stale version, self-approval, duplicate submission, and conflicting parallel edits: fail closed.
- Already-paid order: require explicit credit/refund and payment reconciliation; no overwriting settled invoice.
- Admin creates an ordinary sellable SKU; correct order entry, lot receipt, allocation, picking, shipping, invoicing, reporting, audit and deactivation without code deploy.
- Test SKU and test stock used for full test checkout: no production stock deduction, customer email, payment, commission or KPI pollution.
- Page responsiveness and save/reload measured for desktop and mobile, including slow network, no N+1 per-account or per-SKU fetches.

**Decision owner:** Flo for commercial effects/payment-credit policy and authority; Mia for operational acceptance and release sequencing.
**Next engineering dependency:** choose and enforce test environment separation before enabling editable production SKU stock or any delivery correction posting.
