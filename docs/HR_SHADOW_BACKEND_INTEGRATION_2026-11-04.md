# HR shadow FirestoreBackend synthetic integration harness

**Date:** November 4, 2026 (Phoenix). **Queue:** 01. **Branch:** `review/hr-shadow-backend-integration-2026-11-04-0624`. **Status:** BUILT-UNVERIFIED until an exact-SHA full CI audit passes; VISUAL/STAGING QA NEEDED, NOT USER ACCEPTED, NOT RELEASED.

## Scope and evidence
- `tests/hr-shadow-backend-integration.test.ts` exercises the actual `FirestoreBackend` constructor, `prime`, `getItem`, `updateScope`, `poll`, `refreshKeys`, `setItem` and `flush` using synthetic REST snapshot readers. No Firebase credentials, project, network requests, employee information or real writes are involved.
- The injected read seam is permitted **only** when the existing disabled-by-default `hrShadowReview` flag is explicitly supplied. Normal callers continue using the unchanged real Firestore REST functions. The harness does not activate review mode in any production caller.
- Deterministic deferred responses test stale role-change reads and a stale platform-meta poll after account suspension. Additional tests cover cross-UID disposal, explicit HR read-only behavior, denied reads, and version-triggered fail-closed HCM invalidation.
- All prior operational paths, pending journals, Firestore/Storage rules, Functions and main/integration remain unchanged.

## Remaining gates
This is synthetic backend integration, **not** browser/mobile QA, emulator authorization acceptance, production Firebase verification or an authorized staging run. The existing shared legacy HR-field and actor-audit security weaknesses remain in generated rules. Historical HR records require owner-scoped inventory, transactional migration, backup/restore and old-client read compatibility before any rule cutover. Review-only HR refresh intentionally remains blocked; it does not establish a production-ready self-service workflow.

**Next unblocked action:** add a fail-closed HCM chunk-hydration concurrency regression and adapter path integration, including denied shard and epoch changes during multi-request hydration, without activating staging.
