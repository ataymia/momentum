# Sales & CRM C01–C25: pre-merge deep-dive audit

**Review date:** November 7, 2026 (America/Phoenix)  
**Permanent owner:** Sales & CRM / backend authorization (specialist C workstream)  
**Review target:** Existing draft [PR #166](https://github.com/ataymia/momentum/pull/166), branch `review/rc-lead-assignment-2026-11-06-0615`, targeting another review branch, **not production**.  
**Decision:** **DO NOT MERGE OR DEPLOY YET.** This is an engineering and acceptance-gap audit, not an owner approval.  
**CI rule:** A successful GitHub audit applies to the exact source SHA it checked. The audit's source SHA and result must be confirmed after the final documentation/test commit. A historical green run cannot substitute for that.

## Definition of acceptance

Each C item must satisfy the owner checklist's *entire* requirement, be backed by repeatable automated tests, have browser and authenticated role-specific staging verification, and receive Mia's acceptance. No synthetic lead/order/settlement, route label, demo-only form, typecheck success, or successful PR merge counts as completion by itself.

No C item is owner-accepted or production-released. The statuses below are **partial**, and distinguish what the code does from what remains blocked. Original C IDs are fixed; no duplication or renumbering.

## C01–C25 reconciliation

| ID | Current implemented evidence | Outstanding acceptance gate |
|---|---|---|
| C01 Dedicated Leads | `/crm/leads` with directory, create Prospect in isolated local demo, duplicate/ZIP/contact validation, qualification, follow-up and handoff | Signed-in connected create/update, persistence, provenance and security rules; representative/manager browser QA |
| C02 Contacts | Contact list/create/edit, decision-maker role, customer/location references, related orders/activity, search/export, local demo | Backend-scoped writes and independent contact identity permission tests across sessions |
| C03 Accounts/Customers | Directories, linked parent/location profiles, transactions/statements/notes, lifecycle | Trusted account creation/profile editing served by backend, migration of shared arrays, immutable creator proof, locked Firestore bypass |
| C04 Deals | Independent CRM Opportunities list/new/edit, stages, status, next steps, linked account, local demo | Authenticated connected writes, audit and concurrency; no order/revenue from won stage until approved workflow |
| C05 Redesign tools | Independent Quick Visit, Account Setup, Account Health with working local demo actions | Connected write authorization, field-device/mobile/browser QA, per-role staging |
| C06 Geographic Account Map | Independent searchable account map with plotted *saved* coordinates, account links, directory and CSV | Approved actual basemap/geocoding provider, coordinate accuracy, map interactions, accessibility and role-specific QA |
| C07 Territory map & management | Existing ZIP territory management and advisory exception guidance; territory panel | Actual verified ZIP/geographic layer, server-scoped territory writes, role/exception QA |
| C08 ZIP assignments | Normalized 5-digit ZIP and ZIP+4, multiple comma-separated ZIPs, manager suggestions and directory picker | Authenticated staging and multi-rep coverage QA |
| C09 Conflicts/exceptions | Conflict detection in active ZIP territories; advisory deviations and escalation | Atomic server validation of overlapping ZIP writes, exception review and concurrent updates |
| C10 Route/visits/appointments | Local physical Quick Visit attestation/sampling/history, retained scheduling/field tracking | Coordinated route/appointment/visit lifecycle in revised UX; device evidence and offline behavior |
| C11 Sort every table column | Added sortable account-health/map/visit records, incentive, customer transactions, documents, reps, locations and statements; other CRM tables have sorting | Exhaustive real-browser inventory of *every* C-screen table field and verified ascending/descending behavior |
| C12 Search/sort/date/filters | Search, role filters and dates on most new C-screen registers; multiple sortable and CSV views | Page-by-page matrix of applicable date filters and multi-record screens, empty/reset/large-list QA |
| C13 Left-align/standardize | `app/prototype-navigation.css` sets `.prototype-table th,.prototype-table td { text-align:left!important }` and shared table styles | Responsive visual QA including very narrow screens, overflow, contrast and screen readers |
| C14 Real sales-user picker | Searchable directory-restricted picker in account/lead responsibility transfer and territory suggestions; rejects separated/non-sales/forged IDs | Connected Firebase account-role validation (directory UI alone is not an authorization gate) and all assignment-flow inventory |
| C15 Customer profile core tabs | Overview, Comments, Transactions, Mails, source-backed local-demo Statements; related orders and filters | Connected customer-specific invoice/payment reconciliation, authentic incoming/outgoing customer email, auditable comment writing |
| C16 Locations/Documents/reps/activity | Parent-linked locations; document *status* metadata, current/originator/closer/manager responsibility and CRM activity with filters | Secure attachment vault with authenticated scope and signed originals; verified complete history and restricted downloads |
| C17 Admin consolidation | Admin duplicate candidates, manual selection, common-billing-owner affirmation, conflicts, local demo association | Production server transaction with real legal/billing verification, audit, permission hardening, restore and reconciliation |
| C18 Parent with many locations | Local demo customer-to-location references, no store-ID rewrite | Canonical per-location migration for all connected CRM/Finance/Dispatch/Orders operations |
| C19 Preserve historical records | Demo association leaves orders, rep ID, activities untouched; conflicting parent rejected | **Live** preservation of invoices, payment allocations, refunds, audit events, attachments, consumed bonuses and original provenance, verified by before/after checksums |
| C20 Duplicate acquisition bonuses | Same-parent duplicate physical address/order identity holds, payroll-source invalidation, no automatic clawback, tests for independent stores and distinct suites | Production data integrity, explicit dispute resolution and authorization, historical previously-paid review, cross-parent review as appropriate |
| C21 Continuous progress to 40 | Per-physical-location settled-case progress bar in Accounts and CRM Incentives, not pooled by billing parent | Browser visual and accessibility checks, reconciled qualifying settlement source |
| C22 Incentive filters | Search by account, filter credited representative and status, sort name/rep/cases/remain/deadline with direction | Role-scoped browser acceptance with realistic large data and duplicate/hold cases |
| C23 Only 10/40 bonuses | 10-case opening and 40 total cases/90 days distinct milestones; no 20-case entitlement; QA/cancelled excluded; requires Paid status and settlement timestamp | Production-approved compensation plan, final cash evidence, refund/adjustment treatment, payout consumption audit and owner acceptance |
| C24 2.5%/0.5%/3% commissions | `lib/sales-commission-policy.ts`, `lib/sales-commission-allocation.ts`, backlog review and manager-recipient eligibility; no payable inferred from order | Source of **qualifying net collected sales**, exclusions/refunds, historical effective policy, recipient manager validation, approved payroll ledger and no duplicate release |
| C25 Commission-only reps | Administrator-only readiness view of active sales identity, worker classification, external signed-plan verification, ZIPs, explicit order credit and payout blocks | Legally reviewed classification/agreements, employment vs contractor treatment, authenticated commission payroll, withholding/tax configuration as applicable, release approval |

## Deep-dive findings, ordered by risk

### P0: Production profile writes are not creator-scoped

- `functions/src/trusted-account-creation.ts` and `functions/src/account-profile-edit.ts` are transaction helpers deliberately **not exposed as HTTPS workflow commands**.
- Account/customer data still lives in `domains/workspace/fields/accounts`, `domains/workspace/fields/customers` and commercial `_root.accountPatches`; `lib/workspace-context-v5.tsx` and `lib/workspace-context.tsx` use legacy shared-collection mutations.
- Existing broad Firestore shared-path write permissions are not safe creator-only enforcement. Client-provided `createdByUid`, current owner, or manager role cannot prove a historical creator.
- Pending/offline journals and metadata versions in `lib/persistence.ts` must survive a migration. A rule-only lockdown before a compatible write path would strand queued updates.
- **Required:** approve canonical record design, inventory all writers, transactional authenticated commands, read migration, emulator negative tests including direct REST bypass, coordinated rule cutover and recovery plan. Until then keep connected edit/create **disabled**.

### P0: Never approve money based on a progress bar

- `paymentStatus==="Paid"` and first-settlement metadata are useful local-demo evidence but are not a substitute for server-reconciled invoice allocations, captured funds, credits/refunds and locked prior payouts.
- Previously, a first partial payment could credit all cases; repaired by `orderQualifyingPaidDate` and aligned account health/payroll earning-date calculations. The eventual source should be reconciled *final payment* events, not a boolean flag.
- Previously, the redesigned incentive preview aggregated two stores under one billing parent as a 40-case milestone; repaired to per-location accounting. Parent relationship does not confer a combined acquisition award.
- Duplicate acquisition holds are **conservative reviews**, not a decision that staff earnings are forfeited.
- C24 calculator rates are approved but not an approved payroll posting path. C25 readiness does not establish legal classification and never authorizes disbursement.
- **Required:** locked recipient attribution, actual qualifying net collected revenue, settlement/credit adjustments, signed plan, bonus ledger idempotency and audit before any payout feature can go live.

### P1: Parent association, records and duplicate identity

- Local demo can group verified locations without destroying record IDs, but production needs a single authoritative billing-parent/physical-store model, not customer creation by display-name alone.
- Preserve complete order, invoice, tax, payment, audit, attachment, historical manager and bonus records across consolidation.
- Detect duplicate store addresses even with common directional/street abbreviations, but **preserve different unit/suite numbers** and demand documented human review of suspect records.

### P1: External dependencies

- Real geographic tiles/ZIP polygons, a permitted geocoding provider and quality assurance remain unselected. A relative coordinate plot is not a street map or route planner.
- Customer Mails/Statements must use authenticated server-scoped connector data. Shared browser commerce state is *not* a secure customer portal data source.
- Documents tab has status metadata, **not** an uploaded/signed original. A secure provider or approved attachment vault, retention rules and download permissions are required.
- Connected browser QA needs real role accounts, including Administrator, Sales Manager, Sales Representative, Operations, Customer, separated and unauthenticated sessions.

## Automated audit and staging verification contract

- [ ] Pin exact PR head SHA; GitHub full-audit workflow must pass **typecheck, ESLint, logic tests, Firestore emulator rules, Storage rules, Functions compile/lint, production build** with no skipped tests hidden by an earlier step failure.
- [ ] Use an authorized staging environment and verify every C01–C25 route with allowed/denied roles; test direct requests as well as buttons/menus.
- [ ] Test add/edit/refresh and offline/online replay of accounts, contacts, deals, visits, territory and assignments, including two simultaneous rep sessions.
- [ ] Test separate real stores, duplicate addresses, same building different suites, duplicate order IDs/numbers, cancellation, partial payment, final settlement after day 90, refunds, prior paid bonuses and consumed payroll runs.
- [ ] Confirm no real expense, payroll, e-sign, email, customer payment, inventory movement or sale is triggered by demo/prototype actions.
- [ ] Verify the app on desktop, phone, keyboard-only and screen reader; ensure every data column is sortable and filtered rows/exports obey the authenticated scope.
- [ ] Compare before/after record counts, orphan references and immutable historical attribution when migrating any existing customer or account.
- [ ] Confirm all developer-created pending changes have been tested against the *final exact SHA*; earlier green CI runs do not cover later edits.
- [ ] Obtain Mia's product acceptance, legal/finance authority and explicit merge/deployment approval. Flo must separately approve production release under `docs/PRODUCTION_RELEASE_RULE.md` and `docs/DO_NOT_DEPLOY.md`.

## Merge decision and next action

**Recommendation: HOLD.** The current branch is useful for an integrated review/staging demonstration, not a production release. Do not silently merge this C branch into other specialist branches while parallel work is being consolidated. First complete the P0 server authorization + cash/payroll gates or explicitly accept a **demo-only** integration with write-disabled connected features. Then complete final role-specific browser QA and obtain an explicit go/no-go decision.

**Smallest next decision for the Director Command Center:** approve the canonical account-record migration and security cutover design, with a named backend owner. This unlocks C01–C04 and C17–C19; cash/payroll integration runs as a separate approval-gated workstream.

### MASTER HANDOFF • November 7, 2026

- **Workstream:** C, Sales & CRM; existing PR #166, draft, no merge or deploy.
- **Verified design decisions:** separate physical stores from billing parent; historical commission/bonus credit immutable; 10/40 milestones only; standard 2.5%/0.5% commission policy pre-existing.
- **New increments:** Lead, Contacts/Deals, Account Setup/Health/Map/Quick Visit, customer profile tabs, separate per-store incentive and duplicate-acquisition hold, admin commission-only readiness.
- **Open questions:** real account legal ownership/identity proofs; production record design and permissions; approved basemap/doc/email provider; reconciled collections/compensation plan; historical duplicate payout resolution.
- **Action ownership:** CRM/backend owns server account source and rules; Finance/Payroll owns qualifying collections and pay; Operations owns staging role QA; Flo owns production release authority; Mia owns checklist acceptance.
- **Dates:** no deadline confirmed. Proposed next milestone is a signed technical migration design before any production edit is enabled.
- **Financial/control outcome:** protect correct customer orders, cash evidence, employee compensation and historical sales credit.
- **Escalate:** attempts to merge/deploy a draft C branch with connected shared-array write bypass or unverified payout release must be stopped.
