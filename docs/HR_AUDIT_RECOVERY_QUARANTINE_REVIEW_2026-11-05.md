# HR immutable audit recovery quarantine, review-only
November 5, 2026, 02:17 Phoenix. Task 01. Child of PR #139. Not a production migration.

## New implementation
- `lib/hr-audit-recovery-quarantine-review.ts` classifies independently inventoried, versioned subject events and metadata receipts as `not-migrated`, `verified-pair`, or `quarantined`. This is a pure, no-I/O gate. Its response is metadata-only and contains no employee event, compensation, names, source content, or review evidence.
- A subject event without its immutable receipt is quarantined as `missing-receipt`; an orphan receipt is quarantined as `orphan-receipt`. Corrupt versions, forged provenance, changed event digest, unexpected fields, and mismatched receipt metadata also quarantine. No automatic repair, replacement, deletion, or replay write.
- Both documents positively absent yields `not-migrated`, which is **not** approval to write. Independently verified full inventory, reviewer authority, original event, session, source version and transaction preconditions remain mandatory.
- An exact pair may be replayed only without writes. Receipt and event fields are compared against independently approved event/subject/reviewer/evidence metadata, not against browser-supplied authority.
- `tests/hr-audit-recovery-quarantine-review.test.ts` covers 10 logic scenarios. The existing actual Firebase Admin Firestore emulator suite adds three integration regressions: missing receipt, orphan receipt, and tampered receipt, all verifying no automatic repair and preservation of existing document versions. `package.json` registers the logic suite in mandatory CI.

## Hard limits and security
This code is a read-only classification contract, **not** a deployed rule, trusted migration endpoint, backup/restore implementation, legal compliance proof or a guarantee that the underlying history is correct. The emulator fault injection uses synthetic Admin records only. Existing legacy HR confidentiality weaknesses, older-client compatibility, independently reviewed historical inventory, actual backup restoration, and HR/security-approved access/retention remain unresolved. Firebase Auth and Firestore revocation are not fully atomic. Production Firestore/Storage, real employees, payroll, inventory, orders, payments, GPS, notifications, contracts, and staging mutation flags were not touched.

## Acceptance and handoff
Built: review candidate. Automated-Verified: pending exact-final-SHA GitHub Actions. Visual/Staging QA Needed: yes. Blocked External: HR/security reviewer approval of access and retention, historical inventory, backup restoration and authorized staging. User Accepted: no. Released: no.

Owners: Platform engineering owns candidate recovery classification and regression coverage; HR/security reviewer owns historical ownership, confidentiality, retention and restoration acceptance; Mia separately authorizes staging and release. No deadline or measurable KPI/financial outcome established. The separate 00 Director Command Center MASTER conversation was not accessed or modified.

**Next unblocked action:** add a read-only synthetic multi-event batch recovery scan that quarantines an entire candidate batch if any event/receipt pair is incomplete, with duplicate event-ID and incomplete-inventory regressions.
