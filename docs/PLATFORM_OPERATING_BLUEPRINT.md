# Momentum Distribution Platform Operating Blueprint

## Purpose

Momentum should become the operating layer that connects sales, field execution, orders, inventory, employee workflows, marketing requests, expenses, training, documents, compensation evidence, reporting, and management approvals without turning the platform into a homemade payroll processor or benefits administrator.

The design principle is simple: records should create the next piece of work automatically. People should not have to remember that a paid order might trigger a bonus review, that an expense needs reimbursement, that approved time off changes staffing capacity, or that a new employee needs a specific document and training package.

## Confirmed commercial rule now represented in the demo

The current owner clarification defines a two-part sales-representative account bonus:

1. $25 when the opening order is at least 10 cases.
2. $25 when the account reaches 40 cumulative cases within a 90-day account-health window.

The platform now contains a pure eligibility engine that tracks those thresholds from source order records.

### Important unresolved rule

The business has not yet formally defined which order state makes each bonus earned. The current demo uses Delivered/Paid orders as a conservative calculation proxy. That proxy is deliberately labeled in the interface and must not become a payroll instruction until the business defines whether Ordered, Approved, Delivered, Paid, Net Collected, or another state controls the bonus.

The 90-day start event also needs formal definition. The demo currently proxies the start from the first completed order date because a separate account-established event does not yet exist.

## System architecture

### Momentum should own

- CRM accounts, contacts, ownership, notes, stages, follow-ups, activities, sales opportunities and retailer execution
- Order requests, approval history, fulfillment status and customer order visibility
- Inventory lots, reservations, movements, holds, shrink/exception records and location custody
- Field schedule, dispatch, visit closeout, placement checks and next actions
- Compensation evidence, rule evaluation, eligibility signals, exceptions and approval history
- Expense and reimbursement requests, receipt metadata, business purpose, approval routing and payout/reconciliation status
- Marketing material requests, sample/event requests, partnership requests, campaign requests and ad-spend authorization
- Employee-facing document index, training assignments, acknowledgments and role-specific required materials
- Cross-functional task routing, notification rules, escalation, ownership and audit history
- KPI definitions, event-level source data, metric ownership and drill-down evidence
- Customer portal functions that are operationally specific to Momentum

### A specialist HCM/payroll provider should own

- Gross-to-net payroll calculation
- Payroll tax calculation, filing and year-end forms
- Direct-deposit instructions and payroll disbursement
- Employee tax withholding forms and sensitive payroll elections
- Benefit enrollment and carrier-facing benefit administration
- Statutory payroll records that must remain in the payroll/HCM system of record
- Regulated leave/payroll calculations that depend on provider configuration

Momentum may surface these functions through integrations and deep links, but it should not create a second conflicting payroll or benefits truth.

## Why this boundary matters

A connected employee experience is valuable. Rebuilding regulated payroll and benefits logic is not. The platform should feel cohesive while each specialist system remains authoritative for the data it is designed to own.

Example: a manager can approve time off in Momentum. Once an HCM/payroll provider is selected, the approved request should sync to that provider, the provider remains authoritative for the official PTO balance/payroll treatment, and the sync result should reconcile back into Momentum.

## Event and automation spine

Every important workflow should follow the same sequence:

1. A source record changes.
2. A rule evaluates the source facts.
3. The platform determines the next owner and deadline.
4. A task/notification is created.
5. The owner reviews the linked source record.
6. The decision creates downstream work.
7. The full transition remains auditable.

Examples:

### Sales bonus

Order state changes -> bonus evaluator recomputes account milestones -> eligibility signal is created -> sales manager/compensation owner receives review work -> approved earning is exported to payroll -> payroll result reconciles back.

### Time off

Employee submits request -> manager receives review -> staffing/schedule impact is shown -> manager approves/returns -> approved request syncs to HCM/payroll -> official balance is returned -> employee receives final status.

### Expense reimbursement

Employee submits amount + business purpose + receipt -> direct manager validates business purpose -> finance/admin validates policy and coding -> approved reimbursement is sent to the selected payment/payroll/accounting rail -> payment status reconciles -> expense is closed.

### Marketing material request

Sales/operations submits material need -> marketing owner receives task -> required asset/version/quantity/date/account are validated -> fulfillment is recorded -> requester is notified -> material usage can later be tied to the account/campaign outcome.

### Ad spend

Requester proposes campaign, audience, amount, dates and success measure -> marketing validates campaign -> budget owner approves spend -> spend is activated only through an authorized advertising account -> actual spend/results reconcile -> campaign closes with outcome evidence.

## Department coverage

### Sales

Required capabilities:

- Account creation and duplicate checks
- Contacts and decision-maker roles
- Activity logging: call, email, visit, sample, note, follow-up
- Next action + due date
- Pipeline stage and account health
- Opportunity/order linkage
- Pricing basis and approval
- Placement and reorder history
- Account ownership changes with history
- Sales-rep bonus and commission evidence
- Manager scorecard drill-down
- Lost/at-risk reason tracking
- Search and portfolio filters

### Operations

Required capabilities:

