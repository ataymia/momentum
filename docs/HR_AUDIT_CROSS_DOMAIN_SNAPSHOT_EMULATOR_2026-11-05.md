# HR cross-domain snapshot drift emulator review (NOT LIVE)

November 5, 2026, 08:23 Phoenix. Task 01, child of draft PR #145 at fixed parent SHA `71f6dd6794cfcde46dfefbd122c1b1cc6bf2328d`.

## Implementation and acceptance evidence

`functions/tests/hr-audit-cross-domain-snapshot-emulator.test.mjs` adds nine isolated, synthetic Firebase Admin Firestore emulator tests for two distinct audit sources: `userDomains/actor/audit/events` with chunk shards, and `userDomains/actor/hcm/audit` with separate immutable subject events and metadata receipts. All declared documents are read within a single read-only Admin transaction. Tests also perform *two independent* transactions with intervening emulator-only updates to the chunk manifest, event shard, legacy actor source and receipt. A test-only cross-read precondition compares every declared document's Firestore updateTime and fails closed if any path disappears or version changes. Even stable independent reads are never labeled a verified common historical snapshot.

The tests invoke the existing per-event SHA-256 content classifier and prove that changed shard contents or mismatched receipt evidence quarantine the comparison. Browser-authenticated synthetic Administrators, HR subjects, managers and Marketing users cannot inspect proposed private receipt paths under emulator-injected deny rules. No test uses real employee records or modifies a deployed rule. The test is registered in the mandatory `npm run test:hr-admin-emulator` suite.

## Important limitations and non-claims

The cross-read version guard exists in the **test harness**, not a production server adapter. An Admin SDK read-only transaction offers a consistent synthetic read, but does not authenticate the independent historical origin of two domains, attest a human reviewer, verify that an inventory covers every historical shard, or authorize replay/migration. The positive classification remains `content-matched-unattested`, with `sameHistoricalSnapshotVerified: false` and `safeToAppend: false`. The test-only `independentlyVerified: true` fixture is **not** real attestation. No live endpoint, migration executor, permissions, payroll, payments, employee statuses, notification sending or deployment was added.

## Verification and external gates

Exact-final-SHA GitHub Actions must pass TypeScript, lint, logic, Firestore and Storage rules/emulators, Firebase Admin Auth/Firestore, Functions and production build before AUTOMATED-VERIFIED is claimed. Browser/staging visual and multi-role acceptance are still outstanding. Historical HCM shared-field/actor-audit confidentiality remains unresolved. Platform engineering owns code and QA; HR/security reviewer owns confidentiality, retention, independently authenticated provenance/inventory and backup restore; Mia owns staging/release approval. No approved deadline or measurable financial result.

**Next unblocked increment:** implement a disabled-by-default trusted read adapter that applies the tested complete-document version preconditions to an actual server-side cross-domain read contract, without enabling migrations or writes.
