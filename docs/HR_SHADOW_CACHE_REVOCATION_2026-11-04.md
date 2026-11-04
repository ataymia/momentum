# HR shadow-cache revocation and session transition (review only)

**Date:** November 4, 2026, Phoenix. **Queue:** 01. **Status:** BUILT-UNVERIFIED pending exact-SHA CI. **No runtime wiring, rules deployment, migration, or production access.**

## Source-backed risk
The current Firestore backend in `lib/persistence.ts` retains `this.docs` across `updateScope()`, and only fetches newly readable paths. Its `refreshKeys()` and `poll()` also consider previously cached paths. `assembleState()` includes whatever HCM documents remain in the map, not just the current role's authorized set. Therefore a downgrade, reassignment, denied refresh, or user/session transition requires explicit cache and assembled-state invalidation. The existing `attachFirestorePersistence()` generation check protects late backend installation but does not, by itself, establish per-request authorization after a scope change.

## New review-only acceptance model
- `lib/hr-shadow-cache-revocation.ts`: computes safe retain/evict/refetch paths from old and new role/record scope, marks assembled HCM cache invalidation, quarantines pending HR journals during authority change, and rejects late or overbroad fetch responses by epoch, UID and current allowlist.
- `tests/hr-shadow-cache-revocation.test.ts`: synthetic other-employee cache proof, Administrator downgrade, manager reassignment, cross-UID login, suspension/separation/customer, unchanged-role stale shards, denied reads, pending journals and in-flight stale responses. The test uses the real `assembleState()` function and synthetic values.
- This code is **not connected** to `FirestoreBackend`. Passing tests prove only the candidate policy, not current live behavior or a completed security fix.

## Required before a runtime change
1. On role/session change, advance a monotonic epoch **before** starting a new read; stop old polling/refreshes and reject their responses, not just backend installation.
2. Remove unauthorized raw docs and assembled HCM state atomically, emit a storage-key invalidation, and keep the HR UI blank until the new scope is freshly primed.
3. Quarantine, do not flush, any pending HCM journal whose writer lost authorization; reconcile under a privileged, audited staging process. No automatic loss of historical records.
4. On permission denial, invalidate sensitive HCM data rather than leaving last-known data visible. Never interpret a missing shard as proof of completed legacy migration.
5. Prove browser tab, Back/Forward, session switch, manager reassignment, separated account, failed refresh, concurrent poll and offline recovery in authorized staging. Verify legacy backfill, restore and shadow-rule compatibility first.

**Unresolved:** current generated Firestore rules retain the known shared-field confidentiality weaknesses; the stricter policy is emulator-only. Mia must authorize staging and any later migration/rule deployment. No legal, payroll, financial or KPI outcome is established.

**Next unblocked action:** implement and test a safe runtime HCM scope-epoch/cache invalidation adapter on a separate review child, preserving unsaved journals and existing non-HR domains.
