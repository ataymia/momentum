# Commerce release gate (D01–D18)

Ownership: Momentum D workstream. Date: 2026-11-06. All implementation here remains isolated and requires release approval.

## Truth and authority
- The supplied retailer program states a minimum 10-case opening order at $24 per 24-can case during a 60-day introduction. At least 20 cases purchased during that introduction may qualify for pricing through the next complete calendar quarter. Established pricing is reviewed by completed calendar quarter, not a rolling 90-day window.
- The pre-existing connected pricing engine still uses a rolling-window volume calculation. The new price-book evaluator is **comparison-only**, and its display does not approve pricing or contracts.
- Pricing eligibility requires approval of the account/location program, authoritative date and payment evidence. Source document wording does not conclusively resolve whether unpaid orders count toward first-60-day purchased cases. The current comparison uses paid orders as a conservative assumption. The decision owner must resolve that before activation.
- Account-level exceptional pricing, tax, rebates, freight, credit terms, and major-chain negotiations must remain outside the default retailer price book.

## Product and stock readiness (D01–D03)
- Verify supplier SKUs, case packs, barcodes, warehouse receipt evidence, custody lots, best-by dates and quality holds with authorized source records.
- A catalog item's presence is not proof stock is sellable. Warehouse availability must be computed from source custody plus active reservations, minus holds. Unknown or fuzzy-matched SKU names must not be allocated automatically.

## Price Book and ordering (D04–D09)
- Publish no default price-book change until decision owner signs off on migration cases for Day 1, Day 60, Day 61, quarter transition, returns and account-specific overrides.
- Every confirmed order must retain immutable order line prices, approval decision, owner, fulfillment movements, invoice link, payment allocations, and history. History rows must have real event times.
- A return movement, credit note, refund approval and actual settled refund are distinct events. Credit and refund records need immutable source links, adjustment review and idempotency; a physical return alone is not customer cash entitlement.
- A displayed Paid state without reconciled invoice balance and trusted settlement evidence is an exception, not proof of cleared funds.

## Payment provider and cash controls (D10–D16)
Owner action: approve one initial provider architecture and merchant account; no card or bank data is stored directly in Momentum.
- Compare ACH and card transaction fees, verification/mandate fees, failed debits, disputes, refund costs, settlement times, approval friction and operational reconciliation at actual order-size distribution.
- Secure invoice links must be issued by authenticated server endpoints, bound to the canonical invoice/account/amount, and expire or revoke on payment, credit, refund or correction.
- Card tokenization, ACH mandates and payment details stay with the provider. Never accept a browser callback as proof a payment cleared.
- Signed provider webhook events must verify raw body and timestamps, deduplicate event IDs, bind processor IDs to recorded company invoices/customers and use atomic reconciliation on the server.
- Awaiting settlement, cleared, failed, reversed, refunded and disputed states must be distinguishable. Refunds may not create duplicate payment credits or incorrect sales commissions.
- One-time payment collection applies to the active invoice. Monthly/quarterly recurring authorization applies to **new approved invoices**, and cannot re-charge the original invoice indefinitely. Authorization, revocation, cadence change, limits and customer notifications need acceptance tests.
- Representative-initiated requests require account ownership/visibility checks, verified customer recipient, provider-issued secure link, audit trail and cancellation/retry controls.

## Customer portal (D12–D17)
- Customer registration must bind authenticated users to explicitly authorized business locations; reject URL-based cross-account access. Multi-location association and revocation need server tests.
- Customer invoice, statement, payment and document reads require server-enforced tenant scope. A local-demo guard is not a production security control.
- Customer payment creation remains disabled until processor and consent are approved.

## Real email notifications (D18)
- Rep confirmation and dispatch notices are produced from trusted status transitions with active-employee checks, idempotent outbox records and gated transport.
- A "paid" notice may only be triggered by a **server-verified settled invoice**, not a client change to Paid. This is blocked until the payment provider webhook is integrated and audited.
- Transport remains gated by approved sender, recipient rules, secrets and activation cutoff; never bulk-replay historical operational events.

## Release acceptance evidence
1. Exact live merchant terms, company owner approval and credential management.
2. Unit and integration tests for pricing, ledger invariants, refunds, chargebacks, replay attacks and cross-tenant isolation.
3. Latest full GitHub audit green on the final commit; security rules and Functions build green.
4. Staging browser/mobile testing with real roles and fake processor sandbox tokens; no real-charge QA.
5. Written owner approval to merge, activate notifications or deploy. A PR never satisfies this gate automatically.
