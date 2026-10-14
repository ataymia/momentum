# Momentum: Monday October 12, 2026 release acceptance

**Status: STAGING ONLY. Do not deploy or merge PR #52 solely because CI is green.**

Basis: `main` at `e01544c` plus owner-review, inventory-protected Admin delivery override, Firestore performance improvements, approved commission backlog, and immutable creator provenance. This document distinguishes an automated test from a real authenticated production-workflow test.

## Automated acceptance

In the Codespace or clone, checkout `origin/audit/monday-integration-20261012` in a **clean** working tree. Run:

```bash
bash scripts/monday-release-preflight.sh
```

The script runs application typecheck/lint, all enumerated logic tests, Firestore Rules emulator tests, generated Rules comparison, Firebase Functions build/lint, Next build, and git-integrity checks. It **never runs firebase deploy or wrangler deploy**. Record the exact commit hash and `/tmp/momentum-monday-audit-*.log` file.

The repository's actual production rule is `docs/PRODUCTION_RELEASE_RULE.md`; also inspect `docs/DO_NOT_DEPLOY.md`.

## Mandatory human/QA role matrix

| Scope | Signed-in user | Acceptance | Current evidence |
| --- | --- | --- | --- |
| Admin delivery override | Administrator | On an approved, valid, inventory-covered TEST order: record actual delivery time, performer and reason. After refresh the canonical order is Delivered, the invoice retains its prior balance, stock movements and immutable override audit exist; no fake driver signature. Duplicate override is rejected. | Backend and regression code staged; live test not confirmed |
| Competing reservations | Administrator + Operations | Reserve cases for a second order, attempt to override the first order using those cases; must be denied without changing either order, stock, or prior reservations. | Pure/unit and atomic transaction code staged; multi-session check outstanding |
| Delivery permissions | Rep, Sales Manager, Operations, Driver, Customer | Override absent in UI **and** direct Function request with a valid unauthorized user token denied. | Role guard code staged; live negative authentication test outstanding |
| Payment | Administrator | Record cleared/partial payment using the existing invoice ledger; balance and payment history survive refresh; delivery alone does NOT mark Paid. Reversal/refund remains separate. | Existing flow; live test outstanding |
| Order lifecycle | Administrator + Sales | Approved/fulfilling, delivered/unpaid, paid/not delivered remain Active. Both delivered and settled move to Paid & Delivered. Cancelled is preserved in Hidden. All returns every record; no tab changes mutate records. | Logic suite staged; multi-role UI test outstanding |
| Order filter | Sales/Administrator | Combined customer + placed-by + designated manager (only real relationships) + placed-date range work with newest/oldest sort and Reset. | Logic suite staged; UI test outstanding |
| CRM edit security | Creator, unrelated Rep, unrelated Manager, Administrator | **BLOCKER:** Backend must reject direct unauthorized writes and creator/time/attribution alteration. Old records without verified creator UID are Administrator-only until audited. This is NOT delivered by the provenance PR. | NOT IMPLEMENTED; issue #48/#51 |
| Invoice Ledger | Administrator | At 1280px and 1440px desktop, 100% zoom, first characters of invoice/customer/order ID readable; panel fits without sidebar overlap. Tablet/mobile also check. | CSS and component staged; visual test outstanding |
| Invoice print/PDF | Administrator | Open actual invoice preview and print-to-PDF (US Letter). Invoice #, date and Order # each on one line, entire identifiers visible; customer, item lines and totals aligned. | Template modified; rendered PDF comparison outstanding |
| Commission review | Rep + Administrator | All recorded launch-era/backlogged sales appear. Cleared collected allocations less settled refunds are review evidence; pending money and invoice gross are not represented as payroll commission. Historical rep credit preserved; no payment duplicated. | Tests and UI staged; actual payroll posting NOT IMPLEMENTED |
| Clock/location and concurrent navigation | 5+ simultaneous authenticated employees | Everyone clocked in and actively navigating Orders, Inventory, CRM, Finance, Dispatch. Compare recorded p50/p95/load-to-ready and Firestore request count before/after comparable sessions. No lost submissions, duplicate queues, or subscription leaks. | Synthetic audit speed benchmark only; real before/after NOT MEASURED |
| Existing role workflows | Admin, Manager, Rep, Operations, Driver, Customer | Perform app-specific create/view/update/refresh checks under appropriate permissions; forbidden writes denied. | Live role matrix outstanding |

