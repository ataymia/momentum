# HR shadow FirestoreBackend synthetic integration harness

**Date:** November 4, 2026 (Phoenix). **Queue:** 01. **Branch:** `review/hr-shadow-backend-integration-2026-11-04-0624`. **Status:** BUILT and AUTOMATED-VERIFIED at code/test SHA `0ee594eace2bbe34a67cc40ffb181266b28c0a7a`, full push audit https://github.com/ataymia/momentum/actions/runs/41838832408 PASS and PR audit https://github.com/ataymia/momentum/actions/runs/41838840462 PASS; this documentation commit awaits its own exact-SHA check; VISUAL/STAGING QA NEEDED, NOT USER ACCEPTED, NOT RELEASED.

## Scope and evidence
- `tests/hr-shadow-backend-integration.test.ts` exercises the actual `FirestoreBackend` constructor, `prime`, `getItem`, `updateScope`, `poll`, `refreshKeys`, `setItem` and `flush` using synthetic REST snapshot readers. No Firebase credentials, project, network requests, employee information or real writes are involved.
- The injected read seam is permitted **only** when the existing disabled-by-default `hrShadowReview` flag is explicitly supplied. Normal callers continue using the unchanged real Firestore REST functions. The harness does not activate review mode in any production caller.
- Deterministic deferred responses test stale role-change reads and a stale platform-meta poll after account suspension. Additional tests cover cross-UID disposal, explicit HR read-only behavior, denied reads, and version-triggered fail-closed HCM invalidation.
- All prior operational paths, pending journals, Firestore/Storage rules, Functions and main/integration remain unchanged.

## Verification and repair
- First audit at `0fd20f7c536400ef4aa3c80fbf907453b12eeb43` FAILED in two older source-inspection tests because they required direct REST call syntax; the delegated read seam preserves the real transport as its default. Both tests now explicitly check that delegation and retain their operational assertions.
- Full fixed-SHA audits passed at `0ee594eace2bbe34a67cc40ffb181266b28c0a7a`: TypeScript, ESLint, all logic regressions, Firestore and Storage emulators, generated-rules integrity, Functions compile/lint, Next build and clean git tree.

## Remaining gates
This is synthetic backend integration, **not** browser/mobile QA, emulator authorization acceptance, production Firebase verification or an authorized staging run. The existing shared legacy HR-field and actor-audit security weaknesses remain in generated rules. Historical HR records require owner-scoped inventory, transactional migration, backup/restore and old-client read compatibility before any rule cutover. Review-only HR refresh intentionally remains blocked; it does not establish a production-ready self-service workflow.

**Next unblocked action:** add a fail-closed HCM chunk-hydration concurrency regression and adapter path integration, including denied shard and epoch changes during multi-request hydration, without activating staging.
