# HR shadow read-path compatibility matrix (review only)

**Date:** November 4, 2026 (Phoenix). **Queue:** 01. **Scope:** draft child branch of PR #113. **No production rules, client persistence, migration, HR records or deployment changed.**

## Source-based compatibility finding

The current HCM browser persistence client (`lib/persistence.ts`) requests every path produced by `domainDocuments()` (`lib/firestore-domains.ts`), then assembles its cached documents using `assembleState()`. For employee-owned HCM fields, the existing planner requests BOTH the legacy shared `domains/hcm/fields/{field}` path and authorized `userDomains/{uid}/hcm/{field}` shards. The proposed stricter **test-only** Firestore policy denies the shared private path to non-Administrators, so an unmodified older client would receive permission-denied responses. The old client cannot be declared compatible just because its UI filters records.

A pure **unwired** candidate `planHrShadowReadPaths()` removes these forbidden shared reads for non-Administrators, preserves shared organization records and authorized owner shards, and excludes manager reads of direct-report compensation that the generated rules already reject. The actor-sharded HCM audit is not a safe substitute for employee-subject authorization. Administrators retain their existing recovery read set.

The test matrix runs the actual `assembleState()` hydration path against the **shadow Firestore emulator** using synthetic identities: Administrator, Sales Manager with a direct report, ordinary employee, Marketing, onboarding, separated, and customer. It explicitly proves the **negative** case: a synthetic employee leave request existing only in the legacy shared array disappears from a shadow-compatible non-Administrator hydration. This is a cutover blocker, not a success case.

## Built and test coverage

- `lib/hr-shadow-read-compatibility.ts`: review-only path candidate and aggregate inventory evidence gate. It has **no Firestore access, write API, logging, account mutation or integration with runtime persistence**.
- `tests/hr-shadow-read-compatibility.test.ts`: old/new path differences, all user-owned HCM fields, manager compensation restriction, Administrator parity, inactive/customer default denial, missing/unverified/unreconciled inventory rejection.
- `tests/hr-legacy-confidentiality-rules.test.ts`: current client read denied by the shadow policy, authorized shard hydration through the existing assembler, cross-role confidentiality, and intentionally incomplete legacy-only self-service history.
- `package.json`: includes pure regression in the standard logic suite. Emulator tests remain part of `test:rules`.

## Release gates and risks

1. **No production cutover:** Neither `domainDocuments()`, `persistence.ts`, generated `firestore.rules`, nor `storage.rules` has been changed. Shadow rules remain test-memory-only.
2. **No older-client compatibility claim:** Older browser bundles still request denied shared paths. A staged version-compatibility and cache/session recovery plan is required. The existing backend can cache previously readable documents across scope changes; assess that separately before any live policy update.
3. **No data completeness claim:** A successful shard read does not prove the source legacy shared array was empty or fully reconciled. A future authorized inventory must verify each owner-tagged field and backup/reconciliation evidence, then test historic employee self-service after backfill. `assessHrShadowCutover()` accepts supplied metadata, not independently authenticated receipts, and returns **review-only** status, never migration or deployment approval.
4. **No compliance/authorization shortcut:** HCM actor-audit remains excluded from the migration; role/record permissions for managers require a separate HR policy decision. Employee status is never changed automatically.
5. **Staging and release:** Mia must explicitly authorize a separate staging project/role matrix and later any migration, rules update, browser/mobile acceptance and production release. No deadline or KPI improvement established.

**Next unblocked action:** Design a fail-closed shadow-mode persistence refresh and session-switch cache invalidation regression, ensuring revoked access never rehydrates stale confidential shards.
