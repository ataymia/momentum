# Momentum Distribution · User-requested correction register

**Started:** November 7, 2026
**Branch:** `integration/a-g-unified-2026-11-07`
**Ledger:** 77 stable IDs R01–R77, separate from original A01–G10 (98 requirements).
**Owner:** Mia confirms acceptance; engineering updates are evidence, not final acceptance.

## Implementation notes (not accepted)
- R01–R09: Workspace now begins Home → Clock In/Timekeeping → Action Center, with meetings/calendar retained. A separate personal Account routes to signed-in-only profile, pay, leave, training and completed-work records. Compatibility URLs retained. Code committed; comprehensive current-head acceptance pending.
- R11–R14: Typed CRM sort utility added for Lead, Account and Contact directories (natural numeric order, actual date order, workflow stage, postal codes, missing values last, deterministic ties), with regression tests. Code committed; current-head test gate pending.
- R15–R16: Quick Visit layout rebuilt into business, outcome and follow-up steps with visible field affordances; existing CRM visit write/attribution kept. Backend connected write remains a known separate limitation.
- R17–R18: Account Setup defaults to creating a NEW customer/location, validating duplicates/territory and transitioning to the existing billing and tax-identity form. Canonical demo writes are preserved; connected server writes and actual document collection remain open.
- R19–R22: Customer Documents, Representatives and Activity deep-link patterns added. Documents includes invoice links from a scoped demo finance projection with connected-session fail-closed. Routes/code committed, browser and data verification pending.
- R23: Previously recorded orders/invoices need an independent source-of-truth linkage audit; no claim of restored historical transactions yet.
- R54: New fieldset hierarchy plus input border/focus states added to HR and CRM form surfaces. Global accessibility acceptance remains open.
- R69–R70: Passive audit observer now deduplicates repeated observations sharing source record, actor, action and source timestamp without deleting historical audit events; regression tests added. True production actor attestation remains a separate release consideration.
- R42: Official-source research documented in [HR form sources](HR_OFFICIAL_FORMS_WORKFLOW_2026-11-07.md). No completed PDF workflow is claimed.
- R54: Input contrast and focus styling improved in initial pass, not yet accepted globally.

## W — Workspace and personal Account
- [ ] R01 — Simplify Workspace navigation to work only
- [ ] R02 — Order Home, Clock In/Timekeeping, then Action Center before meetings/calendar
- [ ] R03 — Centralize urgent actions, exceptions and approval entry points in Action Center
- [ ] R04 — Retain meeting invitations, shared calendars and work agendas in Workspace
- [ ] R05 — Add personal Account separate from CRM Accounts
- [ ] R06 — Move My Employee Workspace/profile to personal Account
- [ ] R07 — Move personal time off and pay history to Account with the HR source intact
- [ ] R08 — Move Completed Work to Account with genuine actor attribution
- [ ] R09 — Restrict personal HR, leave and pay records to the signed-in employee
- [ ] R10 — Modernize old Clock In/Timekeeping screen without altering payroll-authoritative timekeeping

## C — Sales and CRM
- [ ] R11 — Fix Lead sorting
- [ ] R12 — Fix Contact sorting
- [ ] R13 — Fix Account sorting
- [ ] R14 — Standardize natural numbers, dates, status, rep, null-last and ascending/descending sort behavior
- [ ] R15 — Redesign Quick Visit layout
- [ ] R16 — Verify Quick Visit record saves, links, activity and follow-up
- [ ] R17 — Rebuild Account Setup for NEW customers/locations instead of browsing old accounts
- [ ] R18 — Complete Account Setup identity, contact, location, assignment, docs, dedupe, validation and submit
- [ ] R19 — Repair Customer Documents tab and its links
- [ ] R20 — Show correct customer docs, invoices and statements with permissions
- [ ] R21 — Repair customer Representatives tab
- [ ] R22 — Repair customer Activity tab and meaningful history
- [ ] R23 — Repair customer Transactions including prior orders/invoices/payments
- [ ] R24 — Make role-appropriate Rep Self-Delivery workflow visible and functional
- [ ] R25 — Calculate Sales Incentives using appropriate recorded business data
- [ ] R26 — Preserve accurate incentive sorting, filters and 40-case progress
- [ ] R27 — Consolidate overlapping Territory Map and Territories & Routes without losing distinct functions

