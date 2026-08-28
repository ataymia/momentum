# Momentum Distribution Platform Operating Blueprint

## Purpose

Momentum is being built as the operating system for the Golden Eagle Arizona business. The platform should connect Sales, field execution, orders, customer pricing, inventory, Marketing, HR, time and attendance, benefits, payroll, Finance, accounting, expenses, training, documents, compensation, reporting, approvals, and management controls inside one coherent product.

This project is build-first. Other business platforms are benchmarks for useful workflow patterns, not purchase recommendations or systems of record. Momentum should own the business logic, user experience, records, audit history, calculations, and automation rules. Firebase is the planned production foundation for identity, permissions, records, and file storage. Outside processors or banks may move money, but they do not replace Momentum's payroll, accounting, order, or reimbursement records.

The core design principle is simple: source records create the next work automatically. People should not have to remember that a paid order earned a bonus, that an account crossed a pricing threshold, that an expense needs reimbursement, that approved time off affects payroll and staffing, or that a new employee needs documents and training.

## Confirmed sales-representative account bonus rule

The current owner clarification is represented as follows:

1. The first order date starts a 90-day account window.
2. If that first order is at least 10 cases, it creates an opening-bonus eligibility event.
3. The $25 opening bonus becomes earned only after payment on that qualifying first order clears.
4. Paid orders inside the same 90-day window accumulate toward the sustained-account milestone.
5. When cumulative paid volume reaches 40 cases inside the 90-day window, the second $25 becomes earned.
6. A first order below 10 cases does not earn the opening-order bonus.
7. An unpaid order does not produce earned compensation.

The system preserves the source order IDs, first-order date, window end, observed paid cases, threshold, amount, and status so every compensation result is auditable.

## Preferred Partner pricing rule

The current build uses the following account-pricing logic:

1. A qualifying new account receives Partner Pricing of $24 per 24-can case, or $1.00 per can, during its first 60 days.
2. The qualifying opening-order minimum is 10 cases.
3. The first order date starts the 60-day introductory clock.
4. The account must reach 20 paid cases during the first 60 days to continue Partner Pricing into the next 90-day period.
5. After the introductory period, Partner Pricing is evaluated in rolling 90-day periods.
6. A qualifying period requires 20 paid cases.
7. If the threshold is missed, Partner Pricing becomes inactive and the account returns to standard pricing.
8. If the account later reaches the required 20-case threshold again, it can re-enter Partner Pricing for a new 90-day eligibility period.
9. The regular/standard price is not hard-coded until the company approves the controlling standard price.

The interface must show the first-order date, current pricing status, current measurement window, paid cases counted, threshold, next review date, and the source orders used in the calculation.

## System architecture

### Momentum owns

- Authentication experience, roles, permissions and user lifecycle
- CRM accounts, contacts, ownership, notes, stages, follow-ups, activities and opportunities
- Partner-pricing eligibility and price-history records
- Order intake, approval, invoice state, payment state, fulfillment, delivery and customer visibility
- Inventory lots, receipts, reservations, movements, custody, counts, holds, returns, damages, samples, shrink and reconciliation
- Field schedule, dispatch, visits, closeout, placements, samples and next actions
- Marketing requests, campaign plans, budgets, approvals, actual spend, asset control, partnerships and performance evidence
- Employee profiles, reporting relationships, employment records, document vaults, acknowledgments and company-property records
- Time clock, meal events, timecard corrections, attestation and manager review
- PTO/time-off rules, balances, requests, approvals, leave history and staffing impact
- Benefit plan setup, eligibility, enrollment, life events, dependents, employee/employer contribution calculations and payroll deductions
- Recruiting, onboarding, offboarding, training, skills, goals, reviews and performance records
- Payroll configuration, earnings calculations, bonuses/commissions, deductions, withholding logic, pay runs, statements, payment instructions and reconciliation
- Finance workflows, reimbursement, receivables, payables, budgets, purchasing controls and accounting records
- Chart of accounts, effective-dated accounting rules, journal generation, reconciliation and exports
- Compensation rules, evidence, earning events, approvals, reversals, disputes and employee statements
- Cross-functional task routing, notifications, escalations, approvals and immutable material history
- KPI definitions, calculations, drill-down evidence and reporting
- Customer self-service functions

### External infrastructure may provide a rail, not the business brain

- Firebase Authentication for identity and MFA
- Cloud Firestore for production records and event data
- Firebase Storage for documents, receipts, photos and evidence
- Cloudflare or GoDaddy for hosting after deployment fit is selected
- A tokenized payment processor or bank connection for customer payments and payroll/reimbursement disbursement
- Email/SMS delivery services for outbound communications

Momentum remains authoritative for the business workflow and reconciliation surrounding those rails.

## Event and automation spine

Every material process should follow the same sequence:

