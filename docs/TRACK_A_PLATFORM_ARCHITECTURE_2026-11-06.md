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
- One common sidebar on mobile, tablet and desktop. Prior hidden role-accessible Dispatch, Finance, Reporting Center and employee Timekeeping destinations are retained within the eight navigation groups until approved workflow replacements exist. Native anchor links support Copy Link and Open in New Tab, with SPA click interception only for ordinary left clicks.
- Most-specific active sidebar state, including Calendar versus Meetings.
- Browser popstate listener cleanup, lazy loading for the redesigned multi-module hub, and static-hosting/role/route regression tests.
- Accessible responsive sidebar with focus-visible states, overlay, 44px mobile menu button and reduced-motion support.
- No business records, rates, existing departmental logic or payment flows modified.

## External enterprise workflow research for A09

Official documentation of leading CRM, inventory and employee-management
software was checked separately. Useful vendor-neutral patterns include
record list and stage board views, connected activity and document history,
item-level batch traceability, and employee self-service links for leave,
attendance, calendar and files. The underlying data, actions and legal
controls remain the responsibility of B–G workstreams.

No external brand name, proprietary artwork, code or copied trade dress
is added to the Momentum application or new source documentation.

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
A13: PARTIAL. New A files/documentation are vendor-neutral. The older vendor-named prototype branch is DIVERGED from the unified branch (190 commits ahead, 31 behind in the audited comparison), so deletion is unsafe until its unique work is reconciled or archived with Mia approval. No worker branch was deleted.

## Required staging walkthrough
1. Open direct business, deal, contact, order, invoice, product, inventory and personnel URLs, refresh and confirm exact record in proper authorized roles.
2. Copy a sidebar link and open in a new tab. Back/Forward between Calendar and Meetings, accounts and orders. Confirm selected left menu item.
3. Try bogus deep URLs, a customer trying a staff record, and a staff user trying a foreign employee/customer. Confirm no unauthorized content.
4. Compare mobile 375px, tablet 768px and desktop 1024px/1440px; keyboard-only navigation, focus and scroll.
5. Verify Firebase Hosting emulator's deep-link fallback, then separate deployed staging environment once separately authorized.
6. Check no prior driver, customer, workforce or quick-visit workflow was lost.

## MASTER HANDOFF
A / November 6. Confirmed: URL architecture, hosting config and review branch as listed above. Decision: one role-scoped sidebar, exact record-route contract, no parallel menu. Open blockers: full CI, real-role browser/staging/deployed fallback tests, final B–G experience parity and Mia acceptance. A is owner of the central route file during consolidation. KPI affected: navigation reliability and unauthorized-route defense; no outcome measured yet. Next action: fix any CI regression, then request a safe staging browser/role acceptance walkthrough before release. No date was approved.

## Deep-dive A audit supplement — November 7, 2026

- **Fixed-source browser proof:** [GitHub Actions run 42382720126](https://github.com/ataymia/momentum/actions/runs/42382720126), commit `c2d7d795740ce1cb6d907b3e654b4f0b3e9fb4f1`, passed isolated Chromium login/deep links, history/refresh, Calendar/Meetings, customer role separation, tablet/phone drawer and keyboard navigation. This synthetic result is not approved staging acceptance.
- **Fixed-source full audit:** [GitHub Actions run 42382720114](https://github.com/ataymia/momentum/actions/runs/42382720114), same commit, passed typecheck, lint, logic, Firestore/Storage emulator rules, Functions, production build and Hosting fallback. Review subsequent commit checks separately rather than inheriting this result.
- **A10 regression found and repaired in the follow-up A patch:** /crm/quick-visit, /crm/account-setup, /crm/account-health and /people/directory had active older screens but were marked prototype and fell through to a placeholder. Their registry entries now route to the preserved functional legacy renderers until their department owners integrate the redesigned replacements. This protects functionality but does NOT satisfy A07 visual redesign.
- **Account Health permission:** the recognized sidebar route uses its appropriate CRM/accounts access key, without requiring a non-granted legacy page permission.
- **New audit file:** `docs/A_PREMERGE_NAVIGATION_AUDIT_2026-11-07.md` lists every A01–A13 gate and known B–E route collisions. A07/A08 cannot be accepted from this isolated A branch alone.
- **Do not merge yet:** Integrate A+B+C+D+E+F+G into a NEW review chain; rerun complete CI, real-role staging, browser, security and accessible devices. Main has an independent Firebase Functions lint failure as of its 2026-11-06 run; it was not edited here.
