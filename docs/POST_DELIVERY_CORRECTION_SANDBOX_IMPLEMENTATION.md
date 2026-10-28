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

## Implemented on this draft branch (not deployed)
- Administrator correction proposal/review UI and two-person server-side approval endpoints exist. The transaction plans exact-SKU/lot inventory movements, amends the order, creates a new invoice revision, and creates an idempotent reissue event.
- Additional safeguards now block historical source lines with mismatched totals, invalid or partial SKU lines, return movements drawn from another order's customer custody, nonwarehouse stock held for another order, and restricted-lot delivery. Duplicate SKU lines are summed rather than silently replaced.
- An Administrator can create an isolated **test** SKU through a server-validated, idempotent transaction. The product-name index prevents parallel duplicate registrations. Sandbox SKU, simulated receipts, orders, inventory and invoice records are not production commerce records. Browser writes to SKU metadata are denied.
- Inventory includes a clearly named test-SKU modal with a prefilled fictional QA product. This is a proposed UI, not a live seeded Firestore product.
- Pending corrections can now be withdrawn by the requesting Administrator or rejected by another Administrator, with server-atomic release of the pending lock and an auditable reason. Neither operation posts inventory or edits an invoice.

## Still incomplete / required before merge
- **Do not represent the full feature as delivered.** Corrections currently support adjusting quantities on existing order SKU lines and billing address. Arbitrary historical SKU substitution or new line insertion is not implemented.
- Physical proof is still an approver-reviewed reference string; cryptographic/document-backed custody validation and an actual return-receipt evidence workflow need independent verification. Until then, an approved correction could still be based on false human evidence.
- The Paid-order correction action is intentionally hidden until a Finance-controlled reconciliation path exists. Existing paid records remain reviewable without pretending they can be safely amended.
- Original PDF retention must be proven end to end. Keeping the original invoice record and prior email outbox does not by itself guarantee that the exact original invoice PDF is available for future audit.
- Production SKU master records remain hard-coded in `lib/product-catalog.ts`. Manual creation of **sellable** SKUs, approved barcodes, receiving, order entry, picking, invoice/reporting integration and safe deactivation is not implemented. Do not use a test SKU as a production SKU.
- Test flow supports simulated receipt, order and delivery, not a full production-equivalent checkout, card capture, or customer email. This is intentional isolation, but the test coverage must be stated accurately.
- A draft branch cannot prove cloud persistence, Firebase Function and Firestore rules rollout, reissued PDF/email, offline/concurrent writes, or mobile performance. Require all CI checks, two-admin emulator/role smoke tests, a verified PDF archive path, and release approval before deployment.
- No feature is released merely because a draft PR was opened.

## Acceptance
- A delivered 10-to-8 case correction with physical proof posts exactly 2 cases into hold, preserves original proof, revises the same order and invoice, and queues exactly one amended PDF.
- Concurrent edits, missing proof, stale order, self-approval, insufficient lot custody, mismatched SKU and financial activity fail without partial changes.
- Historical invoices remain traceable even after corrected totals differ; there is no double revenue/payment counting.
- Test SKU inventory and orders remain wholly separate from real stock, invoices, commissions and customer emails.
