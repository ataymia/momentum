# HR server-only transport factory: synthetic review evidence

**Date:** November 4, 2026 (Phoenix). **Queue:** 01 Human Resources. **Branch:** `review/hr-server-transport-factory-2026-11-04-1824`. **Release:** review-only, disabled by default; no endpoint, SDK initialization, deployment, or production data.

## Implemented

`lib/hr-canonical-server-transport-review.ts` adds a Firebase Admin Firestore-shaped *injected interface* for the existing canonical HR read and trusted identity contracts. The factory does not import Firebase Admin or construct a service account. It only constructs a read-only transport after explicit opt-in, a matching synthetic review project ID, and a loopback emulator host. It does not enable live use.

The transport binds actor access, directory, and session reads to the UID passed from the existing trusted identity boundary after `verifyIdToken(token, true)`. Target ownership comes from the validated command, not token role claims. Canonical HR paths are computed with the existing allowlist. An attempted arbitrary path throws before reading it. Authority is read inside the read-only transaction and again after the snapshot. The existing pinned adapter then checks revision and post-transaction authorization; the trusted identity wrapper re-verifies token revocation and authority before returning a whitelisted projection.

The review-only storage names `hrCanonicalReadAuthorityReview`, `hrCanonicalReadSessionReview`, and `hrCanonicalReview` are **not approved production schemas**. The `userAccess` read in these tests is synthetic. No current legacy HCM or audit permissions are changed.

## Mandatory security regressions

`tests/hr-canonical-server-transport-review.test.ts` uses synthetic, in-memory Firebase Admin-shaped objects and a fake verifier to exercise: disabled zero-I/O; remote host, malformed field and project mismatch rejection; employee self-service; manager direct-report scope; Administrator compensation projection; Marketing/customer and confidential-field denial before canonical reads; forged actor UID and session rejection; arbitrary canonical path rejection; read-only transaction option; post-transaction session revocation and manager reassignment; invalid version fail-closed; and absence of any write or HTTP interface.

These are **contract tests**, not actual Admin SDK credential, cryptographic verification, Firestore emulator contention, or production-rule tests. The earlier synthetic Firestore emulator composition tests remain mandatory separately. A loopback-host string alone cannot prove a runtime is safe. Do not connect this factory to a callable function or real project.

## Acceptance and release blockers

- Implement a genuine trusted server integration only after separately approved non-production environment, authenticated role fixtures, source-backed schema, deployed deny-by-default rules and review of runtime project/credential binding.
- Remediate legacy shared-HCM and actor-audit confidentiality exposures; reconcile old clients and caches before cutover.
- Inventory historical records, verify migrations and independently test backup/restore and retention; avoid real data during autonomous review.
- Complete HR/security, staging browser/mobile/role and concurrency acceptance, then obtain Mia's separate release signoff.

**Owners:** Platform engineering for safe integration; HR/security reviewer for privacy and restoration; Mia for staging and release approvals. **Deadline:** not approved. **KPI/financial impact:** none measured or transacted.

**Next unblocked action:** Add an actual Firebase Admin SDK *emulator-only* adapter integration regression using a dedicated synthetic Firebase project, verifying transaction reads and rejection of non-emulator configuration without creating an endpoint. Do not infer this is a production handler.

**Verification:** exact final SHA and complete GitHub Actions conclusion must be recorded in the master queue after observation. Nothing here is User Accepted or Released.
