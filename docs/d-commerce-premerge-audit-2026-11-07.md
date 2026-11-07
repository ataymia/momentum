# D workstream pre-merge audit | 2026-11-07

Repository: `ataymia/momentum`  
Working branch: `workstream/d-commerce-20261106`  
Draft PR: [#171](https://github.com/ataymia/momentum/pull/171)  
Scope: Original D01–D18 only, no duplicate requirement IDs.

**Release decision: HOLD.** This prototype is not approved for merge or deployment. Code changes are not evidence of a launched payment product. Integration conflicts, full staging acceptance, provider onboarding and commercial approvals remain.

## Controlling source and financial truth

The current Preferred Partner Program document provided by Mia sets a 24-can case, $30 standard (1–9 average monthly cases), $27 preferred (10–19), $24 partner (20+), a minimum 10-case new-location opening order, a 60-day $24 introduction, and a 20-case launch-volume exception lasting through the next full calendar quarter. Subsequent price reviews use completed calendar quarters. These are document claims, **not independently approved live contract terms**.

The legacy connected price engine still uses a rolling 90-day window and must **not** be silently switched to the new comparison engine. The document does not define a zero-case quarter price, nor does it specify whether a purchased case must be ordered, delivered, invoiced or paid. No zero-volume price or qualification basis may be invented. Taxes, freight, account-specific contracts and credits remain separate.

## D01–D18 requirement register

| ID | Current development state | Evidence and remaining acceptance gate |
| --- | --- | --- |
| D01 | Built; testing pending | Searchable/sortable canonical SKU directory. Needs multi-role mobile/browser acceptance and master-catalog verification. |
| D02 | Partial | Item detail, lot custody, linked orders, locations and movement history. A full approved product change audit and all history sources need validation. |
| D03 | Partial | Strict SKU matching and warehouse ledger-derived quantities. Verify case barcodes, lot receipts, sellable/held stock and actual product labeling with supplier and E workstream. |
| D04 | Built reference, not active pricing | Price Books directory/details and launch/quarterly evaluator with tests. Existing live 90-day policy conflicts; approvals and migration tests required. |
| D05 | Built prototype; testing pending | Orders list/detail, source-linked delivery and invoice evidence, reconciliation warnings. Full order lifecycle, mobile and permission QA outstanding. |
| D06 | Partial | Independent invoices, linked details and print/export already exist. Invoice issuance/versions and customer-facing authorized PDFs are not production-accepted. |
| D07 | Partial | Payments Received is a searchable read-only register. No actual ACH/card collection, proof of bank settlement or processor reconciliation. |
| D08 | Partial | Sales Returns custody records and Credit Notes separate; local demo uses creator/approver separation for draft/approved/applied credits. Live RMA/credits/refunds remain blocked. |
| D09 | Partial | Order/invoice/fulfillment relationships and explicit inconsistency warnings added. Historical source attribution, server-only posting and complete reconciliation need staging. |
| D10 | Blocked on merchant/provider decision | No merchant selected or contracted; no API credentials or activated processor. |
| D11 | Blocked | No server-generated, revocable, account/invoice-bound secure payment links. |
| D12 | Partial | Server-side read confirms active customer identity against administrator-controlled assigned business locations. Invitation, identity provisioning, account linking and revocation not accepted end-to-end. |
| D13 | Blocked | Connected customer account has read-only financial access, never a live charge. |
| D14 | Draft only | One-time, monthly and quarterly payment request terms are validated in non-sending previews. Mandates, cancellations, future-invoice charge creation, notifications and payment processing remain inactive. |
| D15 | Draft only | Staff can prepare terms for authorized invoice previews; no outbound payment request or real customer link. |
| D16 | Partial safety controls; core integration blocked | Client-only connected Cleared/Paid propagation blocked; customer finance projections flag ambiguous refunds/overallocations; browser-authored payment emails suppressed. Signed merchant webhooks, provider IDs, atomic settlement and refunds still absent. |
| D17 | Partial | Server-scoped customer account, order, invoice, delivery, payment and statement views; products catalog available. Documents, official PDFs, customer checkout and fully verified delivery data remain missing. |
| D18 | Partial | Trusted-source order-confirmed and out-for-delivery sales-rep email intents, with active staff checks and existing gated transport. Verified-paid notices, live sender activation and actual deliveries not tested or authorized. |

No D requirement is **Completed/Accepted**. Do not confuse a GitHub PR, prototype route, passing unit test, or local demo action with production capability.

## High-severity findings and safeguards

1. **Pricing mismatch:** 90-day connected engine vs 60-day launch and calendar-quarter program. Keep new evaluator read-only pending executive sign-off.
2. **Incorrect stock perception:** metadata/historical supplier purchase quantities are not sellable on-hand. Views now use custody ledger movements, reservations and quality holds for authorized users.
3. **Unverified funds:** connected browser settlement changes must not convert orders to Paid. Separate provider verification required.
4. **Shared payment refunds:** a refund against one payment allocated across invoices cannot be debited in full from every invoice. Server customer projections withhold ambiguous/unbalanced records; internal invoice/order views flag reconciliation exceptions.
5. **Customer data leakage:** read-only server finance endpoint rejects client account-selection claims and requires verified active Customer access plus assigned locations. Firestore rules and live role tests still required.
6. **Misleading customer messaging:** client-writable payment and refund statuses do not authorize delivery of financial receipt/refund emails. Verified payment notices stay disabled pending processor-backed events.
7. **Customer finance truth:** a calculated zero ledger balance is displayed as recorded, not independently bank verified. Refunds, credits and settlement remain distinct.

## Payment provider decision brief (unapproved)

Published standard US online rates, not a negotiated quote:

| Comparison at a $240 qualifying 10-case opening order | Fee calculation | Advertised base cost | Dependencies |
| --- | --- | --- | --- |
| GoCardless Standard domestic ACH | $240 × 0.5% + $0.05, capped at $5 | $1.25 | ACH-only; card backup needs another provider. Published failure fees $5 and refund fees $0.50. |
| Stripe ACH Direct Debit | $240 × 0.8%, capped at $5 | $1.92 | Financial Connections verification if used is quoted separately; ACH confirmation/settlement may take multiple business days. |
| Stripe standard card | $240 × 2.9% + $0.30 | $7.26 | Faster customer checkout but higher per-order cost. |
| Stripe Billing recurring management | 0.7% of applicable Billing volume on pay-as-you-go | Additional where used | Not automatically required for all one-time payments. Evaluate total billing + processing cost for selected architecture. |

Official vendor references (checked 2026-11-07):
- GoCardless US pricing: https://gocardless.com/en-us/pricing
- Stripe ACH payments: https://stripe.com/payments/us-bank-payments
- Stripe Billing pricing: https://stripe.com/billing/pricing
- GoCardless integration and mandate flow: https://docs.gocardless.com/docs/partner-integrations/how-partner-integrations-work

**Decision recommendation for consideration, not an authorization:** Compare GoCardless ACH-primary plus card fallback against an integrated Stripe ACH/card architecture using expected average invoice size, card take rate, verification/mandate fees, failed payments, dispute rates, actual timing and administrative capacity. Do not choose from headline fees alone. A $0.67 domestic ACH difference on a $240 order may be outweighed by double-provider reconciliation work, but cannot be resolved without actual volume and customer payment mix.

## Required final audit evidence before accepting D

- [ ] CI green on the exact final integrated SHA: app typecheck, app lint, all critical and full logic tests, Firestore and Storage rules tests, Functions compilation/lint, production build, clean git diff.
- [ ] Product canonical master, case UPC/barcodes, current lot/receipt evidence, holds and expiration verified.
- [ ] Pricing: document owner approves purchase counting, per-location eligibility, zero-case quarter policy, Day 60/61, launch extension and legacy 90-day migration.
- [ ] Stripe/GoCardless or alternative provider formally selected and merchant verified. No card/bank credentials stored by Momentum.
- [ ] Server-side signed raw webhook, idempotency, payout/settlement proof, retries and chargeback/refund reconcilers tested with sandbox.
- [ ] Customer tenant isolation tested against real authenticated roles, including account revocation, multiple locations, disabled and separated identities, unauthorized IDs and cross-account invoice access.
- [ ] Order lifecycle tests cover cancellations, revisions, partial delivery, over/under payment, unlinked lot movement, refunds, credits and audit trails.
- [ ] Desktop/tablet/mobile staging acceptance with real source documents, invoice export and navigation.
- [ ] Email sender verified, fresh activation cutoff, idempotent outbox, real delivery receipts and only verified-paid event templates.
- [ ] Integrate concurrent A/C/E/F/G modifications through explicit conflict review, without dropping their changes.
- [ ] Mia grants explicit approval before any PR merge, deployment, customer communication or payment activation.

## Cross-functional handoff and authority

**D permanent owner:** Commerce integration. Coordinate with C for customer account hierarchy and sales attribution, E for stock/lot and delivery custody, F for documents and identities, G for audit/reliability and A for shared navigation.  
**Decision owner:** Mia and designated company executive for commercial pricing, processor contracts and payment collection (exact company approval authority still unverified).  
**Reversibility:** The current D branch is isolated, no real payment data written by these new read views, no production migration or deployment.  
**Next action:** Get the final CI report green and choose the payment architecture + written retail pricing-policy reconciliation before integrating with the master release branch.
