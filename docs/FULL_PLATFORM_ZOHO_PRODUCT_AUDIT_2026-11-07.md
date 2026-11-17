# Momentum Distribution | Independent Product, Workflow, Visual and Zoho-Parity Audit

**Date:** 2026-11-07 (America/Phoenix)  
**Repository / review branch:** `ataymia/momentum` / `integration/a-g-unified-2026-11-07`  
**Audit owner:** Consolidation and product review workstream  
**Scope:** Unified A–G implementation, 84 registered staff menu routes, 51 device-screen samples, role permissions, eight sampled browser interactions, code/backend contract inspection, official Zoho reference comparison.  
**Environment:** Isolated synthetic local data and Chromium. No production user accounts, merchant credentials, bank connections, signatures, personnel files or vendor integrations were accessed.  
**Status terms:** `PASS` = stated test exercised and passed; `DEMO` = isolated functional simulation; `READ-ONLY` = source view but no authoritative mutation; `BLOCKED` = intentionally unavailable or required external/system prerequisite; `REVIEW` = unverified behavior and acceptance still needed.

## Executive verdict

**The consolidated interface is coherent and the automated demo walkthrough is broadly reliable, but this is not yet feature-complete as a connected distribution ERP.** Application scope is more accurately described as a promising **unified multi-department prototype plus selected existing production workflow connections**.

The product vision is **not lost**: Momentum follows the single-workspace, department-specific record and sidebar structure of Zoho One. What is missing relative to the reference standard is the ability to complete important cross-department transactions within server-authoritative records without manual handoffs, temporary legacy routes, or local-only storage. Financial, employee-identity and inventory writes must never be marked complete from demo data.

### Evidence from exhaustive synthetic browser pass

