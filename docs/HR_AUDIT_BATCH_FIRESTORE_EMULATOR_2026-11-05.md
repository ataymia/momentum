# HR multi-event Firestore recovery verification (review only)
November 5, 2026, 04:21 Phoenix. Task 01. Isolated child of draft PR #141.

## Concrete increment
- `functions/tests/hr-audit-batch-recovery-emulator.test.mjs` uses **actual Firebase Admin Firestore transactions** against the dedicated `momentum-hr-admin-sdk-review` emulator project and two synthetic employee audit events. No production project, employee, or API endpoint is involved.
- `package.json` registers the suite in mandatory serial `test:hr-admin-emulator`, alongside prior authentication and immutable receipt tests.
- Nine synthetic integration scenarios cover complete read-only inventory, missing receipt, missing event, incomplete loaded page, unreviewed source expansion, stale source version, altered receipt, browser read/write denial for all relevant roles, and metadata-only reporting.
- Each read-only classification scenario snapshots source/target/receipt versions and values before and after the scan to demonstrate that no record was created, modified or deleted **by the scanner**. Synthetic faults are deliberately introduced by privileged emulator setup before scanning.
- The test-only trusted reader obtains the original source and target/receipt snapshots in one read-only Firestore transaction, compares the declared inventory to the complete synthetic source event list, and invokes the existing all-or-nothing classifier.

## Security boundaries and limitations
The candidate deny rules are injected in test memory and are NOT deployed. The scan's `independentlyVerified: true` is a synthetic fixture assertion, **not real human inventory attestation**. The test-only source comparison covers a simple single-document `items` list, not chunked historical actor-audit sources, server authentication of a reviewer, independent backup restoration, retention, or a production transaction executor. Firestore read-only transaction consistency is not authorization for a subsequent write; no migration or repair operation exists here. All confidential values and identities are synthetic.

A result of `consistent-read-only` means only that the **synthetic** pairs and inventory are mutually consistent at the scanned snapshot. It cannot authorize migration, deactivation, payroll, commercial actions or release. Existing shared-HCM and actor-audit legacy confidentiality findings remain open.

## Handoff and release gates
**Built:** review-only test harness and mandatory CI registration. **Automated-Verified:** pending full exact-final-SHA Actions audit; do not inherit the parent green result. **Visual/Staging QA Needed:** yes. **Blocked External:** approved HR/security access and retention policy, independently verified full history inventory, backup restore drill, older-client compatibility and separately authorized staging. **User Accepted:** no. **Released:** no.

Owners: Platform engineering for test/code; HR/security reviewer for historical evidence, confidentiality and restore; Mia for staging/release decisions. No approved deadline, financial transaction or measurable KPI outcome. The 00 Director Command Center MASTER chat was not directly modified. No main/integration/parent edit, deploy, live rules, employee record mutation, payroll, payment, inventory, GPS, contract or external message.

**Next unblocked action:** add a read-only chunk-aware source-inventory verification regression so a partial legacy actor-audit shard cannot masquerade as a complete batch.
