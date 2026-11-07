# Momentum master platform development checklist

Owner-provided November 5, 2026 master checklist. **98 immutable IDs; none independently accepted by this document.** “Owner review snapshot” repeats Mia's November 4 status descriptions, not a new code review. The engineering reviewer must update a separate evidence column ONLY after verifying exact source, CI, role access, browser/staging and user acceptance. A route or review PR is not completion. Keep every open ID in the ledger.

## A. Platform architecture & navigation

| ID | Requirement | Owner review snapshot | Engineering evidence / remaining gate |
| --- | --- | --- | --- |
| A01 | Convert one-page application into multi-page, URL-addressable application. | Partial | Built: client URL-based views, native record links and Hosting SPA fallback. Browser demo QA passed 2026-11-07; still a client-rendered SPA, not independently server-rendered Next pages. Not accepted. |
| A02 | Make browser Back, Forward, refresh, and copied links work correctly. | Partial | Browser-Verified in isolated synthetic Chromium: first-login copied URL, Back/Forward, direct refresh and history. Real staging-role/device QA pending; not accepted. |
| A03 | Provide individual shareable URLs for businesses, orders, products, and records. | Partial | Browser-Verified example account deep link; native link and fail-closed encoded ID tests. B–E new record patterns require coordinated integration and foreign-record staging QA; not accepted. |
| A04 | Complete URL-aware routing with Firebase Hosting fallback. | Built; deployment QA pending | Automated-Verified Firebase Hosting emulator fallback and direct URL with production build; deployed host/reverse-proxy QA pending; not accepted. |
| A05 | Consolidate all navigation into left sidebar; remove old module header tabs. | Partial | Built: eight-group desktop/tablet/mobile sidebar, self-service Workspace, collapsed-label restoration; synthetic browser passed. Four still-live legacy routes restored pending C/F redesign; B–G parity pending; not accepted. |
| A06 | Fix active-page highlighting, including Calendar vs. Meetings. | Testing | Browser-Verified in local Chromium: active Calendar vs Meetings across click, Back/Forward and refresh. Staging/browser matrix pending; not accepted. |
| A07 | Completely redesign legacy screens instead of embedding old interfaces. | Partial | Partial: central header navigation removed; working old workflows retained until B–G redesign is reviewed, not replaced by placeholders. No claim of full screen parity; not accepted. |
| A08 | Give each department a specialized application experience with consistent overall styling. | Partial | Partial: unified responsive shell and route contracts; B–G specialized screen parity and final cross-stream styling/role QA pending; not accepted. |
| A09 | Research useful enterprise software ecosystem functionality and implement appropriate workflows. | Ongoing | Source-backed vendor-neutral enterprise UX conventions researched; functional adoption owned by B–G. No proprietary assets or external branding in new A source. Not accepted. |
| A10 | Preserve data, permissions, processes, and business logic throughout redesign. | Regression QA pending | Automated-Verified route-denial checks and full rules regression on review SHA. No real production role/tenant or browser staging access verification; fallback legacy screens preserved pending redesign; not accepted. |
| A11 | Support desktop, tablet, and mobile layouts. | Partial | Browser-Verified in isolated Chromium at desktop, tablet and phone viewport; collapsed mobile sidebar, focus, Escape, reduced motion CSS. Actual physical device and WCAG acceptance pending; not accepted. |
| A12 | Maintain isolated prototype branch; no merge or deployment without Mia's approval. | Ongoing control | Protected: isolated draft PR #167 and expected-SHA updates; main untouched by A. No merge/deploy without Mia sign-off; not accepted for release. |
| A13 | Remove external vendor naming from new source and documentation; clean up obsolete branch. | Partial | Partial: new A source/doc vendor-neutral. Historical prototype branch diverged with unique commits; do not delete without reconciliation. Not accepted. |

## B. Workspace, tasks, meetings & calendar

| ID | Requirement | Owner review snapshot | Engineering evidence / remaining gate |
| --- | --- | --- | --- |
| B01 | Role-relevant Home dashboard | Testing | Unaccepted; independently verify |
| B02 | Independent redesigned Approvals | Partial | Unaccepted; independently verify |
| B03 | Independent redesigned Action Center | Partial | Unaccepted; independently verify |
| B04 | Separate remaining My Work destinations | Partial | Unaccepted; independently verify |
| B05 | Shared employee and company calendar | Partial | Unaccepted; independently verify |
| B06 | Create meetings, assign attendees and invitations | Planned | Unaccepted; independently verify |
| B07 | Upcoming meetings and reminders on Home | Planned | Unaccepted; independently verify |
| B08 | Meeting invitation and change notifications | Planned | Unaccepted; independently verify |
| B09 | Meeting/calendar visibility and permissions | Planned | Unaccepted; independently verify |

## C. Sales & CRM