1. A source record changes.
2. An effective-dated rule evaluates the facts.
3. The platform determines the next owner, deadline and required evidence.
4. A task, alert or approval is created automatically.
5. The owner reviews the linked source record.
6. The decision creates downstream records or work.
7. The outcome reconciles back to the original record.
8. The full transition remains auditable.

Examples:

### Sales bonus

First order is created -> 90-day clock starts -> payment clears -> opening threshold is evaluated -> $25 earning is created if the first order was at least 10 cases -> paid-case total keeps updating -> 40 paid cases inside 90 days creates the second $25 earning -> payroll includes the approved earning -> payment result reconciles back.

### Partner pricing

First qualifying order is created -> 60-day introductory Partner Pricing starts -> paid cases accumulate -> Day 60 continuation rule evaluates -> qualifying account enters next 90-day Partner window -> paid cases continue accumulating -> each window renews, lapses, or re-enters based on source orders.

### Time off

Employee submits request -> reporting manager receives review work -> approved leave updates the employee leave record and staffing calendar -> balance and payroll implications recalculate -> employee receives final status -> original request and decision remain preserved.

### Expense reimbursement

Employee submits amount + business purpose + receipt -> manager validates business purpose -> Finance validates policy/coding -> approved reimbursement becomes payable -> Momentum sends a payment instruction to the selected money rail -> settlement reconciles -> accounting entry and reimbursement record close together.

### Marketing material request

Sales/Operations submits material need -> Marketing receives task -> asset/version/quantity/date/account are validated -> physical or digital fulfillment is recorded -> requester is notified -> material use stays attributable to an account, event or campaign.

### Ad spend

Campaign is proposed with audience, amount, dates and success measure -> budget approval occurs -> authorized campaign becomes active -> actual spend is reconciled -> commercial outcomes link to the campaign where evidence exists -> campaign closes with results and variance.

## Department coverage

### Sales & Accounts

Required capabilities:

- Account creation and duplicate checks
- Multiple contacts and decision-maker roles
- Activity logging: call, email, visit, sample, note and follow-up
- Next action + due date
- Pipeline stage and account health
- Opportunity/order linkage
- Pricing eligibility and price history
- Placement and reorder history
- Originator, current responsibility, account manager and closer attribution
- Transfer history and acceptance
- Sales-rep bonus, commission and manager-override evidence
- Lost/at-risk reasons
- Search, territory and portfolio filters
- Manager scorecard drill-down

### Operations & Supply

Required capabilities:

- Product/SKU and pack configuration
- Inventory receiving
- Lot/location/custody movement ledger
- Reservations and allocations
- Pick, verify, load, dispatch and proof-of-delivery flow
- Holds and controlled release decisions
- Returns, credits, damages, samples, shrink and expiration
- Physical counts and variance investigation
- Warehouse/office supplies if tracked
- Vendor and purchasing records

### Marketing

Required capabilities:

- Marketing-material request intake
- Approved asset library and version control
- Physical collateral inventory
- Sample/event requests
- Campaign records and calendars
- Ad-spend request, budget, approval and actual spend
- Partnerships/sponsorships
- Creator/PR/community opportunities
- Leads generated / accounts influenced
- Retail activation linkage
- Campaign outcome tied to paid sales/reorders where evidence exists

### People & HR

Required capabilities:

- Employee profile and manager hierarchy
- Employment agreement and compensation-plan access
- Benefits documents and enrollment records
- Policy/handbook access and acknowledgments
- Time clock, meals, corrections and timecards
- Time-off/PTO request, balance and approval workflow
- Onboarding/offboarding checklists
- Training assignments and completion evidence
- Recruiting-to-employee handoff
- Goals, reviews, feedback and development plans
- Skills/certifications where relevant
- Company-property assignments

### Payroll

Required capabilities:

- Employee pay configuration and effective dates
- Hourly, salary and other earning types
- Overtime rules where applicable
- Commission and bonus earnings from source records
- Reimbursements where paid through payroll
- Tax/withholding configuration
- Pretax/post-tax deductions
- Benefit deduction handoff
- Employer payroll costs/liabilities
- Draft, review, approval and release pay runs
- Employee pay statements
- Reversals/corrections
- Payment instructions and settlement reconciliation
- Payroll registers, tax liabilities and filing/export records

### Finance & Accounting

Required capabilities:

- Expense review and reimbursement status
- Customer receivables and payment reconciliation
- Vendor/purchase workflow and payables
- Marketing spend approvals and budgets
- Payroll accounting
- Inventory accounting and COGS rules once valuation method is defined
- Chart of accounts
- Source-event-to-journal rules
- Balanced journal records
- Credits/refunds/write-offs
- Bank/payment reconciliation
- Financial statements and management reports
- Downloadable accounting exports and later integrations without surrendering the source records

