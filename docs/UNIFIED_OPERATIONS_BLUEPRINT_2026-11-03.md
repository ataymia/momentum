# Momentum unified operations redesign: commercial software ecosystem benchmark
**Research and prototype scope:** November 3, 2026. **Status:** Working specification only. **Branch:** prototype/commercial software-inspired-multipage-2026-11-03. No changes to main or production.

## Product decision record
- Use inventory and fulfillment platform's connected-record behavior and Flo's exact navigation as the primary model, with selected ideas from other commercial software Finance/People apps. Recreate workflow patterns, not proprietary code, branding, copy, or identical trade dress.
- Navigation groups: **Workspace / Sales & CRM / Commerce / Operations / Human Resources / Marketing / Insights & Support / Administration**. Human Resources and Marketing MUST be separate permission boundaries.
- No Calls module, Solutions module, or in-app chat. Continue using existing company Gmail; a customer-record **Mails** tab is activity history, not a new inbox.
- Shared meetings/calendar are desired, with authorized organizers, participants, invite/notification flow, upcoming items on home, and proper permissions. Existing field appointments are not equivalent to staff meetings.
- Item/Product record is a flagship feature: overview, sales orders, locations where product was sold, inventory by site, movements/adjustments, purchase history, history. Reuse existing SKU/product catalog and order lines. Never infer inventory from historic purchase orders.
- Customer record: Overview, Comments, Transactions, Mails, Statements. Add Momentum's Locations, Documents, Rep and Incentive context. Pending real email integration, Mails should say that the history is unavailable, not invent sent messages.
- 20-case progress marker does not earn money. Existing separate $25/10-case and $25/40-case bonuses are distinct from 2.5% rep + 0.5% manager override. Commission policy must be backed by written effective terms and a net-collected-sales ledger before payment automation.
- Admin-only reviewed account consolidation; same name does not prove common owner. Preserve stable IDs, locations, orders, invoices, attachments, historical attribution and previously earned payouts.
- ZIP territories have multiple five-digit ZIPs per rep, no conflicting active exclusive assignments, explicit exceptions and shared accounts, and route/territory validation.
- Sales rep notices at confirmed, out-for-delivery and cleared-payment milestones. Transactional email is NOT live until domain, provider, outbox, sender, tests and approval.
- Payment processor integration is urgent. Hosted checkout/payment links, authenticated customer payment from portal, one-time + scheduled repeat billing, server-verified webhooks, reconciliation. No raw card storage.
- Do NOT delete old Dispatch datasets. Retire only redundant navigation after live capabilities have replacements.
- Prototype is read-only for customer/product details and has explicit placeholders for workflows not yet implemented. No main branch merge or production deployment without user review.

## Cross-app capability research, mapped to Momentum
| commercial software app | Verified relevant features | Momentum workflow | Proposed decision |
| --- | --- | --- | --- |
| **Inventory** | Item detail with overview, sales graph, stock by warehouse, transactions, batch details, adjustments, history; customer contact overview/comments/transactions/statement | Item/Account 360, cases sold by location, lot inventory, customer balance | **P0 reference design**, reuse existing IDs and ledgers |
| **Books** | Sales orders, invoices, PO, bills, vendor credits, approvals, reconciled bills, central documents | Finance records and vendor payable workflow | **P1/P2**, establish canonical transaction and accounting state before screen rollout |
| **Procurement / Spend** | Purchase requisition, multi-step approvals, vendor onboarding/portal, RFQs, purchase receives, PO-to-receipt-to-bill matching, payables, budget controls | Supplier replenishment, purchasing controls | **P2**, optimize for few vendors; no full bidding portal until volume warrants |
| **Expense** | Receipts, categorized reports, approval chain, mileage, reimbursement, audit and limits | Employee reimbursements / accountable spending | **P1**, use existing approvals and payroll handoff, evaluate buy/integrate instead of cloning OCR/card feeds |
| **Billing** | Customer self-service payment, invoices, subscriptions, stored payment methods through provider, recurring schedule | Invoice links and customer portal | **P0**, provider-managed instruments, webhook event reconciliation |
| **Checkout / Payments** | Payment links, embedded checkout widgets, payment pages, invoice checkout | Invoice and portal settlement | **P0 provider comparison**, do not build PCI-sensitive processing |
| **Commerce** | Order history, customer profiles, checkout, stock, shipping, returns, roles | B2B customer self-service orders and tracking | **P0/P1**, preserve existing portal and add verified payment/returns controls |
| **Payroll** | Employee self-service pay data, gross-to-net, taxes/filings, off-cycle payroll, approval, audit, accounting handoff | Employee payroll and commission | **P1 integrate established payroll**, do not recreate tax compliance engine |
| **People** | Onboarding/offboarding, employees, document controls, attendance, time-off, performance, learning | HR workspace and separate permissions | **P0 access + P1 workflow**, keep HR material segregated |
| **WorkDrive / Sign** | Controlled document sharing, e-sign, audit | HR forms, customer contracts, tax certificates | **P1 integrate**, not home-built e-sign compliance |
| **Desk** | Case tracking, SLAs, team assignment | Customer return/payment/account exceptions | **P2 simple cases**, no independent inbox or knowledge-base replication |
| **Projects** | Tasks, assignments, recurring actions, dependencies | My Work and action center | **P1 selective**, no competing project tracker |
| **Analytics** | Shared metrics layer, dashboards, drill-down, geographic reports | Verified KPIs by team, territory, product | **P2**, define formula and data source before dashboards |
| **Flow** | Cross-app workflow triggers and actions | Notifications, document/payments integrations | **P1 evaluate automation**, no duplicative side effects |

