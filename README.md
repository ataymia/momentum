# Momentum Operations

Momentum Operations is the first interactive shell for Golden Eagle's Arizona
sales and distribution operation. It connects the commercial and operational
records that would otherwise live in separate spreadsheets: accounts,
appointments, field execution, orders, placements, inventory, approvals, and
weekly timecards.

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
- Company control tower with decisions and exceptions
- Account search, stage filtering, detail view, and account creation
- Schedule and dispatch board with status changes and audited reassignment
- Retail placement checks and stock observations
- Draft orders, proposed-price snapshots, approval routing, and order status
- Lot inventory, reservations, custody, and quality holds
- Universal approval and exception queue
- Clock in/out, weekly timecard submission, manager approval, and return flow
- Record-derived operational reports and integration status
- Browser-local persistence with a one-click demo reset

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
npm run build
npm run build:pages
```

## GitHub Pages

The repository includes a Pages workflow that exports the browser-local tour
as static HTML, CSS, and JavaScript. Pushes to `codex/momentum-v1` rebuild and
publish the tour automatically. The static deployment preserves all current V1
interactions because this release stores its demo workspace in `localStorage`.

Static hosting is not the production security boundary. Real authentication,
shared records, server-side authorization, audit retention, and provider
integrations still require trusted backend services.

## Implementation notes

The application is a Vinext/React TypeScript project. The user interface reads
and writes through `WorkspaceProvider`, which currently persists a typed demo
workspace in `localStorage`. That provider is the seam to replace with
authenticated API calls later.

The production integration sequence should be:

1. Real authentication and server-enforced roles/scopes
2. Canonical D1/database schema and immutable audit events
3. R2 or approved document/evidence storage
4. Provider-hosted payments and reconciliation
5. Payroll, accounting, messaging, maps, and e-signature adapters

Do not connect live customer or employee data until access control, retention,
backup, incident response, and test coverage are approved.