| ID | Requirement | Owner review snapshot | Engineering evidence / remaining gate |
| --- | --- | --- | --- |
| C01 | Leads directory | Partial | Unaccepted; independently verify |
| C02 | Contacts directory linked to businesses | Partial | Unaccepted; independently verify |
| C03 | Accounts/Customers directory | Built; QA pending | Unaccepted; independently verify |
| C04 | Independent Deals and sales pipeline | Planned | Unaccepted; independently verify |
| C05 | Redesign Quick Visit, Setup, Health and CRM tools | Partial | Unaccepted; independently verify |
| C06 | Redesign geographic Account Map | Legacy retained | Unaccepted; independently verify |
| C07 | Territory Map and management | Partial | Unaccepted; independently verify |
| C08 | Whole-ZIP, comma-delimited and multiple ZIP assignments | Partial | Unaccepted; independently verify |
| C09 | Territory conflict, sharing, exception and reassignment controls | Partial | Unaccepted; independently verify |
| C10 | Route tracking, visits, appointments and reports redesigned | Partial | Unaccepted; independently verify |
| C11 | Every visible table column sortable | Partial | Unaccepted; independently verify |
| C12 | Search, sort, date ranges and filters for every multi-record page | Partial | Unaccepted; independently verify |
| C13 | Left-aligned standardized data tables | Partial | Unaccepted; independently verify |
| C14 | Searchable real-user rep assignment controls | Planned | Unaccepted; independently verify |
| C15 | Customer Overview, Comments, Transactions, Mails, Statements | Partial | Unaccepted; independently verify |
| C16 | Customer locations, documents, reps and related activity | Partial | Unaccepted; independently verify |
| C17 | Admin-only duplicate review and consolidation | Partial | Unaccepted; independently verify |
| C18 | Parent customers with multiple store locations | Demo only | Unaccepted; independently verify |
| C19 | Preserve financial, order, document and attribution history on consolidation | Design only | Unaccepted; independently verify |
| C20 | Prevent duplicate acquisition bonuses after consolidation | Planned | Unaccepted; independently verify |
| C21 | Continuous actual-case incentive progress toward 40 | Revision required | Unaccepted; independently verify |
| C22 | Incentive sorting, filters and rep filter | Planned | Unaccepted; independently verify |
| C23 | Distinct 10-case and 40-case bonuses; no 20-case entitlement | QA pending | Unaccepted; independently verify |
| C24 | Approved representative 2.5% plus manager override 0.5% | Code/effective-term QA pending | Unaccepted; independently verify |
| C25 | Commission-only sales reps, territories, attribution and controls | Planned | Unaccepted; independently verify |

## D. Commerce, products, orders & payments

| ID | Requirement | Owner review snapshot | Engineering evidence / remaining gate |
| --- | --- | --- | --- |
| D01 | Items/Products directory | Built; QA pending | Unaccepted; independently verify |
| D02 | Product detail orders, locations, stock and history | Partial | Unaccepted; independently verify |
| D03 | SKU, pack and stock-to-lot verification | Partial | Unaccepted; independently verify |
| D04 | Independent Price Books with approved pricing | Planned | Unaccepted; independently verify |
| D05 | Sales Orders list and record redesign | Built; QA pending | Unaccepted; independently verify |
| D06 | Independent Invoices with print/export | Partial | Unaccepted; independently verify |
| D07 | Payments Received module | Read-only prototype | Unaccepted; independently verify |
| D08 | Sales Returns and Credit Notes | Prototype; live workflow missing | Unaccepted; independently verify |
| D09 | Order approvals, statuses, fulfillment and invoice links | Partial | Unaccepted; independently verify |
| D10 | Approve and integrate payment processor prioritizing ACH | Not complete | Unaccepted; independently verify |
| D11 | Secure invoice payment links | Not built | Unaccepted; independently verify |
| D12 | Customer registration and portal access | Partial | Unaccepted; independently verify |
| D13 | Customer portal payment | Not built | Unaccepted; independently verify |
| D14 | One-time and recurring monthly/quarterly payment choices | Not built | Unaccepted; independently verify |
| D15 | Rep-initiated payment requests | Planned | Unaccepted; independently verify |
| D16 | Server-verified payment events and reconciliation | Not built | Unaccepted; independently verify |
| D17 | Complete scoped customer portal features | Partial | Unaccepted; independently verify |
| D18 | Real rep email on confirmed, delivery and paid milestones | Not live | Unaccepted; independently verify |

## E. Operations, fulfillment & purchasing

| ID | Requirement | Owner review snapshot | Engineering evidence / remaining gate |
| --- | --- | --- | --- |
| E01 | Redesign Inventory | Built; QA pending | Unaccepted; independently verify |
| E02 | Adjustments, Packages, Shipments and Ledger | Partial | Unaccepted; independently verify |
| E03 | Verified stock, warehouse, traceability and movements | Partial | Unaccepted; independently verify |
| E04 | Redesign dedicated mobile Driver experience | Partial | Unaccepted; independently verify |
| E05 | Routes, stops, delivery, POD, signature and exceptions | Partial | Unaccepted; independently verify |
| E06 | Preserve and redesign rep self-delivery | Partial | Unaccepted; independently verify |
| E07 | Retire office Dispatch only after parity | Planned | Unaccepted; independently verify |
| E08 | Vendors, Expenses, PO, Receipts, Bills, Payments Made and Credits | Incomplete | Unaccepted; independently verify |
| E09 | Purchasing approvals, receipt matching and audit | Planned | Unaccepted; independently verify |

