# HR pinned canonical read: Firestore transaction emulator (November 4, 2026)

**Task 01. Isolated review child of PR #127. No endpoint, production integration, or release.**

## What is exercised
- `tests/hr-canonical-pinned-transaction-emulator.test.ts` implements the existing injected `HrCanonicalPinnedTransport` using the Firebase client SDK's actual `runTransaction` against a **local synthetic Firestore emulator** with rules disabled solely for the privileged test context.
- The callback reads session, actor and target access, directory records, the server-computed canonical field path, and the canonical version within the same Firestore transaction. A second **fresh** authority read occurs after the transaction before the allowlisted projection can be returned.
- Candidate canonical, session and directory rules are injected in emulator memory and deny direct browser reads/writes for every tested role, including Administrator. Generated/committed rules remain unchanged.
- Synthetic tests cover self/manager/Administrator scope, Marketing/customer and compensation denial before canonical reads, withheld evidence, revocation and reassignment **after** the transaction, one explicit contention retry, exhausted contention, and default-disabled zero-I/O behavior.
- The explicit contention test **injects** `HrCanonicalSnapshotConflict` at the transport boundary; it does **not** prove that a production Firestore SDK transaction conflict maps to that exception or that Firestore read-only transactions retry on concurrent writes.

## Limits and gates
This is a review-only emulator transport, **not** a Firebase Admin SDK handler, real server authentication, live transaction or verified staging deployment. The emulator's privileged context bypasses rules only inside tests and is not a deployable security pattern. A future server handler must enforce authenticated identity, fresh server-side session and role evidence, rate limits, safe transaction errors, auditability, and real permission revocation; verify actual contention semantics and cancellation under controlled staging. There is an unavoidable post-final-check revocation window, so response/session handling must be independently reviewed.

Current legacy shared-HCM and actor-audit Firestore confidentiality weaknesses remain unresolved. Historical migration, older-client read compatibility, actual backup/restore, browser/mobile role QA, legal forms and separate Mia authorization are still gates. Nothing here modifies production users, HR/payroll, financial records, inventory, external messages, main, integration or deployed rules.

**Next unblocked action:** implement a read-only, disabled-by-default server-transport contract that validates server identity and session before constructing the emulator-proven transaction adapter, with malformed-claim and forged-identity regressions; do not expose a callable endpoint.
