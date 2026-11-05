# HR chunked audit source inventory review (not a migration)
November 5, 2026, 05:15 Phoenix. Task 01. Isolated child of PR #142.

## Concrete implementation
- `lib/hr-audit-chunk-inventory-review.ts` validates a pinned chunk manifest and the **complete** set of physical shards in the separate `audit/events` domain. It composes existing `reviewChunkHydration` with exact independently declared event-ID membership, unique IDs across shards, owner identity, source version, reviewer/evidence fields, and no extra/duplicate shard snapshots.
- `tests/hr-audit-chunk-inventory-review.test.ts` adds synthetic fail-closed regressions for partial/denied/missing shards, duplicate IDs, wrong owner, stale manifest, mismatched count, unreviewed events, malformed input and private-output hygiene.
- The existing Admin Firestore recovery emulator suite adds actual read-only transactional chunk snapshots for a complete source, a partial loaded page and a missing physical shard. The scanner never writes or repairs records. The synthetic fault setup is not a scanner action.
- `package.json` registers the pure suite in the mandatory logic tests; the emulator additions run in the existing serial suite.

## Explicit limitations
The chunked `audit/events` domain and legacy `hcm/audit` actor history are **different physical sources**. This adapter does not claim the legacy HCM actor audit is chunked or silently treat either as a complete replacement for the other. The review-only function cannot authenticate the caller's `independentlyVerified` assertion, prove that source and shards were read atomically, verify backups, or inspect subject-scoped immutable receipts. Its successful status is deliberately `consistent-source-only`; **both safeToAppend and safeToReplayWithoutWrite remain false**. Actual emulator tests supply a pinned read-only transaction but not independent reviewer authorization or historical inventory attestation.

No callable endpoint, migration, deployable security rule, production read/write, staging flag, payment, employee action or external message is added. Existing shared-HCM confidentiality findings remain open.

## Gates / handoff
**Built:** pending commit. **Automated-Verified:** pending exact-final-SHA GitHub Actions audit, including TypeScript, ESLint, logic, Firestore/Storage emulators, actual Firebase Admin Authentication/Firestore integration, Functions, build and integrity. **Visual/Staging QA Needed:** yes. **Blocked External:** HR/security permission matrix, independent historical inventory/restore, older-client compatibility and staging authorization. **User Accepted:** no. **Released:** no.

Platform engineering owns implementation; HR/security reviewer owns source/reviewer evidence and retention; Mia owns staging and release authorization. No approved deadline, measurable KPI or financial outcome. The 00 Director Command Center MASTER chat was not directly accessible or modified.

**Next unblocked action:** bind independently attested chunk-source completeness to the subject-audit batch receipt classifier using a pinned source snapshot, without enabling any write path.

## Verification follow-up
The first PR audit failed at TypeScript because an untrusted shard path was not narrowed from `unknown` to `string` before a Set lookup. The source was repaired in `e2323cf6df5730a14bc112ec478b9e67b3eaf618`. Full push audit https://github.com/ataymia/momentum/actions/runs/42026379340 and PR audit https://github.com/ataymia/momentum/actions/runs/42026389004 both passed at that exact SHA, including 11 new logic regressions and 3 new real Admin Firestore emulator cases. This documentation-only follow-up requires its own exact-SHA audit; do not represent it as tested until observed.
