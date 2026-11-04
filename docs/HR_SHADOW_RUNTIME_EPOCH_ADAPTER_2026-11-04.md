# HR shadow runtime epoch adapter: guarded review increment

**Date:** November 4, 2026 (Phoenix). **Queue:** 01. **Review:** PR #116, child of #115. **Status:** BUILT, automated audit pending at implementation SHA `95845d55c0a685dfd1223878ab92ebad04645889`; VISUAL/STAGING QA NEEDED, NOT USER ACCEPTED, NOT RELEASED.

## Implemented (no live activation)

- `lib/hr-shadow-runtime-adapter.ts` owns a monotonic epoch, scoped HCM document cache, revoked/denied quarantine state and unresolved journal-key evidence. Old requests cannot repopulate new identities or roles; a denied or cross-owned payload blanks the cache. Journals are never deleted or flushed by this adapter.
- `lib/persistence.ts` contains a deliberately **disabled-by-default internal** `hrShadowReview` option on `FirestoreBackend`. No existing caller enables it. When enabled in an independently approved test harness, HCM reads use shadow-compatible paths and the adapter; scope changes blank the HCM snapshot before refetch; HR writes and manual refresh are refused; pending HR journals remain for controlled reconciliation. Non-HR domains retain existing behavior.
- In guarded review mode, a changed HCM cloud version invalidates the cached HCM model rather than silently retaining stale records. An old in-flight scope update or poll is discarded by epoch.
- `tests/hr-shadow-runtime-adapter.test.ts` covers initial blank state, UID switch, manager reassignment, denied reads, malformed ownership, suspended/customer roles, shared private-field exclusion, journal quarantine and repeat-transition safety.

## Known limitations / release blockers

1. The guarded mode is **not enabled**, and no browser or Firebase staging run has been authorized. Unit tests alone cannot prove runtime role or tab behavior.
2. Shadow review mode is intentionally **read-only** and cannot be used for normal HR editing, automatic backfill, migration or production cutover. Denied HCM refresh remains blocked until explicit scope reset; no background reconciliation.
3. Current generated Firestore rules still have known shared legacy HR field and actor-audit authorization weaknesses. Shadow rules remain emulator-only.
4. Legacy-only HR history may disappear under shadow read paths until a verified owner-scoped backfill, backup/restore, version reconciliation and legacy-client compatibility acceptance.
5. A real backend/session integration test must verify concurrent poll, failed chunk/read, unsaved drafts, sign-out, offline/reconnect and authority refresh, including changes that arrive without a local scope-update event. Do not claim production confidentiality on the strength of this guarded code.

**Safety:** No main/integration edit, merge, deploy, live Firestore access, user status change, payroll, financial operation, external message, contract or new mutation flag. No production HR values in fixtures.

**Next unblocked action:** add a deterministic FirestoreBackend integration harness with synthetic fetch/write stubs proving the guarded mode's actual scope-change and concurrent poll/refresh behavior before any staging activation.
