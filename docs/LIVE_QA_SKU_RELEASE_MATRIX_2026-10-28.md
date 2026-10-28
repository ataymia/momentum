# Live QA SKU and virtual inventory release matrix
**Owner:** Operations / Engineering  |  **Date:** 2026-10-28
**Release status:** DEVELOPMENT BRANCH ONLY until verified end-to-end acceptance.

## User requirement confirmed
Administrators must manually create a new **live catalog test SKU**, select it in the same Orders workspace used by real Golden Eagle orders, submit it into normal order approval, and progress the resulting order through Allocated, Out for delivery and Delivered. The QA product must cost $0, never remove real cases or create collectible invoices, customer communications, processor payments, accounting revenue or commissions. This is distinct from an isolated sandbox order demo.

## Implemented model
- `liveTestProducts/{id}` is the server-owned **production-context QA catalog**, with `testOnly=true`, `environment=production`, `pricePerCase=0`, and a mandatory QA/TEST name prefix.
- An Administrator creates the SKU from Inventory -> Live QA products, then issues test cases into `liveTestInventory/{skuId}`. These are **virtual cases**, not physical receipts. Real Golden Eagle lots and ledger movements stay untouched.
- In the same Orders page, only an Administrator sees QA SKU options, and cannot mix QA with sellable products. A QA order is saved in `domains/commercial/fields/orders` with `testOnly=true`, a `testSkuId`, and zero price and amount. It enters the normal order-approval chain.
- A trusted server advances Approved -> Allocated -> Out for delivery -> Delivered. It reserves/decrements virtual stock and writes immutable `liveTestOrderEvents` evidence. Its cancellation action releases pending virtual reservations. This simulates custody, not proof of a physical delivery.
- QA orders are not invoiced, charged, emailed, commissioned or included as sold physical cases. QA details are hidden from ordinary account/sales UI roles. The Firestore master and virtual counters are Administrator-readable and server-writable only.

## No-go gates
1. Confirm Firebase Functions compile/lint, application typecheck/build, emulator security tests, and all QA regression tests against the **same final SHA**.
2. Real Administrator acceptance: create QA SKU, give it 20 virtual cases, reload, select it in Orders, submit 6 cases, reload, approve, reserve 6 QA cases, simulate shipment and delivery, reload and verify balance 14. A normal 10-case Golden Eagle order and its physical lot balance must remain unchanged.
3. Repeat as a non-admin and customer: QA products and orders must not appear in any customer, sales, warehouse or driver view. No unauthorized writes to QA catalog, virtual quantities or status records.
4. Confirm no QA email outbox, customer invoice PDF/email, Helcim collection, accounting event, cash allocation, rep commission, sales scorecard, replenishment alert, or customer CRM activity.
5. Network/performance: measure mobile Safari and desktop first load, selector responsiveness, save/refresh and order switch latency against accepted baseline. Check document shard size under realistic load.
6. Verify rejection, duplicate request replay, concurrent reservation attempts, cancellation before/after allocation, missing QA stock, stale approval, and no negative virtual/physical balance.
7. The other changes in PR #100, including historical corrections, still require original signed PDF archive proof and the financial/reversal acceptance suite before combined production release.

## Release decision
**Do not merge or deploy** solely because static tests pass. This file is an auditable checklist, not a representation that production acceptance was executed. Flo or the authorized release owner must approve production deployment after the above evidence exists.