## D — Commerce and accounting
- [ ] R28 — Replace old Financial Overview interface
- [ ] R29 — Replace old Accounting interface
- [ ] R30 — Link financial records across sales orders, invoices, payments, returns and credits
- [ ] R31 — Remove legacy Commerce UX only after replacement parity
- [ ] R32 — Protect improved Items, Price Books, Orders, Invoices, Payments, Returns, Credit Notes and customer portal
- [ ] R33 — Verify Commerce status changes, sorting, actions, record relationships and cross-module navigation

## E — Operations and delivery
- [ ] R34 — Remove Legacy Dispatch from final navigation
- [ ] R35 — Move required dispatch scheduling, assignments, routes and exceptions into Delivery Operations
- [ ] R36 — Verify Inventory, Packages, Shipments, warehouse and delivery record connections
- [ ] R37 — Unify rep self-delivery and driver delivery with signed custody and proof-of-delivery controls

## H — Human Resources
- [ ] R38 — Redesign HR Overview
- [ ] R39 — Separate administrative HR functionality from personal Account self-service
- [ ] R40 — Make New Employee Setup functional and start onboarding
- [ ] R41 — Build complete onboarding task, evidence, review, correction and completion flow
- [ ] R42 — Identify current official federal and Arizona hiring/tax forms
- [ ] R43 — Create versioned, admin-managed HR PDF template library
- [ ] R44 — Allow assigned employee to fill, save and submit authorized PDF fields
- [ ] R45 — Implement compliant form-specific signatures and signatory identity verification
- [ ] R46 — Support return, correction, resubmission, versioning and review statuses
- [ ] R47 — Attach employee submissions to their Employee Profile and document register
- [ ] R48 — Maintain secure HR-side original-document storage with restricted access
- [ ] R49 — Validate document retention, classification, privacy and I-9 special requirements
- [ ] R50 — Preserve improved Employee Profiles while linking onboarding documents
- [ ] R51 — Redesign legacy Training & Development
- [ ] R52 — Enable actual employee time-off request submission
- [ ] R53 — Connect leave approval/denial, communication, HR and timekeeping
- [ ] R54 — Make form inputs obvious, high contrast and keyboard accessible; preserve improved Attendance/Timecards

## M — Marketing
- [ ] R55 — Redesign old Brand Ambassador experience
- [ ] R56 — Remove Campaigns versus Marketing Operations navigation and tab duplication
- [ ] R57 — Preserve campaign planning, request, budgets, approval, recorded activity and meaningful outcomes

## I — Insights, Support and Documents
- [ ] R58 — Redesign legacy Reports
- [ ] R59 — Redesign legacy Dashboards using real source records
- [ ] R60 — Modernize/deduplicate Reporting Center
- [ ] R61 — Use auditable definitions and evidence for forecasts and reports
- [ ] R62 — Clarify and implement purpose, ownership and workflow of Cases
- [ ] R63 — Complete shared Documents module and redesign legacy Help

## A — Administration and audit
- [ ] R64 — Redesign legacy Administration landing page
- [ ] R65 — Clarify Personnel Editor and remove overlapping editor destinations
- [ ] R66 — Redesign administrative Employee Directory
- [ ] R67 — Redesign Users & Roles and fine-grained access management
- [ ] R68 — Redesign Workforce Live
- [ ] R69 — Stop repeated meaningless Audit Center events
- [ ] R70 — Preserve accurate who, what, when, source and historical audit records
- [ ] R71 — Redesign Data Exchange without regressing working Account Consolidation

## Q — Integrated platform quality
- [ ] R72 — Remove old-looking inconsistent layouts and unclear controls
- [ ] R73 — Verify every navigation, record, tab, button and action destination
- [ ] R74 — Verify connected handoffs across CRM, Commerce, Inventory, Delivery, HR, Marketing and Insights
- [ ] R75 — Enforce department/role/employee/customer data boundaries
- [ ] R76 — Check mobile/tablet/desktop forms, tables, navigation and accessibility
- [ ] R77 — Preserve A01–G10's original 98 features; distinguish demo from live functionality; regression-test each update

## Verification and change-control rules
- Only check an item after its actual workflow is functional, correctly scoped and confirmed in code/tests and user review.
- Maintain one consolidation branch and no unauthorized main merge or deployment.
- Never replace functioning source workflows with prettier but inert pages.
- Personal Account (employee self-service) and business CRM Accounts must remain distinct.
- Protect private documents and payroll records; only trusted server authorization can release originals.
- No fabricated transactions, regulatory signoffs, collection confirmations or HR document acknowledgments.
- Record newly discovered issues under the closest stable R-ID or a linked defect note, not an untracked parallel checklist.