### External UX research notes

## Navigation and data contract
1. Single shared navigation registry. Each existing module maps to a URL; browser Back/Forward and a direct reload must preserve current selection. Record IDs, never display labels or guessable sequential IDs, form record URLs.
2. Dynamic records on static Firebase Hosting require a catch-all Hosting rewrite to the exported index, coordinated with client-side parsing and existing CSP/auth. Test nested refresh and direct copy/paste. Never rely on UI checks for Firestore authorization.
3. Every sidebar group and record page gets permissions from the existing role system; **permissions per module/action/record** eventually must be explicit, not simply one umbrella role.
4. Migrate without replacing workspace state or rewriting any financial record; a prototype read-only projection is acceptable for User Acceptance Testing.
5. Search/filter/sort share consistent components; names A–Z/Z–A, date windows, pagination; sortable accessible headers; role-restricted searchable selectors.
6. Each record has a summary, connected actions, relationship tabs, system history, record owner, and traceable source links.
7. Preserve the user-selected tab in the URL and avoid taking users to Home after browser Back/Forward.
8. Inactive/deprecated Dispatch features must remain accessible by authorized users until signoff and a valid replacement exists.

## Near-term execution and gates
**P0 prototype, no live business writes:** navigation shell and 8 groups; deep-linked read-only customer/item/order records; account/transaction/product connections; calendar preview; universally shared UI patterns; placeholder pages visibly labeled.
**P0 production critical path:** payment-provider approval & underwriting, secure hosted payment URL + portal checkout, event settlement, rep order/dispatch/payment notices. These are still NOT live on the prototype branch.
**P1 policy:** immutable account-group mapping, approved commission terms, canonical receipt and credit ledger, status-driven email/outbox, meeting ownership/notifications, vendor and expense approvals.
**P2 eventual:** procurement sourcing/portal, complex inventory variants, reports/forecasting and external system integrations only after operational value is verified.

## Prototype acceptance
- Can share, refresh, and browser-back through item, customer, and order URLs.
- HR and Marketing appear separately and show only allowed entries; account financial details obey Firestore and user role.
- Item shows actual source-linked orders with where sold; stock uses verified SKU-matched lot quantities only.
- Customer record shows Overview, Comments, Transactions, Mails, Statement with clear unavailable states, without fabricated payment history.
- No change to production records or main branch; no imported sensitive data into screenshots.
- Existing operational workflows still reachable; modules not implemented explicitly identify status.
- Mobile and desktop accessible; real tests must pass prior to deployment.
- No automatic emails, payment capture, commission posting, account merging, or user invitations from prototype.


## Scope expansion: November 3 all-role review
User confirmed the redesign covers the **whole business**, not just employee CRM. The existing delivery-driver shell, customer login and sales-rep self-delivery are critical workflows; they remain preserved during navigation refactoring.