Workflow: [Momentum Exhaustive Product and Visual Audit, passing run](https://github.com/ataymia/momentum/actions/runs/42418176380).

- **84/84 staff route destinations** visited; zero unexpected blank, denied, or placeholder screens; **one correctly marked planned** administration page.
- **51/51 responsive screen passes** at 1440px desktop, 768px tablet, 390px phone; zero automated horizontal document overflow or broken-image flags. Real-device usability is a broader category than this assertion.
- **16/16 role checks** across administrator, sales representative and customer, including copied unauthorized URLs and accessible portal links.
- **8/8 sampled interactions**: lead search/reset, account rep filtering, deal create route, meeting creation route, local purchasing form, invoice print center toggle, staff search-to-customer-record, and customer search-to-portal order.
- **0 uncaught browser exceptions; 0 recorded console errors.**
- Preceding exact-head combined regression: [880/880 logic tests and 101/101 Firestore+Storage security tests](https://github.com/ataymia/momentum/actions/runs/42391502184).
- **The final SHA after audit fixes must pass its own exact-head audit**. No earlier run certifies later commits.

### Visual inspection findings

Screenshots were examined from the generated artifacts.

- **Strong:** consistent dark navy navigation, role-aware sidebar, large clear headings, filters, dates, tables, contextual record drill-downs, mobile drawer. Customer portal order summary is more polished than many legacy sections.
- **Improved in this audit:** CRM Deals `New deal` now uses a primary CTA; phone Sales Orders now render touch-friendly **cards** rather than squeezing eight columns. The desktop sortable table is retained.
- **Improved in this audit:** an administrator visiting the Rep Self-Delivery route previously saw a blank screen (the underlying signature component intentionally hides itself from non-representatives). The route now offers delivery oversight and an appropriate handoff without impersonating the representative.
- **Remaining visual polish:** some modules still rely on older page layouts or a generic table and need standard spacing, loading/empty states, semantic headings, and touch-sized controls. A synthetic overflow check does not establish perfect accessibility, brand-quality typography, contrast or all Safari/Android behavior.
- **Planned module:** the Commerce `Customer Portal` administrative page is honestly marked planned. It must be either replaced by a real admin portal-management screen or excluded from general release menus; the customer's actual portal navigation is separate and substantially more complete.

## Official Zoho reference standard and Momentum parity

This is a **functional benchmark**, not an instruction to copy competitor branding or replicate all of Zoho's huge commercial ecosystem. Keep workflow parity scoped to Golden Eagle distribution.

| Reference | What the relevant Zoho product supports | Momentum code assessment | Priority |
|---|---|---|---|
| Zoho One unified UI | One left menu, app access, global search, shared calendar and context preservation | **PASS for shell.** Shared sidebar, role-specific menus, record URLs, browser history, global search, calendar and meetings. | Maintain |
| Zoho CRM | Lead/contact/account/deal pipeline, cadences, territory management, automated stages and customer history | **DEMO / READ-ONLY.** Separate CRM records, sorting, filters, locations, routes and actions; server-authorized lead/deal/contact creation is disabled in connected mode. Some customer histories are scoped summaries, not independently trusted correspondence threads. | P1 |
| Zoho Books | Invoices and payment collection, customer portal payments, recurring billing, account reconciliation | **READ-ONLY / BLOCKED.** Finance and invoice detail screens exist, customer can view authorized records, and draft payment terms can be validated; payment processor, recurring mandate, payment link, signed callback and settlement reconciliation not active. | P0 |
| Zoho Inventory | Product, SKU, price lists, order→pick/pack/ship, warehouse stock, purchase receives, bills, batch/expiry and returns | **PARTIAL.** Product and lot directories, pick/ship/ledger controls, order/invoice views and selected existing fulfillment backends. New purchasing screens are local demonstrations and purchase receives do not post live stock. Legacy Dispatch remains necessary. | P0/P1 |
| Zoho People | Worker profile, secure documents, onboarding, attendance, leave, timesheets, performance and HR administration | **PARTIAL / BLOCKED.** Separate HR pages and metadata, eligibility checks, staff self-service and timekeeping. Real secure source documents, signature/original retention and production payroll processing have not been certified. | P0 |
| Zoho Desk | Assigned support cases, conversations, customer portal, SLAs, escalation, resolution and audit | **DEMO / BLOCKED.** Cases page supports isolated local entries/assignment/status/notes; no authorized production case backend, inbound communication, verified SLA clocks or customer-facing ticket handling. | P1 |
| Zoho Analytics | Source join/blending, semantic metrics, drill-down, governed refresh and reports | **PARTIAL.** Existing source-specific insight explorer, forecast scenarios, formulas and drill-down; reliable cross-department authoritative data lineage, sync freshness and operational dataset contracts still need defined governance. | P1 |
| Zoho campaign ecosystem | Approval, campaign spend, business attribution, automation | **DEMO / READ-ONLY.** Campaign request and attribution evidence workflow is local only; connected edits and reconciliation are intentionally blocked. | P1 |
| Zoho One administration | Role-based application access, per-user governance, records and auditability | **PARTIAL.** Client route restrictions plus tested Firestore rules for selected resources; additional future mutation endpoints must have server record ownership rules, actor attribution, recovery and role policy tests. | P0 for privileged writes |

**Official source links:**
- Zoho One UI: https://help.zoho.com/portal/en/kb/one/admin-guide/organization/managing-organization-info/articles/enable-users-to-switch-to-new-ui
- Zoho One scope: https://www.zoho.com/one/
- CRM capabilities: https://www.zoho.com/crm/features.html
- Books customer portal: https://www.zoho.com/us/books/help/customer-portal/
- Inventory and order lifecycle: https://www.zoho.com/us/inventory/features/
- Inventory detailed capability list: https://www.zoho.com/us/inventory/kb/general-overview/zom-feature-list.html
- People self-service: https://www.zoho.com/people/welcome-guide.html
- Desk case automation: https://www.zoho.com/desk/features.html
- Analytics metrics and source integration: https://www.zoho.com/analytics/features/

## Six business-process walks (the central parity test)

### 1. Lead → qualified customer → order → fulfill → invoice → collect → reorder

- **Present:** lead/account pipeline, owner/rep visibility, opportunities, sales order records, stock/reservation evidence, existing delivery/POD controls, invoice details, customer portal order/invoice summaries and some retry/exception handling.
- **Gaps:** in connected mode, redesigned lead and deal writes are demo-only; external customer and product/legal onboarding need certified authoritative state; new order submission is local-demo-gated until production acceptance; real provider-confirmed payment/recurring/settlement processing is missing.
- **Acceptance:** create an authorized lead, convert it, submit an approved priced order, reserve the correct SKU/lot, pick and deliver with signed proof, issue a correct customer invoice, collect and reconcile exactly one verified payment, handle a return/refund, repeat the same customer transaction, and prove correct stock, receivable and audit trail in every view.
- **Why it matters:** a sales team should never have to create the same business twice or count a demo-paid order as collected cash.

### 2. Supplier → PO approval → physical receipt → lot stock → vendor bill → settlement

- **Present:** vendor/expense/order/receipt/bill/payment/credit menus, dedicated forms, local approval and matching validation, lot/best-by fields, warehouse custody preview.
- **Gap:** `components/prototype/purchasing-experience.tsx` explicitly says the production connection is blocked. A receipt intentionally does not increase sellable inventory, and a payment reference intentionally does not settle an actual bill.
- **Acceptance:** real authorized vendor, approved PO with immutable lines and pricing, receiving with lot/warehouse evidence and exception handling, server transaction posting to on-hand, independent bill-to-PO match, approved payable and bank/provider settlement reference reconciled to the ledger.
- **Risk:** treating local browser evidence as accounting or real stock would materially misstate margin and available inventory.

### 3. New employee → identity & forms → shifts → payroll review → pay record

- **Present:** personnel directory and profile metadata, secure-mutation architecture under legacy tools, attendance, leave, training and payroll preview/review modules.
- **Gap:** HR compliance page explicitly disclaims document signing/certification, and protected file originals plus live payroll action remain separate gated workflows. Preserved inactivity clock-out behavior needs pay/timekeeping and exception review.
- **Acceptance:** verified worker classification and access role, proper official forms completed using permitted signatures/retention, source timecard with correction/approval history, classified pay rules, independent payrun approval, actual release confirmation, employee-visible pay record and offboarding access cleanup.
- **Risk:** unverified timestamps or client-authored files cannot serve as payroll/legal records.

### 4. Customer issue → agent → case timeline → resolution → response

- **Present:** case list, tags/categories, assignee/status/history/local demo notes and linked source order.
- **Gap:** `support-cases-experience.tsx` explicitly says connected case data and secure attachments are inactive. No production SLA, inbound source, auto-escalation or customer response channel.
- **Acceptance:** authorized case from customer/order, owner assignment, measured response/resolution times, escalation, secure customer message thread and closure evidence. Verify customer can only view the relevant case.
- **Risk:** a ticket marked resolved locally may never have reached the customer.

### 5. Campaign → approved spend → qualified demand → attributed orders

- **Present:** campaign requests, approvals and reviewed source IDs, distinct spending and attribution records.
- **Gap:** local-only mutations; no official receipt storage, provider/bank reconciled spend, or authoritative attribution feed.
- **Acceptance:** controlled campaign authorization, approved cost, registered lead/source, sale or reorder outcome backed by collected-cash facts, and measured profitability rather than vanity metrics.

### 6. Scheduled work → team meeting → invitations → calendar → notification → action

- **Present:** URL-addressable meeting directory/form/details, in-app invitations and RSVP, attendee-only visibility, calendar integration with existing field appointments and notification deep links.
- **Gap:** no external email invitation service, no bi-directional external calendar synchronization, and security visibility is still bounded by current workspace scope.
- **Acceptance:** invite two authorized employees, check conflicts, create meeting, confirm both see only their invitation, RSVP/change time/cancel, verify notifications and history, then import a calendar event without duplicate or invisible events.

## Defect and gap register

| ID | Severity | Class | Observed evidence | Recommended action |
|---|---|---|---|---|
| AUD-01 | P1 | **Fixed code defect** | Admin Rep Self-Delivery produced a blank screen because the rep-only component returned null | Role-aware admin handoff to Delivery Operations, regression guard |
| AUD-02 | P1 | **Fixed navigation defect** | Global search navigated to generic modules instead of linked records, with customer invoice risk | Central role-aware destination helper, exact-record URL and permission check, regression and browser coverage |
| AUD-03 | P2 | **Fixed visual usability** | Eight-column Sales Orders table compressed on phone | New touch-first order cards, compact sorting and retained desktop table; phone visual assertion |
| AUD-04 | P2 | **Fixed visual hierarchy** | Deals creation affordance looked like ordinary text | Consistent primary-action button |
| AUD-05 | P0 | Connected workflow gap | No approved provider-confirmed customer payment and recurring-billing lifecycle | Select payment-provider architecture only after approved scope and secure payment authorization requirements |
| AUD-06 | P0 | Connected workflow gap | New purchasing receipts are intentionally non-posting and AP references not settled | Define supplier/warehouse/AP source of truth and build secure transaction API with rollback/reconciliation |
| AUD-07 | P0 | Compliance/data gap | New HR e-sign/originals/payroll not independently validated | Establish secure document provider and official-form workflows, payroll inputs, corrections, retention and authoritative service controls |
| AUD-08 | P1 | Connected workflow gap | Lead/deal/contact write pages are local demonstration or read-only on connected data | Define authenticated role-granular CRM mutation APIs, change log and idempotency |
| AUD-09 | P1 | Connected workflow gap | Support Cases not connected to customer communications or SLA engine | Source-backed case service with attachments, queue rules, notifications and escalation |
| AUD-10 | P1 | Connected workflow gap | Marketing budget approvals, spend and attribution are browser-local | Persist authoritative approved campaign, evidence and paid-sale links |
| AUD-11 | P1 | Transition gap | Legacy Dispatch still in use, and several redesigned modules contain links to original operational pages | Build functionality-parity retirement checklist; do not hide legacy process prematurely |
| AUD-12 | P1 | Governance gap | Audit log provenance, historical recovery and data freshness not proven for all future service endpoints | Trusted actor/server event records, immutable append-only server trail, backup and restore drills |
| AUD-13 | P2 | Planned route | Customer Portal administration screen still marked planned; customer portal itself exists | Replace with secure portal-user invitation/access management or keep clearly labeled planned |
| AUD-14 | P2 | Accessibility/design QA | Automated 390/768/1440 pixel checks alone cannot certify keyboard/screen-reader contrast and browser-specific print usability | WCAG-focused walkthrough, Safari/Android checks and detailed screen-review acceptance |
| AUD-15 | P1 | Software supply chain | Dependency install reports advisories; no detailed audited remediation plan for direct/runtime versus dev-only dependencies | Generate lockfile-specific audit with impacted runtime, exploitability, nonbreaking remediation and regression rerun |

Severities are **review priorities**, not incident declarations: P0 blocks a live business action if activated; P1 should be corrected before broad workflow reliance; P2 is polish/readability or a visible planned item.

## Release readiness and evidence rules

1. A green UI, menu route, unit test or `Paid` label is **not proof of cash settlement, signed delivery, posted inventory, authorized employee documentation or external messages**.
2. Preserve source-of-truth ownership and build transaction-level tests that span multiple departments, not just isolated component/render tests.
3. Keep all external actions disabled until the correct company decision-maker approves the workflow and access requirements.
4. Require exact-head app + Functions build, security-rule emulator tests, 84-route browser check, representative device tests, and critical connected workflow tests as applicable.
5. For a dashboard/KPI, define formula, exclusions, source, frequency, lag, responsible owner, audit method and triggered decision. Do not show unknown or missing evidence as zero progress.
6. The recommended working branch stays `integration/a-g-unified-2026-11-07`. This audit authorizes **no merge to main and no deployment**.

## Proposed next tranche

**Now (highest leverage):** finish authoritative CRM→order→inventory→invoice workflow first; inventory and payment integrity are upstream of reliable reporting and transaction-triggered notifications. Confirm exact source and role permissions for each write. In parallel, audit personnel compliance without triggering employee pay or official filings.

**Next:** server-backed purchasing, reliable customer support, secure payment-provider choice, document-original workflows, and safe email/event handling based on actual transaction state.

**Later:** advanced analytics automation, custom campaign attribution, richer global search, dispatch replacement, and additional dashboard visual polish once trusted operational data exists.

**Suggested single next decision:** select one actual customer order from a synthetic test dataset and require its complete order-to-delivery-to-invoice-to-settlement evidence trail before describing the platform as commercially ready. Keep external collection simulated until provider approval.