## KPI architecture

No dashboard number should exist without a metric definition. Every KPI requires:

- Name
- Business question
- Formula
- Numerator and denominator
- Inclusion/exclusion rules
- Source records
- Timestamp/date basis
- Update frequency
- Owner
- Audit method
- Intended behavior
- Gaming risk
- Action triggered

Examples once their exact business definitions are approved:

- Paid sales / net collected revenue
- New paid opening accounts
- 10-case opening-bonus attainment
- 40-paid-case / 90-day sustained-account attainment
- Partner-pricing continuation rate
- Reorder rate
- Cases per active account
- Placement compliance
- Stockout rate
- Inventory availability and variance
- Shrink/expiration
- Order cycle time
- Delivery exception rate
- Expense approval cycle time
- Marketing spend vs approved budget
- Qualified demand tied to Marketing
- Training completion
- Timecard exception rate
- PTO request response time
- Payroll exception rate

## Source-of-truth register

| Record | Planned system of record | Production dependency |
| --- | --- | --- |
| Employee identity / employment status | Momentum on Firebase | Auth + HR schema |
| Payroll calculations / pay history | Momentum on Firebase | Payroll rules + secure access |
| Benefits eligibility / enrollment | Momentum on Firebase | Final plan terms + HR schema |
| Accounts / sales activity | Momentum on Firebase | CRM schema |
| Partner pricing | Momentum pricing engine | Approved program rules + order/payment data |
| Orders / fulfillment | Momentum on Firebase | Order/inventory schema |
| Inventory | Momentum on Firebase | Inventory SOP + movement engine |
| Compensation earnings | Momentum compensation engine | Final effective-dated plans |
| Expenses | Momentum on Firebase | Expense policy + payment rail |
| Marketing | Momentum on Firebase | Marketing authority + budget rules |
| Employee documents | Firebase Storage + Momentum index | Final documents + security rules |
| Training / performance | Momentum on Firebase | Role requirements + HR rules |
| Accounting records | Momentum on Firebase | Chart of accounts + accounting rules |
| Customer/payroll money movement | External tokenized processor/bank rail with Momentum reconciliation | Provider selection |

## Decisions that must not be guessed

- Exact legal employer/entity and who employs each role
- Final manager hierarchy and backup approvers
- Commission basis, exclusions, reversals and termination treatment
- PTO bank amount, accrual/front-load method, carryover and protected-use rules
- Benefits eligibility, waiting periods, contribution rules and plan terms
- Tax and payroll configuration required for each employee/jurisdiction
- Expense limits/categories and approval authority
- Marketing department owner, approval limits and budgets
- Inventory valuation method and accounting treatment
- Customer standard price and any Preferred/other price tiers outside the confirmed $24 Partner price
- Credit-line and payment-term rules
- Document retention rules
- Mandatory training by role

## Current implementation status

The browser demo now places functions in their operating departments instead of a generic Company Hub:

- Sales & Accounts: CRM, Partner Pricing tracker, paid-order bonus milestone tracker
- Marketing: requests, campaigns, budgets, spend approvals, asset/version library and KPI controls
- People & HR: employee profile, document vault, time/attendance, time off, benefits architecture, learning and performance
- Payroll: employee pay setup, gross-to-net demo calculation, paid bonus earnings, pay runs, approval and payment-release state
- Finance & Expenses: reimbursement workflow, receipt metadata, receivables and accounting-rule architecture
- Operations: orders, fulfillment and inventory controls

The demo still uses browser-local persistence. Production requires Firebase authentication, records, security rules, Storage, audit/event processing, backups and background workers before live employee/customer/financial data is used.

## Development critical path

1. Finish canonical CRM contacts, ownership, opportunities and account-history model.
2. Connect the Preferred Partner pricing engine to order quoting/approval so the current eligible price is enforced automatically.
3. Finish order-to-cash, invoice/payment/credit/refund and reconciliation workflows.
4. Finish transaction-based inventory movements, custody, physical counts and inventory accounting.
5. Finish People & HR data model: employee lifecycle, PTO balance engine, benefits enrollment, onboarding/offboarding and performance.
6. Complete payroll calculation rules, tax tables/configuration, earning codes, deductions, liabilities, statements and correction logic.
7. Complete compensation plans and automatic earning/reversal/dispute workflow.
8. Complete Finance/accounting: chart of accounts, journals, payables, purchasing, inventory accounting and financial statements.
9. Complete Marketing asset inventory, campaign attribution and outcome reporting.
10. Move browser-local records to Firebase with server-enforced permissions, audit events, Storage and background automation workers.
11. Connect payment/banking rails and reconcile every external settlement to Momentum records.
12. Harden accessibility, mobile use, security, backup/restore, load behavior and cross-role workflow tests.
