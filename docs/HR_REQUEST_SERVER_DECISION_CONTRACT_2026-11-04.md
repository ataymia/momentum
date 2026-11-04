# HR request decision: trusted transaction contract (November 4, 2026)

**Task:** 01 Human Resources. **Scope:** isolated review branch PR #120, child of PR #119. **Status:** built in source; exact-SHA automated verification and staging acceptance tracked separately. **Not live.**

## What is implemented

- `lib/hr-request-server-contract.ts` is a pure, **server-only design contract**, not an endpoint or Firestore writer. A future trusted handler must derive `authenticatedUid` from verified Firebase Auth and load `userAccess`, employee directory, HCM, revision and replay receipt from trusted storage. The client must never provide those snapshots.
- Rejects non-active/non-Administrator actors, directory/auth mismatches, suspended/separated/customer targets, duplicate IDs, stale revision, previously decided requests, replay receipts and invalid timestamps/commands. A decision is only for an active employee request, never for an Administrator's own record.
- Reuses the existing `planHrRequestDecision`, HCM actor/invariant checks, PTO usage and append-only audit. The contract replaces the preview audit's nondeterministic identifier with a command-bound audit identifier and emits a receipt without confidential notes.
- Synthetic unit tests exercise authority, request ownership, replay, stale revision, workflow non-execution, audit and PTO.
- `tests/hr-request-transaction-emulator.test.ts` uses **test-only** Firestore rules and synthetic data. Every browser identity, including Administrator, is denied the proposed server-owned decision/receipt paths. A privileged emulator context characterizes two concurrent transaction attempts and replay: at most one may move a synthetic request from Submitted to Approved.

## Required trusted implementation before ANY connected mutation

1. An authorized, authenticated server handler must load actor/target `userAccess` and verified employee records at execution time, not trust browser roles, scope, timestamps or request owner. Server clock must supply the decision timestamp. Authenticate and authorize before reading confidential HCM records.
2. Read request, HCM revision, PTO ledger, audit and request-key receipt inside a **single serializable transaction**. Reject stale/duplicate/revoked requests and enforce idempotency on the canonical `kind:requestId` key, not merely on a client-supplied command ID. Atomic commit must include exact request status, any PTO usage, audit, receipt and revision. Transaction retries must rerun authority and balance checks.
3. Current HCM data uses legacy shared/sharded fields; no safe atomic multi-shard transaction or migration has been implemented. A verified canonical server-owned storage model and migration/restore proof are required. The contract does not solve the shared-HCM or actor-audit Firestore vulnerabilities.
4. Generate and emulator-test least-privilege Firestore/Storage rules for the real schema, preserve old-client read paths until compatible migration, and run negative employee/manager/Marketing/customer/separated tests. This PR only adds in-memory candidate rules, **not** generated/deployed rules.
5. Obtain Mia's distinct staging project, roles, data/fixture and acceptance approval before connecting the handler. Browser/mobile/role, simultaneous requests, offline/retry, rollback, historical preservation and security reviewer signoff remain outstanding.

**Safety:** No callable Function, deployment, live HR decision, employee account state change, payroll action, external message or production data access. An Approved generic workflow never executes employment, tax, compensation or commercial changes.

## Acceptance status

Built: review only. Automated-Verified: only if an exact final SHA GitHub Actions run passes. Visual/Staging QA Needed: yes. Blocked External: authorized staging and migration/rules/security signoff. User Accepted: no. Released: no.

**Next unblocked action:** build a disabled-by-default trusted transaction adapter against a server-owned synthetic HCM decision store, including atomic PTO/audit/receipt writes and transaction-time authority rechecks, without activating any endpoint.
