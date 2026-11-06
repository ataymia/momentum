# A workstream: architecture and navigation
Date: November 6, 2026 (Arizona)
Owner: A Platform chat; final acceptance and release authority: Mia
Branch: review/track-a-platform-architecture-2026-11-06
Base: e70f4a3e2801df2ab62cea0b5e601cc44e40f96c
Status: isolated review only, not merged, deployed, or user accepted.

## Parallel ownership contract
A owns routing, shell, sidebar, navigation state, responsive architecture, hosting fallback, architectural tests and central route registration. B–G own their department workflows and record data. Register a department's new record URL in lib/navigation-route-contract.ts and include a route-permission test when integrating. Do not overwrite other branches. The final integrator must reconcile shell and registry conflicts explicitly before merging. An existing sidebar item is not proof that the destination works.

## What was inspected
The code already has eight agreed navigation groups, Next static export, Firebase Hosting SPA fallback, a URL navigation store and many dedicated record pages. The app is still one root-rendered client experience, not independent server-generated pages. Previous routing had broad prefix matches, and new CRM deal/contact details did not consistently select their dedicated component. On tablet and mobile, device-adaptive CSS hid the sidebar and a different bottom navigation was mounted. Those issues are addressed by this A review, pending tests and device QA.

## Implemented in the A review
- Central explicit deep-link contract for businesses, contacts, deals, orders, product items, invoices, payments, return/credit records, inventory lots, shipments, employee details and customer portal records.
- UI gate for unknown/unauthorized URLs before legacy page selection. Backend and Firestore scope/permission checks remain required.
- One common sidebar on mobile, tablet and desktop. Native anchor links support Copy Link and Open in New Tab, with SPA click interception only for ordinary left clicks.
- Most-specific active sidebar state, including Calendar versus Meetings.
- Browser popstate listener cleanup and static-hosting/role/route regression tests.
- Accessible responsive sidebar with focus-visible states, overlay, 44px mobile menu button and reduced-motion support.
- No business records, rates, existing departmental logic or payment flows modified.

## External feature research for A09
Official Zoho CRM documentation confirms independent module list/Kanban views and related record details. Reference: https://help.zoho.com/portal/en/kb/crm/getting-started/articles/your-first-day-as-a-crm-user

Official Zoho Inventory documentation describes batch-linked transaction histories. Reference: https://www.zoho.com/us/inventory/help/advanced-inventory-tracking/batch-tracking.html

Official Zoho People guidance lists self-service profile, leave, calendar, attendance and files. Reference: https://www.zoho.com/people/welcome-guide.html

Recommendation: implement the useful interaction conventions, not proprietary vendor branding, layout, code or artwork. The department teams are responsible for the underlying data and workflow; this A branch owns only the navigation contract.

## A01–A13 ledger
A01: PARTIAL. Shareable URL client screens, but all department pages and browser/deployed proof pending.
A02: BUILT, verification pending. Browser history and anchor support; real-browser back/forward and copy-link QA still required.
A03: BUILT, verification pending. Exact record routes; other chats must register additional records and perform real-role/foreign-record tests.
A04: Existing Firebase Hosting fallback and build/config tests. Safe emulator and deployed staging acceptance missing.
A05: BUILT, verification pending. Same sidebar on all devices; obsolete module UI must be checked during B–G acceptance.
A06: BUILT, verification pending. Specific active menu path; visual/keyboard tests pending.
A07: INCOMPLETE, dependent on B–G. Cannot mark legacy screen redesign done from an architecture refactor.
A08: PARTIAL, dependent on B–G. Shared chrome is unified; specialized department experiences require their individual workflows.
A09: RESEARCHED, partial implementation of general navigation/list-detail conventions; further departmental functions require separate proof.
A10: BUILT route permission UI defense-in-depth. Backend rule/record, old session and cross-user verification still required.
A11: BUILT responsive sidebar styles. Real screenshots/accessibility at 375/768/1024/1440px pending.
A12: Confirmed isolated review branch. No main or deployment authorization.
A13: PARTIAL. New files avoid external vendor branding. Remove names from new active code and documentation only, not preserved historical research, and never delete a concurrent worker branch without approval.

## Required staging walkthrough
1. Open direct business, deal, contact, order, invoice, product, inventory and personnel URLs, refresh and confirm exact record in proper authorized roles.
2. Copy a sidebar link and open in a new tab. Back/Forward between Calendar and Meetings, accounts and orders. Confirm selected left menu item.
3. Try bogus deep URLs, a customer trying a staff record, and a staff user trying a foreign employee/customer. Confirm no unauthorized content.
4. Compare mobile 375px, tablet 768px and desktop 1024px/1440px; keyboard-only navigation, focus and scroll.
5. Verify Firebase Hosting emulator's deep-link fallback, then separate deployed staging environment once separately authorized.
6. Check no prior driver, customer, workforce or quick-visit workflow was lost.

## MASTER HANDOFF
A / November 6. Confirmed: URL architecture, hosting config and review branch as listed above. Decision: one role-scoped sidebar, exact record-route contract, no parallel menu. Open blockers: full CI, real-role browser/staging/deployed fallback tests, final B–G experience parity and Mia acceptance. A is owner of the central route file during consolidation. KPI affected: navigation reliability and unauthorized-route defense; no outcome measured yet. Next action: fix any CI regression, then request a safe staging browser/role acceptance walkthrough before release. No date was approved.