- Inventory lot register
- Receipts into inventory
- Lot/location/custody movement ledger
- Holds and reasoned release decisions
- Pick/allocation/delivery workflow
- Delivery exceptions and proof
- Returns/damages/shrink
- Office/warehouse supply inventory if the company chooses to track consumables in the same system
- Vendor/service records when purchasing workflow is defined
- Expense/receipt submissions

### Marketing

Required capabilities:

- Material request intake
- Asset library and approved-version control
- Inventory of physical marketing materials
- Sample/event material requests
- Campaign records
- Ad-spend request, budget, approval and actual spend
- Partnerships/sponsorship requests
- Leads generated / accounts influenced
- Retail activation linkage
- Campaign outcome and sell-through/reorder connection where evidence exists

### People / HR operations

Required capabilities:

- Employee profile and reporting manager
- Employment agreement access
- Compensation-plan access
- Benefits-document access
- Policy/handbook access
- Role training assignments
- Required acknowledgment tracking
- Time clock, meals and timecards
- Corrections with original events preserved
- Time-off request and approval workflow
- PTO/sick-time balance through the selected HCM integration
- Onboarding/offboarding checklists
- Company-property assignments when defined

### Finance / administrative control

Required capabilities:

- Expense review and reimbursement status
- Sales compensation review/export/reconciliation
- Order/invoice/payment reconciliation
- Marketing spend approvals and budget visibility
- Vendor/purchase authorization when defined
- Cash-flow reporting only from authoritative transaction/accounting sources
- Exception queue and audit evidence

## KPI architecture

No dashboard number should exist without a metric definition. Each KPI needs:

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

Examples of metrics that can eventually be supported once rules/data are defined:

- Net collected sales
- New paid opening accounts
- 40-case/90-day healthy-account attainment
- Reorder rate
- Cases per active account
- Placement compliance
- Stockout rate
- Inventory availability
- Inventory shrink/expiration
- Order cycle time
- Delivery exception rate
- Expense approval cycle time
- Marketing spend vs approved budget
- Qualified demand tied to marketing programs
- Training completion by role
- Timecard exception rate
- PTO request response time

## Required source-of-truth register

Before production, each record type needs one authoritative owner/system:

| Record | Proposed system of record | Production dependency |
| --- | --- | --- |
| Employee identity / employment status | HCM or Momentum identity service with HCM sync | Provider decision |
| Payroll / tax / direct deposit | HCM/payroll provider | Provider decision |
| Benefit elections | HCM/benefit administrator | Benefit/provider decision |
| Accounts / sales activity | Momentum | Database/auth |
| Orders / fulfillment | Momentum | Database/invoicing integration |
| Inventory | Momentum | Database + operational SOP |
| Compensation eligibility evidence | Momentum | Final compensation rules |
| Paid compensation result | Payroll provider | Payroll integration |
| Expenses | Momentum request + accounting/payment system | Expense policy + payout rail |
| Marketing approvals | Momentum | Marketing owner + budgets |
| Employee documents | Secure object storage + Momentum index | Final documents + file storage |
| Training | Momentum or LMS integration | Build-vs-buy decision |

## Decisions that must not be guessed

- Exact legal employer/entity and who employs each role
- Manager/reporting hierarchy and backup approvers
- When a sales bonus is legally earned and when it is payable
- Definition of the 90-day account start event
- Commission basis, exclusions, reversals and termination treatment
- PTO amount, accrual/front-load method, carryover and HCM configuration
- Benefits eligibility, waiting period, contributions and plan terms
- Expense policy, spending limits, categories and finance owner
- Marketing department owner, approval limits and campaign budgets
- Inventory movement reasons, warehouses/locations and physical count cadence
- Customer credit/payment terms
- Document retention rules
- Which training is mandatory by role

## Build-vs-buy position

### Build inside Momentum

Operational workflows that are unique to Golden Eagle/Momentum and need to connect directly to sales, customers, inventory, orders and local execution.

### Integrate

Payroll, tax filing, benefit enrollment, regulated payroll disbursement, carrier administration, payment processing and other mature specialist functions where duplicating the provider would create compliance/security risk.

### Decide later

Learning-management depth, full accounting/ERP, advanced marketing automation and procurement. Start with workflow visibility and evidence, then buy/integrate when the process volume justifies it.

## Current implementation status

The Company Hub added to V1 now provides:

- A visible system-coverage map
- Sales-representative account bonus milestone tracking
- A clearly labeled unresolved counting-basis control
- Time-off request intake and manager/admin demo approval
- Expense reimbursement intake with receipt-file selection metadata
- Marketing-material request intake
- Ad-spend request intake
- Employee document/training architecture
- Cross-functional routing rules and unresolved-owner warnings

The request workflows use browser-local demo persistence. They are not a substitute for production database, file storage, audit log, server authorization, event workers or HCM/accounting integrations.

## Production critical path

1. Confirm legal employer, authority and reporting hierarchy.
2. Define final compensation earned/payable rules and PTO/benefit terms.
3. Select HCM/payroll/benefits provider or integration direction.
4. Define expense and marketing approval owners/limits.
5. Finish inventory movement SOP and source fields.
6. Implement persistent database, server authorization, audit log and file storage.
7. Implement event/automation service and notification delivery.
8. Integrate HCM/payroll, accounting/payment and messaging providers.
9. Build dashboards only from defined metrics and verified source data.