## F. HR, Marketing, reporting & administration

| ID | Requirement | Owner review snapshot | Engineering evidence / remaining gate |
| --- | --- | --- | --- |
| F01 | Separate Human Resources and Marketing departments | Navigation built; QA pending | Unaccepted; independently verify |
| F02 | Redesign HR specialized experience | Partial | Unaccepted; independently verify |
| F03 | Employee profiles, onboarding, docs, leave, attendance, training and performance | Partial | Unaccepted; independently verify |
| F04 | Payroll runs, approvals, earnings, liabilities and corrections | Partial; release blocked | Unaccepted; independently verify |
| F05 | Employee-specific HR/payroll confidentiality | Security and staging QA pending | Unaccepted; independently verify |
| F06 | Production-ready HR forms/signatures/compliance | Not verified | Unaccepted; independently verify |
| F07 | Marketing campaigns, ambassadors and measurable outcomes redesign | Planned | Unaccepted; independently verify |
| F08 | Forecasts, Reports, Dashboards and drilldowns | Partial | Unaccepted; independently verify |
| F09 | Customer support Cases module | Planned | Unaccepted; independently verify |
| F10 | Access-controlled Documents module | Planned | Unaccepted; independently verify |
| F11 | Admin, permissions, audit, integrations and data exchange redesign | Partial | Unaccepted; independently verify |
| F12 | Admin Employee Profiles and Directory destinations | Partial | Unaccepted; independently verify |
| F13 | Department, role, user and action permissions | Partial; security QA pending | Unaccepted; independently verify |
| F14 | Calls, Solutions, chat and duplicate Gmail inbox excluded | Navigation QA pending | Unaccepted; independently verify |

## G. Bugs, reliability & integrity

| ID | Requirement | Owner review snapshot | Engineering evidence / remaining gate |
| --- | --- | --- | --- |
| G01 | Fix anomalous unread badge counts | Investigating | Unaccepted; independently verify |
| G02 | Fix notifications reappearing as unread | Testing needed | Unaccepted; independently verify |
| G03 | Correct unrelated identical notification timestamps | Code fix; QA pending | Unaccepted; independently verify |
| G04 | Remove misleading account audit updates | Investigating | Unaccepted; independently verify |
| G05 | Stop account normalization from fabricating timestamps | Code fix; QA pending | Unaccepted; independently verify |
| G06 | Distinguish business changes from sync/hydration/recalculation | Partial | Unaccepted; independently verify |
| G07 | Reliable actor, change and timestamp audit records | Partial | Unaccepted; independently verify |
| G08 | Preserve recoverable legitimate audit history without noise | Testing pending | Unaccepted; independently verify |
| G09 | Remove obsolete header navigation and legacy pages | Major work outstanding | Unaccepted; independently verify |
| G10 | Complete role, deep-link, permission and release testing | Blocked by QA | Unaccepted; independently verify |

## CI and release controls (not part of 98)

| ID | Gate |
| --- | --- |
| FIX-CI-01 | Fix prototype HR time-off lint on review branch |
| FIX-CI-02 | Fix Functions sales-inactivity lint on review branch, not main |
| FIX-CI-03 | Final prototype SHA full audit passes |
| FIX-CI-04 | Current main full audit separately verified, no main modifications |
| FIX-CI-05 | HR real-role confidentiality and authorization |
| FIX-CI-06 | Staging desktop and mobile browser acceptance |
| FIX-CI-07 | Mia explicitly authorizes merge or deployment |

## Locked owner decisions
- Rep commission 2.5%, manager override 0.5%, combined 3%, subject to signed effective earnings terms before payroll. No 20-case incentive; distinct approved 10/40-case bonuses.
- Administrators are never required to submit weekly reports.
- One unified design with fully rebuilt department-specific screens, stable URLs and eight sidebar groups: Workspace; Sales & CRM; Commerce; Operations; Human Resources; Marketing; Insights & Support; Administration.
- No invented records or metrics, placeholder UI, noisy explanatory captions, customer cross-account leakage, or employee confidentiality leaks.
- All review work isolated. Never modify, merge into or deploy main without Mia's separate authorization.

## Current review work awaiting acceptance
- Draft PR #153, `35a9d29e26d3c1703fe3d711b3bf201e23c88f5e`: Deals/Contacts CRM source-linked screens and local-demo-only mutations under independent CI. C02/C04/C11/C12/A03 **Built on review branch only**, NOT user accepted; real server authorization, browser/mobile acceptance and full connected editing remain open.
- Prior draft PRs #149–#152 remain separate; no automatic merge or inference that all their functionality is complete.
