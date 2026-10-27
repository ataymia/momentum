# P0 Momentum production latency investigation, October 26, 2026

## Impact and current evidence

Incident report from Flo: 3–5 seconds from nearly every click, including moving between invoices and placing an order, apparently while cloud sync remained behind. This is a **user report**, not yet an independently instrumented live baseline. One signed-in user does not rule out client CPU/render work, Firestore request latency, or background retry loops.

### Confirmed source issues repaired in PR #87

1. Ordinary Workspace, Commercial and CRM React effects called immediate cloud flushes even though storage already journals and schedules writes. Removed duplicate immediate effect flushes. Explicit order/delivery confirmation remains.
2. Latest-first queued flush selected the newest dirty domain, allowing older unsaved orders to be starved. Now select oldest unblocked.
3. Frequent state changes reset the 350ms timer, potentially postponing cloud writes indefinitely. Earliest scheduled deadline now wins; explicit transient-error backoff remains.
4. Blocked domains could keep scheduling a retry every 200ms. The new scheduler skips blocked keys, retains their local journal/error, and proceeds with other domains.
5. A write completed after a newer local edit could discard the newer journal. Revision checks guard clearing every identified write-success/isolation path.
6. Four consecutive optimistic concurrency conflicts could exit with the key no longer dirty. Exhaustion now requeues work with bounded exponential backoff.
7. Transient Firestore 408, 429, 5xx / UNAVAILABLE / RESOURCE_EXHAUSTED / DEADLINE_EXCEEDED could trigger per-document isolation, multiplying one failed batch into many requests. Now preserve and backoff; isolate individual records only for non-transient failures.
8. CRM and location-tracking normalization can emit identical state, causing unnecessary rerender and journal writes. No-op state updates now preserve identity. Legitimate GPS session changes and route evidence remain.
9. Invoices were repeatedly recalculating balance/status for the visible register on each selected-invoice change. Memoize summary per ledger state.
10. **Second-pass conflict safety (October 27):** a Firestore conflict read could finish after a new local edit and replace the newer in-memory data. The conflict reconciliation now compares the saved revision, retains newer locally journaled edits, and requeues that domain instead of replacing the cache. Add a regression guard to the P0 test suite.

These are established from code paths. They do not prove which explains Flo's full latency.

### Source risks still requiring production measurement

- Firestore metadata polling runs every five seconds in active clients. Consider reducing idle/background reads only after quantifying the actual staleness required for dispatch/order workflows.
- `getFirestoreSnapshots` falls back to individual GETs for every document in a denied batch, which could amplify initial hydration or update reads. Confirm whether `firestore-batch-permission-fallback` occurs and how often before changing permission behavior or batching.
- The Administrator derived-notification provider lists the whole `notificationAdminEvents` collection on a one-minute clock (the existing pagination reads all pages). Capture `firestore-list-read` count/latency and only then move to bounded/cursored history if warranted.
- The provider tree mounts nearly every operational context and browser page at once. If `navigation-commit` / `invoice-switch-paint` p95 remains high with fast network timings, profile rendering before splitting bundles or changing state architecture.
- Browser `localStorage` journaling and Firestore shard diffing can be expensive at large data sizes. Use `storage-journal` and `firestore-write-build` timings; do not remove crash recovery or audit history to make charts faster.
- Firebase Authentication refresh is performed on-demand; investigate duplicate refreshes only if authorization/network timing supports it.
- Cloud database region, index fanout and write contention require Google Cloud read/write latency metrics and service configuration, not guesses.

## Opt-in measurement and signoff

Administrators: Administration -> **Performance and sync diagnostics** -> Start timing capture. Repeat 15–20 interactions on a phone and a desktop: switch between invoices, open account profile, navigate CRM/Orders, and complete one non-test order approved by the operator. Refresh timings and copy the **sanitized** report. It records operation names, generic page keys, durations and counts; no contacts, invoices, employee locations, credentials or event bodies. Capture stays off by default.

Record median, p95, sample counts and errors for navigation-commit, navigation-paint, invoice-switch-paint, firestore-single-read, firestore-batch-read, firestore-list-read, firestore-batch-permission-fallback, firestore-write-build, storage-journal and firestore-commit. Compare with Firebase Cloud Monitoring metrics separately.

**Proposed acceptance gates (not confirmed targets):**
- 20 consecutive invoice switches: median under 200ms, p95 under 500ms on Flo's device.
- Navigation clicks: p95 under 1 second on representative phone and desktop.
- No repeated >3s UI stalls during active cloud synchronization.
- A legitimate newly created order remains after hard refresh and displays identically in a separate authorized session.
- Inventory reservation, signatures, invoice creation and payment reconciliation remain correct under retry, conflict and permission failure.
- Offline, disabled, throttled, or denied cloud writes **never** show as fully synced.

These targets are a test proposal, not measured results. A customer-facing confirmation that depends on Firestore is bound by real network latency; we must never falsely claim it saved merely to reduce the spinner.

## Release and rollback

PR #87 is code only until CI passes and it is merged. The production deployment remains an explicit user-owned Firebase Hosting step. There are no planned Firestore Rules, schema or Functions changes. Record the hosting release version; if regression occurs, roll back Hosting using Firebase Console while preserving browser pending-write journals. Never clear app storage or reset live data during a latency incident.

## Decision

P0 performance stabilization takes precedence over new CRM features. Owner: engineering / Director of Operations. Next decision: after instrumented, role-specific production checks, either close the incident or isolate the largest measured latency contributor for a further patch.
