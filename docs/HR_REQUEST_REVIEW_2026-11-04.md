# HR request review: isolated review increment (November 4, 2026)

## Scope and source
Task 01 of `AUTONOMOUS_BUILD_MASTER_QUEUE_2026-11-03.md`. Child of review PR #118, fixed starting SHA `bc79cba2069e2c55f223eeef7336319789171a25`. The existing `hcm-engine`, `hcm-controls`, `hcm-context`, and `people-v2` remain authoritative. No new independent request database, payroll workflow, or approval engine was created.

## Implemented
- `/people/requests` and `/people/requests/{leave|workflow}/{id}` provide a scoped, searchable request queue, detail, status and recorded decision history. Employees can inspect only their own requests; Administrators can inspect active employee requests; customers and separated or mismatched identities receive no records. The queue does not expose unrelated private profile, compensation, tax or document fields.
- `planHrRequestDecision` previews a canonical HCM transition with the existing actor and ledger invariants. It rejects non-Administrators, revoked employees, stale/nonpending requests, duplicate decisions, invalid time-off hours, insufficient PTO, unknown policy, and returns without correction instructions. An approved PTO request creates exactly one source-linked usage entry and an append-only audit event. A workflow decision does **not** execute the requested employment, financial or compliance change.
- Decision buttons are available **only in explicitly local demo mode while the persistence backend reports local**. Connected Firestore mode is read-only. No staging or production mutation flag was introduced. The existing HR workflow remains available during redesign acceptance.
- Synthetic regression tests cover cross-record access, customer and manager restrictions, identity mismatch, suspension/separation, routing, PTO accounting, repeat decisions, and invalid requests.

## Acceptance and hard blockers
**Built:** review branch only. **Automated-Verified:** requires exact-SHA GitHub Actions audit. **Visual/Staging QA Needed:** yes. **User Accepted:** no. **Released:** no.

Legacy shared-HCM and actor-audit Firestore confidentiality weaknesses remain unresolved; client-side filtering is not a security boundary. Before connected review actions, require server-side record-scoped authorization, transaction preconditions, audit integrity, staging migration/backfill and restore evidence, browser/mobile and cross-role QA, and Mia's explicit separate staging/release approval. Existing demo-local mutations are not proof of a safe connected approval workflow. No production data, account state, payroll, inventory, charges, notifications or contracts were touched.

## Next unblocked action
Design and test the server-side record-scoped HR request decision command and Firestore rules on an isolated review branch, with replay/concurrency and cross-role denial tests, without enabling live writes.
