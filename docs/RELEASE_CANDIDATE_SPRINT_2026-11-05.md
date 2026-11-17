# November 5–7 release-candidate sprint: customer, CRM and inventory workflow handoff

**Status:** Built on isolated draft review PR #149; full fixed-SHA CI and browser/staging acceptance pending. This is not a deployment, merge, or owner acceptance.

## Fixed source references checked November 5, 2026, 11:22 Phoenix
- main: `17a9a5e64f09892329e853f1a1f6ab54d324660f` (unchanged).
- department prototype: `b6f837ce9125e77f8887ee66e806bf4d4a99afe8` (review base; interactive work continues separately).
- payroll provider lifecycle: `12694c4c830ed3035967b0d0ac8774cdb2ff544f` (not merged).
- integration reference: `059ae91d0ea8d5e9ea42dd8c3202e7dd1eb0af3a` (unchanged).
- separate HR security review PR #148: `13fe616c36f38e26f6a82452088a27e5526f80d3`; independently preserved and not merged.
- Master queue copied from PR #148 blob `71c8b197ac3f02927786823e6041c1759359f9db` and appended with this sprint decision. The original queue was not present on the prototype branch.

## Concrete user-visible increments
1. **Customer delivery history:** /portal/deliveries now filters by search and fulfillment status, exports the filtered account-scoped register, and links to a customer-only order detail at /portal/deliveries/:id. A matching /portal/orders/:id deep link opens the same customer-safe record. Customer detail deliberately excludes staff approval, rep compensation and internal audit fields. A direct record CSV export is available.
2. **Sales/CRM exports:** /sales/customers, /crm/leads and /crm/contacts export only the records currently displayed after search, owner, stage, date and sort filters. Export projections omit internal account notes, financial fields and unrelated employee details.
3. **Inventory custody export:** /inventory exports the currently filtered lot register, including custody-ledger on-hand, reserved, available and hold status, without creating or adjusting stock.
4. **Regression coverage:** `tests/saturday-scoped-workflows.test.ts` checks customer account-ID isolation, QA exclusion, projection minimization, role-specific deep links and UI export wiring. Registered in mandatory `npm run test:logic`.

## Critical safety boundaries
- The frontend projection layer is defense in depth, **not** a replacement for Firestore rules or independently verified customer account linking.
- Customer portal invoice printing remains local-demo-only pending server authorization. Order states do not prove GPS, signed delivery, or cleared funds.
- CSV download is user-triggered in the browser. No emails, contracts, payments, live inventory mutations, payroll, external integrations or production data changes.
- The parent prototype has active interactive Marketing work; do not rebase, force-push or overwrite it. This PR targets its fixed reviewed base and requires fresh integration/conflict resolution.
- HR legacy shared-data confidentiality and historical recovery remain release blockers; separate HR review chain stays isolated.

## Department release-candidate parity
| Area | Current evidence | Next acceptance gate |
| --- | --- | --- |
| Commerce | Invoice single/bulk print and saving, order lists/details on prototype | browser/PDF proof, authorized server access and invoice issuance source |
| Sales/CRM | Filtered account, lead, contact downloads on this PR | manager/rep role and Firestore scope QA |
| Customer | Customer-only delivery list, details and downloads on this PR | linked-account identity and browser direct-route QA |
| Inventory | Source-derived filtered lot export on this PR | real opening stock/count and custody verification |
| HR | Personnel, leave, onboarding, new-hire prototypes | legacy confidentiality remediation, official form/provider controls, browser QA |
| Payroll | Pay-run register/export on prototype; provider lifecycle on separate branch | reconcile provider evidence, signed compensation terms and role QA |
| Marketing | Dedicated campaigns, requests, spend, attribution and exports on actively updated prototype | stable HEAD CI, review roles and real attribution evidence |
| Delivery | Existing driver/POD and rep self-delivery flows preserved | mobile custody/exception browser QA |
| Reports | Administrator weekly obligation excluded in existing action policy | source-backed KPIs and management review QA |

## Saturday critical path and owners
1. **Platform engineering:** get fixed-SHA full CI green, repair any failures, test customer-only direct routes and scoped downloads in an approved safe browser environment.
2. **Platform engineering:** reconcile this draft PR with the *new* prototype HEAD, the separate payroll provider branch and the preserved security chain only after review. No blind merges.
3. **HR/security and commercial operations reviewers:** approve record-level access, historical confidentiality, customer linking and canonical invoice/stock/settlement evidence. External blocker; no auto-approval.
4. **Mia:** review demo UX and explicitly approve staging scope or defer. Production release requires a separate authorization.

**KPI/financial outcome:** No verified revenue, settlement, stock or labor savings attributable to this development increment. No deadlines beyond the owner-requested Saturday review target have been authorized.

**Director Command Center MASTER:** repository handoff is ready for manual control-tower synchronization; the separate chat was not accessed or changed.
