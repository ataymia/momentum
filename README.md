# Momentum Operations

Momentum Operations is the interactive shell for Golden Eagle's Arizona sales and distribution operation.
It connects the commercial and operational records that would otherwise live in separate spreadsheets:
accounts, appointments, field execution, orders, placements, inventory, approvals, marketing, HR, payroll,
accounting, and weekly timecards.

**Live:** <https://momentumdis.web.app>

## Architecture

Momentum is a Next.js 16 app exported as a fully static bundle. Every engine runs in the browser; there is
no application server. Persistence goes through one seam — `momentumStorage` in `lib/persistence.ts`:

- **Production** (any deployed host): Firebase Authentication for identity, Cloud Firestore for state.
  State is sharded into role- and owner-gated documents, written with `updateTime` preconditions, and
  reconciled with a record-level three-way merge when two employees edit the same record set.
- **Local demo** (`localhost` only): the same engines run against `localStorage` with seeded fictional
  data, so the product can be demonstrated without touching real records.

Because there is no server, **all** authorization lives in `firestore.rules`. That file is generated from
`lib/firestore-domains.ts` so the client's view of who-can-read-what and Firestore's view cannot drift.
See [docs/FIREBASE_PRODUCTION_SETUP.md](docs/FIREBASE_PRODUCTION_SETUP.md).

### Layout

| Path | Contents |
| --- | --- |
| `app/` | Next.js entry point and the twelve stylesheets that make up the design system |
| `components/` | Screens and panels, grouped by domain (`crm/`, `hcm/`, `inventory/`, …) |
| `lib/*-engine.ts` | Pure domain logic: pricing, payroll, accounting, inventory, audit, territory |
| `lib/*-context.tsx` | React providers that bind an engine to persisted state |
| `lib/firebase-*.ts` | Auth REST, Firestore REST, access records, session gate |
| `lib/firestore-domains.ts` | The storage-key → Firestore layout table. Source of truth for the rules. |
| `scripts/` | `generate-firestore-rules.ts` |
| `tests/` | Security-rules conformance suite (runs against the Firestore emulator) |

Files suffixed `-v2`/`-v3`/`-v4`/`-v5` are the current implementations; the unsuffixed module of the same
name is the stable import path that composes them.

## Local development

Requirements: Node.js 22.13 or newer, npm, and Java (for the Firestore emulator used by the rules tests).

```bash
npm ci
npm run dev          # http://localhost:3000
```

On `localhost` the runtime-mode switch in Settings unlocks demo mode. To exercise the real Firebase path
locally instead, copy the public web config:

```bash
cp .env.production .env.local
```

### Quality gates

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run test:rules   # regenerate firestore.rules, then verify them on the emulator
npm test             # all three
npm run build        # static export into out/
```

## Security model

- **No public signup.** The first Administrator is bootstrapped from a hard-coded allow-list of verified
  work e-mails in `firestore.rules`; everyone else is provisioned by an Administrator.
- **`userAccess/{uid}`** is the single authority for role, reporting line, and account state. Only an
  active Administrator may write it, and never to their own role or account state.
- **Per-user shards.** Compensation, PTO ledgers, HR audit trails, and payroll disbursements are readable
  by their owner and Administrators only — a manager sees a report's leave requests but not their pay.
- **Least privilege by default.** Any document not explicitly matched by the rules is denied, including
  unknown domain ids and unknown field names.
- `.env.production` contains only public Firebase identifiers. No service-account key or admin secret
  belongs in this repository; Momentum never uses the Firebase Admin SDK.

## Deploying

```bash
npm run build
firebase deploy --only hosting
firebase deploy --only firestore:rules,firestore:indexes
```

## Data disclaimer

Demo mode's customers, people, orders, inventory, and metrics are fictional. Proposed prices and product
facts shown there are visibly labeled and must not be treated as approved business terms.
