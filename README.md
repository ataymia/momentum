# Momentum Operations

Momentum Operations is the first interactive shell for Golden Eagle's Arizona
sales and distribution operation. It connects the commercial and operational
records that would otherwise live in separate spreadsheets: accounts,
appointments, field execution, orders, placements, inventory, approvals,
weekly timecards, and cross-functional employee workflows.

This version is intentionally self-contained. It does not connect to Firebase,
Cloudflare data services, a payment processor, payroll, accounting, email, or
SMS.

## Demo access

Use any of the role accounts shown on the sign-in screen with the password:

```text
admin
```

The placeholder password is for the product tour only. It must be replaced by
real identity, session, and server-side authorization before any live data is
used.

## What works in V1

- Role-aware sign-in tour and role switching
- Role-aware control tower with targeted company/team bulletins, schedules,
  approvals, exceptions, and follow-ups
- Account search, stage filtering, detail view, and account creation
- Schedule and dispatch board with status changes, audited reassignment, and a
  required outcome/next-action closeout before a visit can be completed
- Retail placement checks and stock observations
- Internal draft orders plus a customer reorder portal, proposed-price
  snapshots, approval routing, and order status
- Lot inventory, reservations, custody, and reasoned quality-hold disposition
- Universal approval and exception queue
- Clock in/out, meals, weekly timecard submission, manager approval, return,
  correction, and resubmission flow
- Company Hub with cross-functional coverage map, sales-rep account bonus
  signals, time-off requests, expense reimbursement requests, marketing
  material/ad-spend requests, and employee document/training architecture
- Record-derived operational reports and integration status
- Collapsible desktop navigation and a mobile drawer
- Browser-local persistence with a one-click demo reset

## Compensation automation boundary

The demo now evaluates the current two-part sales-representative account bonus:
$25 for a qualifying 10-case opening order and $25 when the account reaches 40
cumulative cases inside a 90-day window. The calculation deliberately uses
Delivered/Paid orders as a **demo proxy** because the company has not yet
formally defined the earned/payable order state or the canonical 90-day start
event. The UI labels that uncertainty instead of silently converting the proxy
into a payroll rule.

See `docs/PLATFORM_OPERATING_BLUEPRINT.md` for the full department map,
automation spine, source-of-truth boundaries, build-vs-buy position, and open
decisions.

## Role model

- **Administrator:** company-wide visibility and action authority, including
  users, settings, integrations, approvals, inventory, company/team posts, and
  cross-functional request review
- **Sales Manager:** managed-team records, team approvals, team scheduling,
  direct reports, team bulletins, and employee request review inside their
  authority
- **Sales Representative:** owned accounts, assigned field work, own orders,
  own approvals, own time records, compensation signals, and company requests
- **Operations:** assigned dispatch work, fulfillment, inventory, holds, own
  time records, and company requests, without sales-management or
  administration access
- **Customer:** only the linked account and its orders, with the ability to
  submit a reorder for review; no internal notes, staff, inventory, employee
  workflows, or reports

The browser demo applies these scopes to navigation, lists, search results, and
actions. Production must enforce the same rules again on every server request.

All customers, people, orders, inventory, metrics, and commercial outcomes are
fictional demo records. Proposed prices and product facts are visibly labeled
and must not be treated as approved business terms.

## Local development

Requirements:

- Node.js 22.13 or newer
- npm

Install and run:

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

The repository includes a Pages workflow that exports the browser-local tour
as static HTML, CSS, and JavaScript. Pushes to `codex/momentum-v1` rebuild and
publish the tour automatically. The static deployment preserves current V1
interactions because the demo workspace and new company-request metadata use
browser-local persistence.

Static hosting is not the production security boundary. Real authentication,
shared records, server-side authorization, audit retention, file storage,
background event processing, and provider integrations still require trusted
backend services.

## Implementation notes

The application is a Vinext/React TypeScript project. The user interface reads
and writes core commercial/operational records through `WorkspaceProvider`,
which currently persists a typed demo workspace in `localStorage`. The Company
Hub adds a separate browser-local request layer plus a pure bonus eligibility
engine. Those are demo seams, not production data architecture.

The production integration sequence should be:

1. Real authentication and server-enforced roles/scopes
2. Canonical database schema and immutable audit events
3. Approved document/evidence storage
4. Event/automation workers and notification routing
5. HCM/payroll/benefits integration
6. Provider-hosted payments, expense payout/accounting reconciliation, and
   order-payment reconciliation
7. Messaging, maps, e-signature, marketing and other adapters only after their
   workflows and owners are defined

Do not connect live customer or employee data until access control, retention,
backup, incident response, and test coverage are approved.