## Optional, LOCAL diagnostic capture in browser DevTools

In each permitted QA browser session, in DevTools **Console**:

```js
localStorage.setItem("momentum-performance-diagnostics","on");
location.reload();
```

Perform several route transitions while coworkers are using the platform. Then run:

```js
console.table(JSON.parse(localStorage.getItem("momentum-performance-timings")||"[]"));
```

The samples distinguish navigation paint, React module commit, Firestore batch reads and the metadata-poll duration/number of changed metadata paths. They are stored locally in that browser and are not transmitted to analytics. **React commit is not full data-ready latency**, and these samples do not measure network request totals or live listener counts. Inspect DevTools Network/Performance alongside a comparable active-user baseline.

For a quick operation-by-operation summary, paste this in the same QA browser's Console:

```js
const rows = JSON.parse(localStorage.getItem("momentum-performance-timings") || "[]");
const kinds = [...new Set(rows.map(x => x.operation))];
console.table(kinds.map(operation => {
  const times = rows.filter(x => x.operation === operation).map(x => x.durationMs).sort((a,b) => a-b);
  const q = p => times[Math.max(0, Math.ceil(times.length*p)-1)];
  return {operation, samples:times.length, p50ms:q(.5), p95ms:q(.95), worstMs:q(1)};
}));
```

Run the same steps in a clean staging session first, then under 5+ authenticated active employees. Collect the actual user-observed ready times with a stopwatch or browser Performance panel. Never use these page-commit samples as proof of data readiness. Disable local timing capture afterward with `localStorage.removeItem("momentum-performance-diagnostics");`; optionally clear the stored performance samples. Do not claim the reported 5–10 second lag is fixed until measured full-ready times pass.

## Money/permission release gates

1. Current legacy `domains/workspace/fields/accounts` and commercial shared patches have broader write surfaces than creator-or-admin rules. Treat as P1 security architecture work, **not merely an Edit button** (issues #48 and #51). The pure allowlist policy in `lib/account-profile-edit-policy.ts` and its negative tests are groundwork only: the original creator must be verified from a **separate server-owned immutable provenance record**. The current client-written `createdByUid` field alone is NOT trusted identity evidence, even if it matches the authenticated UID. `accountCreatorProvenance/{accountId}` is now explicitly inaccessible to all Firestore clients (including Admin), with emulator-negative tests. This is only the protected storage boundary; records are **not being minted by an authenticated server-side account-creation transaction yet**, so reps cannot qualify for profile editing from this change alone. A trusted Firebase endpoint, record-scoped source-of-truth migration, audit and emulator permission denials are mandatory before enabling this feature.
2. Commission authorization is **2.50%** of reconciled Qualifying Net Collected Sales for credited Sales Representatives since launch; manager **0.50%** only when officially designated at earning time. When the seat is vacant, the 0.50% is retained by Momentum. A read-only earnings review does not equal payroll posting.
3. Outstanding discounts, tax, freight, returns, rebates, refunds, reconciliation, past payouts and credit reversals must be handled before percentage commission is payable.
4. Cloudflare build checks must be separately reviewed. GitHub CI passing does not prove Cloudflare successfully deployed anything.
5. Require release-owner (Flo) approval under `docs/PRODUCTION_RELEASE_RULE.md` **only after** the manual tests and production guardrail audit. No credentials, deployment or customer-impacting writes are part of this checklist.

## Evidence to capture at the office

For each smoke test, record: tester role, exact branch commit, test record ID, pre-state, attempted action, post-refresh Firestore-backed result, expected vs observed behavior, screenshot/PDF when visual, console/network errors, and whether blocked. For performance, capture active session count and comparable navigation-to-data-ready timings. Capture synthetic CI numbers separately.

**Release decision:** Blocked until secure CRM editing, real performance measurements, visual invoice acceptance, role-based verification, and owner approval.

## Cloudflare check update

The user reported the Cloudflare build green after clearing a corrupted dependency/build cache. GitHub returned a green Workers Builds check for integrated PR #52 commit `cc19d3e` on October 12. Confirm the exact SHA and branch of any subsequent green Cloudflare check in the dashboard. A green Cloudflare build is **not** evidence that PR #52 has been deployed or that Firebase rules/functions are published.