### Concrete retention map
| Role | Entry / routes | Preserve now | New/proposed |
| --- | --- | --- | --- |
| Administrator | /admin, /admin/employee-profiles, /admin/employees | Existing SettingsPage security, provisioning, user roles, document/integration, audits, data exchange, operational controls; AdminEmployeeProfiles and EmployeeDirectory | Consolidation queue, per-permission action matrix, approved integration management |
| Sales Representative | /crm/quick-visit, /crm/account-map, /crm/territory-map, /crm/self-delivery, /sales/orders | Existing QuickVisitPage, SalesMapPage, TerritoryPanel, OrdersPage/RepSelfDelivery and historical sales attribution | ZIP polygons, route optimizer, searchable rep selectors and parent-level incentives |
| Sales Manager | /crm/*, /sales/*, /calendar | Team/account assignment, territory suggestions and appointments | Approval/exception trail and performance views |
| Delivery Driver | /driver/deliveries, /driver/requests, /driver/map, /driver/inventory, /driver/time, /driver/directory, /driver/help | **Dedicated DeliveryDriverShell** and its delivery task/signature, delivery-requests, inventory, HR/time and employee directory screens | Native browser URL navigation, route sequencing/map and later tracking / delivery exceptions; map tab is an honest placeholder until mapped data is available |
| Customer | / (dashboard), /portal/products, /portal/orders, /portal/invoices, /portal/payments, /portal/deliveries, /portal/statements, /portal/documents, /portal/account | Existing customer login, scoped orders and customer dashboard | Separate portal navigation, verified price/product detail, delivery status, payment checkout and statements from authoritative ledgers |
| Operations / Warehouse | /inventory, /inventory/ledger, /sales/orders, /operations/deliveries | Order/lot/delivery/receipt and custody controls | Stock-adjustment, package and shipment workspaces with audit evidence |
| Human Resources | /people and /admin/employee-profiles as authorized | HR employee self-service and admin-only employee records | Dedicated Human Resources administrative section; employee self-service does not imply HR privileges |
| Marketing | /marketing, /marketing/ambassadors | Campaigns and brand ambassador workflows | Role-scoped marketing workspace; no HR admin content |

**Do not remove existing account map/territory data, Quick Visit, self-delivery, admin tools, or client dashboard.** Hiding Dispatch from a preferred navigation is not deleting backend scheduling/delivery state. The driver workflow is operationally distinct from redundant office Dispatch navigation.

### Delivery and customer design references

### Explicitly not built or signed off yet
- Actual ZIP polygon rendering, route optimization and driver ETAs.
- Employee-to-employee calendar invitations, production email notifications or completed Google Calendar integration.
- Merchant-connected payments or customer account registration.
- Account merge execution and compensation recalculation.
- Mails/statement balances from reconciled financial or provider records.
- Truly configurable per-user granular permissions; current prototype reuses role capabilities and protects admin/customer directories by role.

**Mandatory acceptance:** test every user role in demo and production-like staging with simulated data, deep-link refresh, mobile usability, record scoping, back/forward, no sensitive data in URLs, safe account transfers, no duplicate earning, and existing delivery signature/self-delivery functions. Never deploy directly from the prototype without review and explicit approval.

## Working acceptance notes and current prototype delta
**Updated November 3, 2026.** This is a tracking update, not launch authorization.

### Commerce migration, built in isolated prototype
- Dedicated Sales Orders directory and record routes, plus /sales/orders/new and /sales/orders/{orderId}/edit.
- Approvals at /work/approvals shows visible workflow approvals. Order approvals have a newly designed action surface; non-order approvals still use preserved controls.
- Reuses canonical Workspace order validation, customer and territory checks, pricing engine, inventory ledger, reservation release, Administrator-only approval and mandatory return reasons. No duplicate order or payment engine.
- **Prototype mutation guard:** order creation, editing and decisions execute only in local demo mode when persistence also reports local. Connected backends remain read-only from these interfaces.
- Existing /sales/orders/workflow and /work/workflow remain reachable during parity migration. Linking them does not count as completing the redesign.
- Invoices and payments remain read-only. Hosted checkout, webhook verification and customer-portal payment flows are not yet built.

### Visual redesign feedback, explicitly reinforced by Mia
- **Human Resources:** Initial prototype is not accepted. Redesign as a complete people operations experience with independently accessible onboarding, attendance, time-off, staff profiles, HR documents, reviews and employee self-service. Payroll remains a distinct specialized workflow. Preserve confidentiality and historical records.
- **Marketing:** Initial prototype is not accepted. Build role-scoped campaign planning, calendars, approvals, creative assets, brand-ambassador management and verifiable qualified-demand attribution into purpose-built marketing screens. Preserve real existing workflows.
- **Sales-representative self-delivery:** Existing /crm/self-delivery currently links into the legacy Orders view and is **not accepted**. Build its own mobile-first delivery workflow separately from normal order creation. Retain authorized pickup and custody evidence, delivery task states, customer confirmation, exceptions and auditing. Never infer delivery authority simply from the order sales owner. A Delivery Driver retains a distinct interface.
- **These three items remain outstanding.** A sidebar destination alone does not satisfy their acceptance criteria.
- Each department uses an appropriate business-process layout, with unified Momentum navigation and original implementation assets.

### Release checkpoints
1. Current branch CI passes typechecking, lint, logic, Firestore/storage permission tests, Functions, and production build.
2. Local demo validates new-order, edit/resubmit, approval and meaningful return reasons using the canonical workflow.
3. Staging tests validate permission boundaries, deep-link refresh, all roles, and parity with existing functions.
4. Payment provider, financial reconciliation, portal scoping, and notification state are separately verified.
5. Merge or deployment requires Mia's explicit approval. No production changes from this branch.

### C17/C18: administrator-selected consolidation, updated November 3
- Account Consolidation at /admin/accounts now supports **manual selection from every visible account** and multi-search persistence. It does not require exact matching names or fuzzy-comparison percentages. The existing exact-name suggestions remain optional.
- A business-name variation such as "Two Knuckle Sports and Fitness" versus "Two Knuckles Sports MMA and Fitness" can be manually selected as one candidate review group. These are illustrative examples from operator feedback, **not evidence of verified common ownership**.
- The administrator can preview the selected account IDs, old parent relationships, assigned representatives, physical locations, linked order count, and selected parent or new proposed display name.
- A pure association engine maintains immutable historical order, payout and financial references while changing **only** account-to-parent IDs and adding actor/time/reason location activities. Blocks missing records, conflicting existing parents, physically duplicated location addresses, and unverified billing ownership.
- The **prototype-only action** requires Administrator, local demo mode, no connected Firebase workspace, local persistence, billing-owner verification checkbox, a twelve-character reason, and typed confirmation "ASSOCIATE".
- No live account records have been merged. **Production write action remains open** and requires a transaction-safe privileged endpoint, role and record verification, immutable master-data audit, duplicate-site determination, finance/bonus entitlement reconciliation, and reviewed staging tests.
- The user explicitly preferred manual selection over a mandatory 70%-similarity scanner. Do not add expensive fuzzy matching unless it provides a proven incremental benefit.

### Home experience: reference and acceptance (owner screenshots, November 3, 2026)
- Flo's actual commercial-software Home screenshots were supplied in chat as a **visual and interaction reference**, not authority to copy product code, logos, text, branded assets or distinctive artwork.
- Home is a personalized dashboard, **not another nested legacy page**. Its information hierarchy and navigation density should be tuned against the owner-provided images during visual review.
- Preserve the eight Momentum departments and permission-scoped module navigation; expand and collapse groups consistently. Never show a customer-only feature to employees or HR records to sales/marketing.
- Home should display actionable **role-specific** information rather than decorative, unverified activity: assigned work, approval count, upcoming internal meetings and field appointments, recent authorized records and source-linked metrics.
- Upcoming meeting invitations appear for actual invitees and authorized organizers, with correct local time, record URL, and in-app reminder state. Shared-calendar writes and outbound email are **not** implemented yet.
- Numbers such as active customer count, receivables, inventory and order conversion must have a precisely defined source, formula, permissions and update frequency before they appear as company performance claims.
- Home cards and rows drill into their appropriate separate left-sidebar module and item URL; no module-level header navigation. Browser Back/Forward restores the prior page.
- Mobile Home is adapted to screen size, while preserving the functions needed by sales, driver, HR, marketing and customer roles.
- **Status:** reference captured; screenshot-by-screenshot acceptance and implementation are pending. Existing Home must not be counted as redesigned.

### Home reference and fulfillment module review
- Mia supplied two images of the General Manager's currently preferred business software Home page on November 3, 2026. These are **visual reference material**, not proof of operational data. Use them for the visual home-screen acceptance review; do not embed screenshots, external product names, product logos, or proprietary layout assets in Momentum's source.
- Home must show only reliable, role-authorized operational information, with links into module records and meetings. Do not fabricate KPI counts or configure dashboards before data sources, definitions, permissions and audit rules are verified.
- Fulfillment prototype now includes independently addressable /inventory/packages, /inventory/shipments, /inventory/shipments/{orderId} and /operations/deliveries. Those pages reuse existing delivery tasks, inventory movement and reservation ledgers, and show truthful distinctions between reservation, loaded, in transit, recipient signature and delivery posting.
- These are **read-only review screens**, not replacements for existing authorized delivery mutations; package numbers, carrier tracking and driver ETAs remain unspecified.
- Sales-rep self-delivery remains a separate planned interface and must not reuse the general Sales Orders screen as its final design.
- Release gate: approved role scoping, functional test of all four routes, and final CI; do not merge into main.

## Sprint checkpoint: Commerce, Home and fulfillment
**Date:** November 3, 2026. **Workstream owner:** Momentum platform prototype and operational QA.

### Verified prototype implementations
- Order create/edit, order approval and return-reason UI retain the original order engine. Mutation is disabled on connected business data. Existing live workflows are preserved.
- Standalone Sales Returns and Credit Notes modules with record links and separate roles. Physical return movements are sourced from the inventory custody ledger; invoice credits and refunds remain financially distinct. **No external refunds, credit posting, or payment handling occurs from these new screens.**
- Packages, Shipments, warehouse custody and company-level Delivery Operations have separate URLs and source-linked views. A disconnected-local-demo-only manager panel supports driver assignment, complete-order reservations, physical loading confirmation, departure and assignment release. Original delivery signature and payment workflows are preserved.
- A responsive, role-aware Momentum Home is modeled on the structural characteristics of Flo's reference screenshot (not proprietary source or assets). Tabs and cards link to real modules. Source definitions: non-test, non-draft, non-cancelled recorded orders in the chosen AZ date window; ordered cases, not sell-through; product/channel breakdown from order lines; available warehouse stock from ledger minus active reservations and excluding held lots; returns and receipts from recorded movements; active work from the existing action policy. These are **operational records**, not approved financial KPIs.
- Exceptions and Reviewed Work now project the existing action policy, held stock, reviewed approvals and source-backed delivery evidence into separate pages. Returned approvals are explicitly marked as correction requests, not completed customer transactions.

### Validation evidence
- Full fulfillment controls snapshot succeeded in GitHub Actions run 41747640132.
- Full Home and source-metric snapshot succeeded in run 41748406061.
- Full Sales Returns / Credit Notes snapshot succeeded in run 41748805461.
- Full Work Exceptions / Reviewed Work snapshot succeeded in run 41749309681, including all mandatory CI checks and production build.
- All of these changes remain on the isolated review branch. **No merge, production release, customer payment, external message, or money movement has been authorized.**

### Outstanding decisions and integration dependencies
- Define the first live operational transaction in scope for the redesigned Commerce interface, including responsible approver, reason and failure/retry controls. Until approved, the demo actions stay disabled on connected data.
- The promised payment integration deadline requires a separate prioritization decision; the current code does not represent a completed ACH/card/recurring billing architecture.
- Design and validate a mobile-first sales-representative self-delivery interface separate from the old Orders page. Preserve verified stock custody, receipt proof and exceptions without assuming that a rep's sales ownership authorizes delivery.
- Rebuild Human Resources and Marketing as distinct role-relevant operational experiences. The current versions are not approved visual deliverables.
- Complete customer portal invoices/payments, employee permissions, data-source QA, role-specific navigation and browser-based visual acceptance, including responsive layout.
- Verify entities, authorization, distribution rights, product/pricing economics and legal readiness before any commercial workflow goes live.

### MASTER handoff
- **Verified facts:** The build and test statuses listed above apply to the specific fixed snapshots, not any untested later commits. User provided a general Home screen layout reference and requested continued functional redesign without external vendor names in the implementation.
- **Working assumption:** Prototype changes remain review-only and use existing data contexts; no migration or production mutation is authorized.
- **Actions:** Platform owner to clear remaining CI failures and finish role-based visual parity; Mia to approve the intended Home layout and decide when regulated payment/HR operation should enter staging. Target dates are **not confirmed**.
- **Outcomes affected:** Inventory custody reliability, approval processing, administrative visibility, order-through-invoice traceability and eventual cash reconciliation. No revenue growth or KPI improvement is claimed from UI commits.
- **Blockers/escalation:** Production identity/legal readiness, external payment provider selection, owner approval and full staging data validation.
- **Next decision:** Is the current Home layout suitable as the prototype direction once rendered, and which transaction workflow is first authorized for staged end-to-end testing?

### Independent main-branch advancement detected during prototype QA
- A separate merge advanced main from 21c64c37f2f963c30eaade67fcc44f242c4e6dec to df7b85b9ba6fcd9bd63eb08a57575656278dee08 at the time checked. It contains employee clock-in location permission recovery and administrator field reminders. This advancement **did not come from this redesign sprint**.
- Repository comparison identifies the branches as diverged, with a common base at 21c64c37f2f963c30eaade67fcc44f242c4e6dec. The new main changes touch shared app shell, package scripts and other employee/location infrastructure. These areas require conflict and regression analysis before any staged integration.
- No branch sync, rebase, merge, deployment, customer changes or external commitments were made by this sprint. Fixed-snapshot CI passes apply to the prototype contents at the listed commit snapshots, not the combined future result after resolving conflicts.
- **Recommended next decision:** Approve a separate reconciliation plan and visual review before requesting any merge. Continue unapproved modules strictly as prototypes on the isolated branch.
