# Momentum unified operations redesign: Zoho ecosystem benchmark
**Research and prototype scope:** November 3, 2026. **Status:** Working specification only. **Branch:** prototype/zoho-inspired-multipage-2026-11-03. No changes to main or production.

## Product decision record
- Use Zoho Inventory's connected-record behavior and Flo's exact navigation as the primary model, with selected ideas from other Zoho Finance/People apps. Recreate workflow patterns, not proprietary code, branding, copy, or identical trade dress.
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
| Zoho app | Verified relevant features | Momentum workflow | Proposed decision |
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

### Official sources consulted (2026-11-03)
- Inventory customer page: https://www.zoho.com/us/inventory/help/contacts/contact-details-page.html
- Inventory item page: https://www.zoho.com/us/inventory/help/items/item-details.html
- Inventory module list: https://www.zoho.com/us/inventory/help/reports/reports-overview.html
- Inventory email integration: https://www.zoho.com/us/inventory/help/integrations/zoho-mail-integration.html
- Books accounting workflows: https://www.zoho.com/us/books/accounting-software-features/
- Spend workflows: https://www.zoho.com/us/spend/help/admin/getting-started/how-zoho-spend-works/
- Procurement portal: https://www.zoho.com/us/procurement/help/vendor-portal/overview/
- Expense: https://www.zoho.com/us/expense/expense-features/
- Billing customer portal: https://www.zoho.com/us/billing/features/customer-portal/
- Payments pathways: https://www.zoho.com/us/payments/help/payments/customers-pay/
- Commerce: https://www.zoho.com/commerce/features/
- US Payroll: https://www.zoho.com/us/payroll/features/
- People: https://www.zoho.com/people/features.html
- WorkDrive: https://www.zoho.com/workdrive/features.html
- Desk: https://www.zoho.com/desk/features.html
- Projects: https://www.zoho.com/projects/features.html
- Analytics: https://www.zoho.com/analytics/features/

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
