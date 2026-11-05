# HR subject-audit immutable receipt emulator review
November 4, 2026, 23:16 Phoenix. Task 01. Review-only, synthetic project.

## Scope and implementation
`functions/tests/hr-actor-audit-receipt-emulator.test.mjs` exercises the proposed `hrAuditReview/{subjectUid}/events/{eventId}` and `hrAuditReviewReceipts/{eventId}` records with the actual Firebase Admin Firestore SDK, local emulator and an in-memory Firestore rule candidate. Both paths deny **all** browser identities, including Administrator, plus unauthenticated access. No generated or deployed rules were edited.

The test harness uses the existing `assessHrActorAuditReconciliation` gate and a synthetic actor-owned source. It requires explicit independent reviewer-to-subject mapping and a complete baseline/current inventory. In one privileged emulator transaction it reads the actor source, target event and metadata receipt, checks the original version and complete event digest, and atomically creates the subject event and metadata receipt. It never modifies or deletes the original actor shard. An exact replay performs no write. Changed source, forged target, missing receipt and unresolved/multi-subject review block. Concurrent attempts cannot create duplicate immutable receipts.

The metadata receipt contains source/destination paths, source version, event fingerprint, subject and reviewer IDs only. It contains no before/after, reason, compensation or employee name. The protected event target necessarily contains the original audit payload and is never exposed to a browser in the candidate rules. The harness uses no real employee data.

## Mandatory CI
`npm run test:hr-admin-emulator` runs the existing Admin Auth/Firestore suite and this audit suite **serially** under the dedicated local Firestore/Auth emulator project. Serial execution prevents one test file's synthetic `clearFirestore` from invalidating another's fixtures. The complete GitHub Actions audit additionally requires typecheck, lint, logic, Firestore/Storage rules emulators, Functions compile/lint, Next build, generated-rule and clean-tree integrity.

## Limits and release blockers
This is **not** a migration executor, authenticated reviewer workflow, production append-only enforcement, approved retention schema or evidence of deployed confidentiality. The privileged test uses Firebase Admin bypass of Firestore rules, so immutability depends on a future trusted command with server-side identity, reviewer authority, transactional compare-and-create, independent backups and monitoring. The candidate rule insertion exists in test memory only. The current legacy actor-shard exposure remains unresolved.

Required external decisions: HR/security must approve the actor/subject access matrix, reviewer evidence and retention/restoration policy. Platform engineering must design and validate the trusted executor, inventory, old-client/journal compatibility and source-preserving cutover. Mia must separately approve staging, migration, production rules and release. No deadline, financial impact or measured KPI improvement is established.

**Status:** Built on isolated review branch; Automated-Verified only if full exact-SHA CI succeeds; Visual/Staging QA Needed; Blocked External; User Accepted: no; Released: no.

**Next unblocked action (one):** add a synthetic server-side subject-audit receipt transaction boundary with independent verified reviewer identity and session-revocation checks, still default-disabled and without a callable endpoint.

No main/integration edits, deployment, live employee, payroll, payment, inventory, customer, GPS or messaging actions.
