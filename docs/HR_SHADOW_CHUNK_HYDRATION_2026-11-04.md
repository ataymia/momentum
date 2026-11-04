# HR shadow chunk hydration integrity and epoch regression

**Date:** November 4, 2026 (Phoenix). **Queue:** 01. **Branch:** `review/hr-shadow-chunk-hydration-2026-11-04-0721`. **PR:** https://github.com/ataymia/momentum/pull/118. **Status:** BUILT and AUTOMATED-VERIFIED at code/test SHA `71a6b6cc5af9fa048ee9bf0f4ebd4c0c72a9f259`, full fixed-SHA audit https://github.com/ataymia/momentum/actions/runs/41847756493 PASS (TypeScript, ESLint, logic regressions, Firestore/Storage emulators, generated rules, Functions build/lint, Next production build, clean tree). This subsequent documentation commit needs its own exact-SHA audit. VISUAL/STAGING QA NEEDED; NOT USER ACCEPTED; NOT RELEASED.

## Implementation and scope
- `lib/chunk-hydration-review.ts` verifies manifest schema, canonical chunk names, complete/unique shard retrieval, denial/missing responses, owner-field consistency and exact item count. It returns only aggregate issue codes, never employee payloads or identifiers.
- The **disabled-by-default** `hrShadowReview` path in `lib/persistence.ts` validates all manifest shards before exposing any chunked domain, quarantines incomplete domains, and rejects late chunk responses after scope-epoch changes. Initial `prime()` also aborts stale responses.
- `tests/chunk-hydration-review.test.ts` uses actual chunked audit-domain schema and an **isolated hypothetical** chunked HCM specification. `tests/hr-shadow-backend-integration.test.ts` exercises real `FirestoreBackend` methods against synthetic chunked audit records, denied/missing/cross-owned shards, and role downgrade during delayed hydration.
- **Important schema fact:** current HCM fields are not chunked. The existing chunked domain is audit. The hypothetical HCM test proves validation compatibility only; it does NOT establish an operational HCM chunk cutover or a working HR approvals workflow.

## Safety and remaining gates
- No caller enables shadow review. No production Firestore reads/writes, employee data, migrations, generated security rules, payroll, outbound communication, commercial activity, or deployment were changed.
- Legacy shared HR field and actor-audit authorization vulnerabilities remain unresolved. A future HCM chunk schema would also require authorized manifest-to-chunk read-path integration in the HCM runtime adapter, backfill evidence, backup/restore, compatibility and staging role tests.
- No browser/mobile or staging QA performed; synthetic network stubs are not evidence of deployed rule enforcement.
- Latest owner decisions (November 4) require fully functioning HR/payroll processes, Administrator weekly-report exemption, and restored invoice individual/bulk printing, downloads and saving. These remain separate acceptance work; this test increment does not claim them completed.

**Next unblocked action:** implement a source-backed HR leave/request review-and-approval workflow slice with record-scoped authorization tests, keeping live mutations disabled pending approval.
