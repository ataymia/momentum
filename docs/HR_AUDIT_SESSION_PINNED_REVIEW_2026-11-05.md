# HR session-bound pinned audit reader (REVIEW ONLY)

November 5, 2026, 10:16 Phoenix. Queue 01. Child of draft PR #147, pinned parent SHA `8113ba5bbd6b71ea2ed730e78fcc81af434c19ff`.

## Implementation and authorization
`lib/hr-audit-session-pinned-review.ts` composes the existing read-only pinned cross-domain audit reader with the existing real Admin Auth reviewer/session gate. Its factory defaults to disabled, refuses any non-loopback Firebase Auth or Firestore emulator, rejects mismatched asserted reviewer/actor inventory, and never exposes a route or write method. It clones the asserted inventory to avoid asynchronous caller mutation.

The reviewer gate checks Firebase Admin Auth `verifyIdToken(token, true)` (including revocation) and server-owned role/authority/session documents before and after the pinned read. Each gate independently checks token revocation twice, and the pinned reader reads all declared historical documents inside one read-only Firestore transaction. A session, permission, or Auth account revocation while the read runs must cause the final result to quarantine. A positive result remains `versions-matched-unattested`, **not** independently authenticated provenance, complete historical inventory, retention compliance, or permission to migrate/replay/append. The verifier is injected and must be a trusted server-side Admin Auth method, never browser-supplied. There is no globally atomic Firebase Auth + Firestore snapshot; revocation after the final check remains a possible TOCTOU window, and any future write executor must independently reauthorize within its write transaction.

## Verification
`functions/tests/hr-audit-session-pinned-emulator.test.mjs` adds 11 synthetic Firebase Admin Auth/Firestore integration tests: default-off, real valid reviewer, forged token, non-Admin role, session revocation during pinned read, permission revocation during read, Auth disable during read, missing receipt without repair, actor mismatch, browser read denial, and sanitized failure output. Registered in the mandatory serial `test:hr-admin-emulator` script. Exact final SHA and CI must be recorded after GitHub Actions actually completes. No browser/role staging acceptance has occurred.

## Non-claims and release gates
No production employee records, Firebase rules, user roles, real payroll, finance, inventory, email, GPS, contracts, migration, staging mutation flags, main or integration branches, merge, or deployment were changed. Independent historical provenance, inventory, verified backup restoration, legacy confidentiality repair, approved reviewer/retention policies, older-client compatibility, and authorized staging remain blocked externally. Platform engineering owns implementation, HR/security reviewer owns policy/provenance/restore, and Mia separately owns staging/release approval. No deadline or measured KPI/financial outcome.

**Next single unblocked increment:** add a fail-closed synthetic regression for an actor-specific permission grant so an Administrator authorized for one audit actor cannot review another actor merely by changing the asserted inventory.
