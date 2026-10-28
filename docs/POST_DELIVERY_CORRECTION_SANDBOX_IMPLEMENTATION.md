# Administrator post-delivery corrections and sandbox SKU management

**Status: implementation draft. Not deployable until functions, UI, email, inventory and security gates are complete.**

## Requested outcome
- Administrator can open a delivered order, propose corrected SKU/case quantities, and reissue a distinct amended invoice.
- Inventory changes through append-only exact SKU/lot custody movements in the same trusted transaction as order and invoice updates. Retain prior signatures, original PDF, historical stock movements, and full audit history.
- Another Administrator must approve. This retains the October 26 two-person approval decision.
- An amended invoice is emailed exactly once after the transaction commits.
- Administrator can register new SKUs. Test SKUs and stock run in an isolated sandbox, not production inventory, invoices, payments, commission or notifications.

## Production safeguards
1. Reductions require physically verified return from customer custody into quality hold, not an automatic increase in sellable warehouse stock. Additional deliveries must come from real, verified company custody. Require exact SKU/lot and proof.
2. Retain contractual unit prices in the first version. Changes to a paid invoice or disputed amount require Finance credit/refund reconciliation.
3. Preserve superseded invoices as historical Void records with revision IDs. Keep the latest amended invoice separate, with an idempotent outbound email.
4. A test product priced at zero is not isolation. Use separate sandboxProducts, sandboxInventory and sandboxOrders records, with production catalog and real flows unable to reference them.
5. No browser can approve, forge, or apply a correction by modifying Firestore directly. Authenticated server transaction required.
6. Desktop and mobile save/reload and latency acceptance must be observed, not inferred from CI.

## Incomplete paths in this PR
- Correction transaction is preliminary and must pass exact product, accounting, inventory, transaction ordering, idempotency and Firestore tests before being exposed.
- Authenticated submit/approval endpoints, user interface, and amended-invoice sender still require wiring and testing.
- Sandbox catalog creation policy and isolated data rules exist as early groundwork; admin management interface, sandbox stock and test-order lifecycle require implementation.
- No feature is released merely because a draft PR was opened.

## Acceptance
- A delivered 10-to-8 case correction with physical proof posts exactly 2 cases into hold, preserves original proof, revises the same order and invoice, and queues exactly one amended PDF.
- Concurrent edits, missing proof, stale order, self-approval, insufficient lot custody, mismatched SKU and financial activity fail without partial changes.
- Historical invoices remain traceable even after corrected totals differ; there is no double revenue/payment counting.
- Test SKU inventory and orders remain wholly separate from real stock, invoices, commissions and customer emails.
