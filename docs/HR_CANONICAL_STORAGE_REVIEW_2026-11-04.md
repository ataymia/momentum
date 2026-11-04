# Canonical HR storage: synthetic migration and restore compatibility review (November 4, 2026)

**Task 01. Review-only child of PR #121. No production release or staging authorization.**

## Proposed boundary, not an activated schema

- A candidate server-owned owner/field document uses `hrCanonicalReview/{uid}/fields/{field}`. It is deliberately distinct from existing `domains/hcm/fields/{field}` and `userDomains/{uid}/hcm/{field}` paths. No runtime reader or writer is connected to it.
- The only candidate security rule is injected into Firestore emulator memory by `tests/hr-canonical-storage-emulator.test.ts`. It denies **all browser reads and writes**, including Administrator. A future server endpoint must authorize requests independently and return narrowly scoped projections. No generated `firestore.rules`, deployed policy or production SDK was changed.
- `lib/hr-canonical-storage-review.ts` is pure. It reuses the existing version-pinned legacy reconciliation, requires explicit canonical absence for every proposed target, rejects stale/duplicate/incomplete inventory, and refuses already-populated legacy targets pending separate owner-level reconciliation. The HCM actor-audit field remains explicitly excluded because actor identity is not record-subject authorization.
- A round-trip verifier checks the exact copied payload, complete target coverage, restored absence and byte-equivalent structural legacy preservation. Results contain only aggregate counts and issue codes. It neither executes nor authorizes migration.

## Automated regression matrix

- `tests/hr-canonical-storage-review.test.ts`: all eligible HCM owner-scoped fields, including private profiles, documents, leave, tasks and compensation; audit exclusion; path traversal; stale source/target; missing/duplicate/occupied inventory; already-present legacy records; mismatched or cross-owned copies; missing restoration; changed legacy source.
- `tests/hr-canonical-storage-emulator.test.ts`: all browser identities (including Administrator and unauthenticated) denied synthetic canonical reads/writes. A privileged **test-only** Firestore transaction copies one invented leave request to the candidate path, verifies it, then restores the candidate path to verified absence. The legacy source remains intact. No real user, payroll, document or company data is used.
- Both suites are registered in the full `package.json` logic and Firestore emulator audit scripts. Exact-SHA CI must pass before claiming automated verification.

## Cutover blockers and required proof

1. This synthetic rehearsal is **not** a backup/restore drill on authorized staging, a real Admin SDK migration or a tested production rollback. It does not prove Firestore updateTime preconditions or server token/revocation checks in a deployed handler.
2. Inventory every real legacy shared/private shard, owner/subject mapping and historical audit record in an explicitly authorized non-production process. Back up and restore from independent storage; prove revision and content reconciliation and preserve all legacy source history. Do not delete originals as part of a blind migration.
3. Verify old and new client compatibility, employee self-service projections, administrator-only compensation, separated staff retention, and deny-by-default Firestore/Storage authorization before any rule change. The existing shared-HCM and actor-audit confidentiality weaknesses remain unresolved.
4. The synthetic test denies browsers completely; a future backend must provide explicitly authorized record-scoped reads and transactions. No live HR approval endpoint is activated by this work.
5. Mia must separately authorize staging, migration, security acceptance and release. HR/security reviewer must sign off on confidentiality; compliance/provider review remains separate. No deadline or KPI/financial outcome is established.

**Status:** Built on isolated review branch; Automated-Verified only after final exact-SHA CI success; Visual/Staging QA Needed; Blocked External for real inventory/restore and authorization; Not User Accepted; Not Released.

**Next safe increment:** implement a server-only, disabled-by-default synthetic canonical HCM reader/projection contract with self/Administrator/manager record-scope and session-revocation tests, without enabling live access.
