# Momentum release-candidate acceptance ledger

> This is an additive engineering/evidence index for the original owner-controlled 98-product-item master checklist. The original authoritative descriptions and previously accepted statuses were not available in the current checked-in documents. **Unreconciled is not Not Started**. Do not erase earlier work or reinterpret this index as a substitute for the owner checklist.

Review branch: `review/rc-lead-assignment-2026-11-06-0615` • existing draft [PR #166](https://github.com/ataymia/momentum/pull/166). No production deployment or integration is authorized.

## Rules

1. An ID is complete only when the actual entire source requirement and user journey have been checked, not just an increment. Built requires full feature coverage; Automated-Verified requires exact SHA and successful tests; Browser/Staging-Verified requires authorized role-specific QA; User-Accepted requires Mia's explicit decision; Released requires approved merge/deploy evidence.
2. `unreconciled` means the exact historical source description and stage must be recovered, not assumed missing. `partial` means a concrete unfinished increment exists; a partial increment NEVER counts as Built for the full ID.
3. Do not manufacture descriptions or collapse customer/employee permissions. Keep canonical references and statuses. Resolve the 98 labels and past evidence from the original master checklist before migrating any item stage.
4. No duplicate IDs, no premature completion, and do not count FIX-CI-01–07 among the 98 product requirements.

**C01–C25 owner checklist reconciled against November 6 owner instructions.** The 25 requirements are not accepted or released. Earlier prototype work remains counted once. Current increments also affect C05–C06, C10–C13, C16, C20 and C25; tests apply only to the checked source SHA. A route, UI, isolated demo write or passing CI alone cannot satisfy the full requirement.

## 98 product IDs

| ID | Built | Automated-Verified | Browser/Staging-Verified | User-Accepted | Released | Review-chain evidence / next gate |
|:---|:---|:---|:---|:---|:---|:---|
| A01 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| A02 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| A03 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| A04 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| A05 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| A06 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| A07 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| A08 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| A09 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| A10 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| A11 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| A12 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| A13 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| B01 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| B02 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| B03 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| B04 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| B05 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| B06 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| B07 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| B08 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| B09 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| C01 | partial | incremental tests only; full ID not automated-verified at latest SHA | not verified | not accepted | not released | Owner baseline basic Leads prototype; now demo create, qualify, follow-up; connected role authorization missing |
| C02 | partial | incremental tests only; full ID not automated-verified at latest SHA | not verified | not accepted | not released | Local demo Contacts list/create/edit linked to existing accounts; server-authorized mutations missing |
| C03 | partial | incremental tests only; full ID not automated-verified at latest SHA | not verified | not accepted | not released | Customer/Account directory, profile and linked accounts exist; trusted profile-write cutover missing |
| C04 | partial | incremental tests only; full ID not automated-verified at latest SHA | not verified | not accepted | not released | Demo Deals list/new/edit/pipeline, linked account/orders; connected persistence missing |
| C05 | partial | incremental tests only; full ID not automated-verified at latest SHA | not verified | not accepted | not released | Independent local-demo Quick Visit, Account Setup and Account Health pages now routed; connected writes, mobile field/staging role testing outstanding |
| C06 | partial | incremental tests only; full ID not automated-verified at latest SHA | not verified | not accepted | not released | Independent CRM Account Map uses only saved coordinate pins, account links, filters and CSV; basemap tiles/real geographic routing provider not approved |
| C07 | partial | incremental tests only; full ID not automated-verified at latest SHA | not verified | not accepted | not released | Existing ZIP territory panel and geographic rules; verified map overlay and authenticated workflow tests remain |
| C08 | partial | incremental tests only; full ID not automated-verified at latest SHA | not verified | not accepted | not released | Whole ZIP, comma-separated/multiple ZIP suggestions implemented; connected-role QA missing |
| C09 | partial | incremental tests only; full ID not automated-verified at latest SHA | not verified | not accepted | not released | Active ZIP conflict and exceptions designed; concurrent server validation missing |
| C10 | partial | incremental tests only; full ID not automated-verified at latest SHA | not verified | not accepted | not released | Field visit record plus search/date/sort history added; existing scheduling/route pings retained; connected workflow tests pending |
| C11 | partial | incremental tests only; full ID not automated-verified at latest SHA | not verified | not accepted | not released | Account Health/Map/Quick Visit history, incentive and other CRM lists sortable; not all visible columns across every CRM page proven |
| C12 | partial | incremental tests only; full ID not automated-verified at latest SHA | not verified | not accepted | not released | Search, date ranges, filters and asc/desc sorting on several new pages; full every multi-record page acceptance QA missing |
| C13 | partial | incremental tests only; full ID not automated-verified at latest SHA | not verified | not accepted | not released | app/prototype-navigation.css forces common CRM table headers/cells left aligned; browser/viewport visual verification missing |
| C14 | partial | incremental tests only; full ID not automated-verified at latest SHA | not verified | not accepted | not released | Searchable real-user dropdown in account handoff/lead record/territory suggestions; backend QA pending |
| C15 | partial | incremental tests only; full ID not automated-verified at latest SHA | not verified | not accepted | not released | Customer Overview, Comments, Transactions, Mails, and demo Statements remain; Statements now use scoped invoice/payment events, but connected finance and mail records absent |
| C16 | partial | incremental tests only; full ID not automated-verified at latest SHA | not verified | not accepted | not released | Customer Locations, Documents metadata, historical assigned/originator reps, and scoped Activity tabs implemented; actual authorized file attachments/provider absent |
| C17 | partial | incremental tests only; full ID not automated-verified at latest SHA | not verified | not accepted | not released | Admin candidate review and local-demo parent association with duplicate acquisition hold; no transactional live consolidation |
| C18 | partial | incremental tests only; full ID not automated-verified at latest SHA | not verified | not accepted | not released | Local customer/store grouping preserves distinct physical location IDs; live source-of-truth migration/permissions missing |
| C19 | partial | incremental tests only; full ID not automated-verified at latest SHA | not verified | not accepted | not released | Demo association retains historical order IDs, rep credit, and original event records; live invoice/payment/attachments/reconciliation and audit migration missing |
| C20 | partial | incremental tests only; full ID not automated-verified at latest SHA | not verified | not accepted | not released | New duplicate-location/order-identity detection and payroll suppression within same billing parent; false-positive review, historical and connected pay security QA pending |
| C21 | partial | incremental tests only; full ID not automated-verified at latest SHA | not verified | not accepted | not released | Continuous per-store paid-case bar toward 40 in Accounts and CRM Incentives; historic rep credit, distinct billing parents/physical locations, no 20-case award |
| C22 | partial | incremental tests only; full ID not automated-verified at latest SHA | not verified | not accepted | not released | Account/rep/status/case/deadline sorting and filters on both Accounts and standalone CRM Incentives; full browser role acceptance missing |
| C23 | partial | incremental tests only; full ID not automated-verified at latest SHA | not verified | not accepted | not released | 10-case $25 opening and 40-case $25 sustained gates, exclude QA/cancelled/partial/unverified-paid case evidence; upstream cash reconciliation and payroll release approval missing |
| C24 | partial | incremental tests only; full ID not automated-verified at latest SHA | not verified | not accepted | not released | 2.5% Sales Rep, 0.5% eligible Sales Manager override policy and calculator preexist, combined max 3%; reconciled net-collections and consumed-payroll payout missing |
| C25 | partial | incremental tests only; full ID not automated-verified at latest SHA | not verified | not accepted | not released | New Administrator commission-only readiness review checks status/classification/signed plan/territory/credit and explicitly blocks payout; compliant production pay workflow still unbuilt |
| D01 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| D02 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| D03 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| D04 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| D05 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| D06 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| D07 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| D08 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| D09 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| D10 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| D11 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| D12 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| D13 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| D14 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| D15 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| D16 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| D17 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| D18 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| E01 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| E02 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| E03 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| E04 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| E05 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| E06 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| E07 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| E08 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| E09 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| F01 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| F02 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| F03 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| F04 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| F05 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| F06 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| F07 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| F08 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| F09 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| F10 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| F11 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| F12 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| F13 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| F14 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| G01 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| G02 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| G03 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| G04 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| G05 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| G06 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| G07 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| G08 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| G09 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |
| G10 | unreconciled | not verified at review tip | not verified | not accepted in this sprint | not released | Original acceptance criteria and historical status must be reconciled; do not mark not started |

## Seven separate CI repair IDs

| ID | Status | Proof |
|:---|:---|:---|
| FIX-CI-01 | Unreconciled | Review actual current CI failures and historical exact-SHA evidence; do not infer fixed or failing from title |
| FIX-CI-02 | Unreconciled | Review actual current CI failures and historical exact-SHA evidence; do not infer fixed or failing from title |
| FIX-CI-03 | Unreconciled | Review actual current CI failures and historical exact-SHA evidence; do not infer fixed or failing from title |
| FIX-CI-04 | Unreconciled | Review actual current CI failures and historical exact-SHA evidence; do not infer fixed or failing from title |
| FIX-CI-05 | Unreconciled | Review actual current CI failures and historical exact-SHA evidence; do not infer fixed or failing from title |
| FIX-CI-06 | Unreconciled | Review actual current CI failures and historical exact-SHA evidence; do not infer fixed or failing from title |
| FIX-CI-07 | Unreconciled | Review actual current CI failures and historical exact-SHA evidence; do not infer fixed or failing from title |

## Current implementation evidence

- C01/C03: lead pipeline, addressable lead detail, demonstration scheduling, managed reassignment and staged qualification progression with audited canonical account patch (not connected production).
- C02/C03: independently keyed Contacts register, scoped export and selection, create and edit for user-created contacts, read-only account seed contacts, canonical linked location/orders and legacy URL preservation.
- C04–C06: Deals register, stages and lifecycle edit, creation, scope/account linkage, related orders and link from lead. CRM outcome is distinct from an order, invoice, payment or earned commission.
- Source commit history is visible in PR #166. At the time this ledger was authored the preceding implementation snapshot was `8ab7de506bf8b1fe394dea02a03c067c55d5754d`; **do not label the ledger commit automated-verified before its own successful GitHub Actions run**.
- Connected production CRM write authorization, cross-role browser/staging testing and explicit owner signoff remain blocked. Existing design, payroll, order, delivery, invoice and other domain code was not accepted by these CRM changes.
