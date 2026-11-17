# Momentum redesign functional-parity register
Updated: 2026-11-04 | Branch: `prototype/unified-workspace-redesign-2026-11-03` | PROTOTYPE ONLY | No production deployment or authorized launch

## Core change in direction
A destination in the new navigation is not acceptance. A department feature counts as migrated only if users can perform the full authorized action, save it to the original source of truth, view the updated record after a refresh, correct errors, and print/export evidence when appropriate. Old tools remain accessible until replacement parity is verified.

## Work completed on the isolated branch
| Requirement | Implementation | Remaining acceptance |
|---|---|---|
| Administrator weekly reports | Reporting eligibility excludes Administrators. New/old Action Center removes own delinquency; weekly center is review-only. | Test seeded admin account, saved old bell notifications, manager/rep obligations |
| Single/bulk invoice printing | Commerce Invoices list and Invoice Detail reconnect original InvoicePrintCenter; print visible active, select and print, browser Save as PDF | Test approved/paid/amended/voided invoices, missing legal name, multi-page print and mobile Safari |
| Invoice exports | Visible filtered invoice register CSV with scoped accounts | Verify data scope, CSV escapes, voided filtering, totals |
| Payroll draft and review | New payroll workflow reads real approved timecards and effective HR/payroll records, builds draft, checks canonical sources, supports authorized approval, exports own/admin pay-run data | Test draft source consumption, blocked calculations, role scoping, persistence, approved/released/settled distinctions |
| Payroll processing | Existing native engine remains accessible via /people/payroll/workflow for bonus, withholding/pay group setup, source correction, release and settlement evidence | Payroll tax compliance and provider integration NOT established. Never describe this as end-to-end live payroll. |
| HR employee profiles | Admin-only employee roster, employee detail URLs, time/leave/training/documents/compensation sections, roster and record exports; legacy editor retained | Test privacy for non-admins, refresh/deep links, edits, roster accuracy; rework actual inline editing |
| Onboarding queue | Admin onboarding case view, task-level evidence/action, audit entry, CSV export; original provisioning controls retained | Confirm tasks are saved, reviewed, recoverable, and do not claim legal I-9/W-4 compliance |
| New hire | New entry and readiness summary wraps the existing real identity/provisioning wizard | Complete visual and interaction refactor of the inner wizard; live onboarding acceptance |
| Leave | Employee scoped requests and PTO balances; admin scoped history download; existing HR approval engine retained | Test action persistence, PTO ledger, insufficient balance and manager approval path |
| Other downloads | Existing Data Exchange retained; targeted finance, HR and payroll exports added | Complete legacy-to-new feature-action audit for all modules |

## Official process benchmark, not copied product code
Zoho People published onboarding flow includes new-hire identity/personal details, policies and documents, signatures, team introduction, goals and training:
https://help.zoho.com/portal/en/kb/people/administrator-guide/onboarding-service/articles/employee-onboarding-flow

Zoho Payroll US documents pay-run prerequisites and Draft > Review > Submit/Approve > Record/Deposit flow, plus separate taxes/forms:
https://www.zoho.com/us/payroll/help/employer/pay-runs/regular-payroll.html
https://www.zoho.com/us/payroll/help/employer/pay-runs/
https://www.zoho.com/us/payroll/help/employer/taxes-and-forms/

Momentum implementation must preserve approved user jobs and process structure without copying vendor proprietary code or graphics.

## Non-negotiable launch gates
1. Verify entity, employer registration, EIN, AZ and federal payroll tax accounts, employment classification, approved pay schedules, approved compensation and reporting authority.
2. Verify personnel file permissions in Firestore or linked provider, not just UI. Administrators can review all authorized HR records. Employees access only their own. No sensitive private personnel files in public exports or URLs.
3. No self-attested I-9 completion by clicking a task. USCIS official electronic signature, retention and security standards apply; verification evidence must be stored separately. See https://www.uscis.gov/i-9-central .
4. Evaluate an established US payroll provider (Zoho Payroll US, or another approved service). Internal percentage withholding estimates are NOT a validated federal/state payroll tax engine, and the internal payroll 'Released' status is NOT proof of actual ACH/check settlement, tax deposits or filed returns.
5. Approve payroll run only when source timecards, effective HR compensation, actual benefits, tax elections and employer obligations are verified. Keep draft, approval, release, settlement and correction as independent status events.
6. Do not bulk export payroll, personal employee files, payment references or tax records outside Administrator scope; log export actions before production acceptance where feasible.
7. Run automated lint, TypeScript build, tests, Firestore rules, and hands-on role-based staging tests before any merge or deployment. All writes must persist correctly, and no missing feature may be hidden behind a generic landing page.

## Next required sequence
- Finish HR and payroll full-feature parity (wizard, employee record editor, secure document retrieval, pay periods, off-cycle/termination payroll provider handoff, audit and corrections).
- Repeat export/print/action parity review across CRM, inventory, finance, marketing, delivery and customer portal.
- Verify invoice rendering and customer-facing values against approved billing source data.
- Document integrations that must be bought/integrated rather than DIY (payroll taxes, I-9 electronic signatures, ACH/card processing, e-sign).
- Sign off module by module using real test scenarios and authorized demo users before production release.

## Release authority
Mia's explicit signoff is required for merge, production deployment, external payroll/payment provider setup, changes to legal/commercial terms, actual employee actions or financial transactions.
