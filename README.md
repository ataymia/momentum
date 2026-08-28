# Momentum Distribution Platform

Momentum is the interactive operating-platform build for Golden Eagle's Arizona sales and distribution business. It is being developed as one connected system for CRM, field execution, orders, customer pricing, inventory, Marketing, HR, time and attendance, benefits, payroll, Finance, accounting, expenses, training, compensation, reporting and approvals.

The current tour is intentionally self-contained and uses browser-local fictional records. The production backend is planned around Firebase Authentication, Cloud Firestore and Firebase Storage. Cloudflare or GoDaddy will host the application after deployment fit is selected. Payment/banking services will be used as tokenized money-movement rails while Momentum remains the source of truth for the surrounding business workflow and reconciliation.

## Demo access

Use any role account shown on the sign-in screen with:

```text
Password: admin
```

The placeholder password exists for the product tour only. It must be replaced by real Firebase identity, MFA, session and authorization controls before live data is used.

## Current modules

- Home control tower with scoped workload, alerts, follow-ups and company/team bulletins
- My Work approval and exception queue with source-record review before decisions
- Sales & Accounts CRM with account search, stages, detail, contacts, follow-up, Partner Pricing status and sales-incentive tracking
- Schedule & Dispatch with assignment, status flow, visit closeout and next-action requirements
- Retail Execution with placement and stock observations
- Orders with draft/review/approval/fulfillment/delivery/payment states
- Supply & Inventory with lots, reservations, holds and custody controls
- Marketing with field requests, campaigns, spend approval, asset/version control and performance structure
- People & HR with employee profile, document vault, time/attendance, PTO requests, benefits architecture, learning and performance
- Payroll with configurable pay basis, source-time calculation, earned bonus inputs, gross-to-net demo calculation, pay runs and payment-release state
- Finance & Expenses with reimbursements, receipt metadata, receivables and accounting-rule architecture
- Reports with role-scoped operational metrics
- Administration with permissions, Firebase architecture, payment-rail boundaries, security requirements and demo reset

## Confirmed sales bonus logic represented in code

- The first order date starts the 90-day window.
- A first order of at least 10 cases can earn a $25 opening bonus.
- That $25 is not earned until payment on the qualifying first order clears.
- Paid orders inside the 90-day window accumulate toward 40 cumulative cases.
- Reaching 40 paid cases inside that window earns the second $25.
- Source order IDs and window dates remain attached to the calculation.

## Preferred Partner pricing represented in code

- Qualifying new accounts receive $24 per 24-can case / $1.00 per can for the first 60 days.
- Opening-order minimum: 10 cases.
- The first order starts the introductory clock.
- 20 paid cases during the first 60 days continue Partner Pricing into the next 90-day period.
- Later 90-day periods require 20 paid cases to retain Partner Pricing.
- Accounts that fall out of eligibility can re-enter after restoring the threshold.
- The regular/standard price is intentionally not hard-coded until the controlling standard price is approved.

See `docs/PLATFORM_OPERATING_BLUEPRINT.md` for the department architecture, automation spine, source-of-truth plan, native HR/payroll/accounting direction and development critical path.

## Role model

- **Administrator:** company-wide visibility and action authority across Sales, Operations, Marketing, HR, Payroll, Finance, reporting, users and settings
- **Sales Manager:** managed-team sales/field records, team approvals, team reporting and team HR review plus their own employee/finance/payroll self-service
- **Sales Representative:** responsible accounts, assigned field work, own orders, own compensation status, HR/time/payroll self-service, expenses and Marketing requests
- **Operations:** fulfillment, inventory, assigned dispatch, HR/time/payroll self-service, expenses and Marketing requests
- **Customer:** linked account and order portal only; no internal staff, compensation, inventory, HR, payroll, Finance, Marketing or reporting records

The browser demo applies these scopes to navigation, search, lists and actions. Production Firebase security rules must enforce the same access model on the backend.

## Local development

Requirements:

- Node.js 22.13+
- npm

```bash
npm ci
npm run dev
```

Quality checks:

```bash
npm run lint
npm run test:logic
npm run build
npm run build:pages
```

## GitHub Pages

Pushes to `codex/momentum-v1` run the Pages workflow. The deployment gate installs dependencies, lints source, runs workflow/business-rule tests, exports the static build, verifies the artifact, and deploys the browser-local tour.

The static tour is not the production security boundary. Do not use live employee, customer, payment, payroll, benefit or financial data until Firebase auth/rules, persistent records, Storage permissions, audit history, backups and background automation are implemented and verified.

## Production foundation

The current frontend/state layer is the seam that will be moved from browser-local demo storage to authenticated Firebase records. The intended production foundation is:

1. Firebase Authentication, MFA and role/permission enforcement
2. Cloud Firestore canonical records and immutable material audit events
3. Firebase Storage for employee documents, receipts, photos and proof files
4. Background event/automation workers for scheduled and event-triggered workflows
5. Native Momentum HR, payroll, benefits, compensation, accounting and department logic on those records
6. Tokenized external customer-payment and payroll/reimbursement money rails with settlement reconciliation back to Momentum
7. Email/SMS and other delivery connectors as needed
8. Security, backup/restore, accessibility, mobile and load hardening

All demo customers, employees, orders, inventory, payroll results and financial figures are fictional unless an explicitly approved business rule is identified in the interface or code.
