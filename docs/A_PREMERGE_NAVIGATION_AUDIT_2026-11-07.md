# A01–A13: platform architecture pre-merge audit and integration contract

**Date:** 2026-11-07 (America/Phoenix)  
**Owner:** A workstream (platform routing, navigation, responsive shell)  
**Review PR:** #167, \`review/track-a-platform-architecture-2026-11-06\`  
**Source base:** \`review/rc-crm-deals-contacts-2026-11-05-1810\` at \`e70f4a3e2801df2ab62cea0b5e601cc44e40f96c\`.  
**Release restriction:** DRAFT; do not merge, rebase, delete a branch, deploy or mutate production without Mia's separate authorization.  
**Pre-merge status:** automated code verification and synthetic browser review are different from authorized staging-role acceptance. PR merges must not be inferred from "mergeable" metadata.

## Architectural decisions verified in current source

1. Next.js uses a static-export browser application, with Firebase Hosting fallback to \`/index.html\`. This supports shareable, refreshable URL routes **through the hosting rewrite**. It is not server-rendered independent Next pages. A01 must remain PARTIAL unless the owner accepts client-rendered URLs as the architectural definition.
2. One approved eight-department left sidebar is mounted for both staff desktop and mobile/tablet; a dedicated driver application remains a separate, purpose-built role experience. The older mobile bottom nav is no longer mounted. The mobile sidebar is keyboard dismissible, focus-contained and restores the collapsed desktop labels.
3. Native anchors make record and sidebar links copyable and openable in new tabs; normal clicks update browser history. Back/Forward and initial copied-link hydration are tracked separately.
4. Exact record-path contracts reject malformed percent encodings, encoded slash/backslash, traversal and unregistered suffixes before a record component decodes its ID.
5. A navigation permission is presentation-level defense-in-depth. Firestore/Storage rules and actual record ownership must be verified again in an isolated staging role test. No route permission or menu entry should be treated as permission to query another person's records.
6. Employee self-service is in Workspace, not in restricted HR Administration. Payroll views remain user-scoped or Administrator-only according to their existing owners' controls; no expanded access to tax forms or employee secrets is approved.
7. The legacy Account Health page key does not grant page permission; registered module permissions must take precedence over legacy page-key fallback.

## Every A item: review progress vs acceptance

| ID | Implemented or confirmed | Outstanding before owner acceptance |
| --- | --- | --- |
| A01 | Browser URL state + record routes + fallback | Full direct-load acceptance, architectural definition agreed, cross-team parity |
| A02 | Push/replace/popstate, readiness before page render, real anchors | Browser QA + deployed intended host Back/Forward and refresh |
| A03 | Explicit record URL patterns, customer/order/item/CRM links | B–E routes below, real-record owner/tenant and copy-link QA |
| A04 | Static export + Firebase Hosting rewrite + emulator smoke | Authorized deployed hosting and any secondary host rewrite proof |
| A05 | Eight-group sidebar across devices, preserved legacy operational destinations and staff self-service | B–G legacy header/nav parity; responsive browser acceptance |
| A06 | Specific current-route selection, Calendar versus Meetings, expandable current group | Browser click/Back, nested-route and keyboard acceptance |
| A07 | Old tab structure removed from central shell | B–G must replace remaining legacy department screens, not merely embed them |
| A08 | Unified chrome, responsive sidebar, source-linked routes | Department workflow and visual parity from B–G with common component decisions |
| A09 | Vendor-neutral patterns researched from official enterprise workflow documentation | Feature-by-feature justification, no copied trade dress or invented workflows |
| A10 | Defensive route checking and synthetic role tests; backend rules preserved | Real Firebase role/record scoping, history/compatibility and old-client regression |
| A11 | Responsive shell, mobile open/close/focus and desktop-collapsed restoration | Browser screenshots and touch/keyboard accessibility at 390/768/1440px; actual devices |
| A12 | Isolated review branch and draft PR; main not changed by A | Keep branch isolated; Mia approves subsequent integration/deploy |
| A13 | New A source/docs avoid external product branding | Historical divergent prototype branch unique work and obsolete code require reviewed reconciliation; no auto-deletion |

**No item in this table is User Accepted or Released.**

## Parallel branch interface collisions: required integration steps

**These are routes built on independent review streams, NOT currently implemented on this isolated A branch.** A's strict router will correctly return "Page unavailable" for an unregistered deep route. The integrator must add each pattern **at the same time** as its owning department component, and test role/record authorization. Do not whitelist a future route independently and display a placeholder as a finished feature.

| Owner | Independently reviewed paths | Required A integration |
| --- | --- | --- |
| B, Meetings / Calendar | \`/calendar/agenda\`, \`/calendar/invitations\`, \`/calendar/meetings/new\`, \`/calendar/meetings/:id\`, \`/calendar/meetings/:id/edit\` | Add menu destinations, precise meeting patterns, member/organizer access and true page handlers |
| C, CRM | \`/crm/leads/:id\`, modern Leads/Contacts/Deals, account health and setup | Add lead record pattern, reconcile A route registry with C's new dispatch, preserve manager/rep scope |
| D, Commerce | \`/commerce/price-books/:id\`, portal invoice/finance flows | Add price-book record pattern and approved price/book scope, preserve source-linked settlement restrictions |
| E, Operations | \`/purchases/{vendors,expenses,orders,receipts,bills,payments,credits}/:id\`, \`/support/cases/:id\`, \`/people/attendance/:id\`, \`/people/performance/:id\` | Add per-type permissions instead of a blanket purchasing permission; case access restricted by its owner; HR personal records per-user and admin-only sensitive data |
| F / G | HR, administration, reliability and notifications may also change sidebar, state, permissions and document URLs | Review latest diff on the day of integration; preserve stronger security restrictions and history, do not silently override |

**Known conflicting shared files:** \`lib/navigation-route-registry.ts\`, \`components/prototype/operations-hub.tsx\`, \`components/app-shell-v4.tsx\`, \`app/layout.tsx\`, \`package.json\`, plus tests and rule files. Resolve on a NEW integration review branch only after fresh parent SHA comparison. The B/D/E independent draft PRs currently report non-mergeable to their own bases; no automatic integration claim.

**Branch safety:** As reviewed on 2026-11-07, \`main\` and \`prototype/unified-workspace-redesign-2026-11-03\` have advanced independently from this A branch. The historical vendor-named prototype has unique divergent commits and must not be deleted before reconciliation or express archival approval.

## Required final QA gates before requesting an actual merge

- [ ] **Fixed final SHA:** full typecheck, lint, logic, Firestore rules, Storage rules, Firebase Functions and production build, plus clean \`git diff\`.
- [ ] **Safe browser:** local synthetic no-network desktop/tablet/phone review of login, authorized direct URL, refreshed URL, Back/Forward, active sidebar, screen-size behavior, focus trapping, denied bogus route and customer/admin separation. Synthetic browser is not production staging acceptance.
- [ ] **Final integrated review branch:** assemble A+B+C+D+E+F+G **without modifying main**, resolve duplicate route dispatch and correct source/reviewer permissions, run combined full CI.
- [ ] **Real-role staging:** authorized Administrator, manager, rep, employee, marketing, warehouse, delivery driver and customer test accounts against safe permission-scoped data (including foreign-record denial).
- [ ] **Device acceptance:** browser and actual phone/tablet: no hidden menus, readable record lists, escape/keyboard, no clipped data, performant transitions and no broken back navigation.
- [ ] **Hosting evidence:** direct copied-link refresh to an order and a customer record in the authorized staging host; review any extra reverse proxy rewrite separately.
- [ ] **User sign-off:** Mia reviews the merged design/functionality and explicitly authorizes any main merge/deployment.

## MASTER handoff

Workstream: Platform A, 2026-11-07. Engineering owner: A review branch; integration owner: future designated consolidator; decision owner: Mia. No approved deadline for release or deployment. Impact: navigation reliability and cross-team access controls, **not measured sales or revenue**. Dependencies: B–G completion, conflict resolution, staging roles/browser access, owner acceptance. Escalation: do not accept A07/A08 or declare the platform 95% complete based on a green isolated PR. Next decision: which integration branch combines the 98-ID checklist without losing concurrent work. Until authorized, this remains a draft.
