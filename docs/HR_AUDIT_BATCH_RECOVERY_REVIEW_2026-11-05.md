# HR multi-event recovery inventory scan, review-only
November 5, 2026, 03:21 Phoenix. Task 01. Isolated child of PR #140.

## Implemented increment
- `lib/hr-audit-batch-recovery-review.ts`: pure, read-only, all-or-nothing classifier for an independently inventoried actor-shard batch. It compares a complete declared event-ID list with the supplied event/receipt pairs and invokes the existing strict versioned pair classifier for every event.
- `tests/hr-audit-batch-recovery-review.test.ts`: 16 synthetic logic regressions for complete replay, missing/duplicate/unexpected event IDs, orphan/missing/tampered receipts, absent pairs, actor/reviewer/source-version mismatch, absent inventory attestation, malformed runtime data, privacy and immutability.
- `package.json`: includes the suite in mandatory `test:logic`.

A batch is `consistent-read-only` only when every declared event ID has exactly one complete, individually matching event and immutable metadata receipt. Any incomplete, malformed, duplicated, unexpected or conflicting entry quarantines the **entire** batch. The response contains only status/reason and never record IDs, event contents, employee details, or reviewer evidence. `safeToAppend` is always false.

## Security and verification boundaries
The `independentlyVerified` manifest flag and inventory evidence are **assertions supplied by the caller**, not independently authenticated or cryptographically verified by this function. The scanner does not prove inventory completeness, original source correctness, reviewer authority, retention compliance, snapshot freshness, or backup restoration. A trusted server must obtain and verify the full inventory, authorization, source versions and evidence before relying on its classification; it must also re-read transactional preconditions for any separately authorized migration. `consistent-read-only` is not permission to migrate or a production success claim.

No Firestore writes, migration, auto-repair, endpoint, rules deployment, real employee data, production/staging mutation flag, payroll, inventory, order, payment, message, contract, GPS or main/integration edit. Existing legacy HR confidentiality weaknesses remain open.

## Acceptance / handoff
Built: review candidate. Automated-Verified: pending full GitHub Actions exact-final-SHA audit. Visual/Staging QA Needed: yes. Blocked External: HR/security access matrix, independently verified historical inventory and reviewer decisions, backup restoration, old-client compatibility and authorized staging. User Accepted: no. Released: no.

Owners: platform engineering (read-only classifier and CI); HR/security reviewer (history, permissions, retention and restore); Mia (separate staging/release approval). No approved deadline, measurable financial or KPI outcome. The 00 Director Command Center MASTER conversation was not accessed or modified.

**Next unblocked action:** add an actual Firebase Admin Firestore emulator read-only multi-event inventory regression proving that a partial snapshot quarantines the entire batch without creating or altering any audit records.
