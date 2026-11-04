# Canonical HR: pinned read-only snapshot review (November 4, 2026)

**Task 01. Review-only child of PR #126. Not a production integration or release.**

## Implementation

- `lib/hr-canonical-pinned-snapshot.ts` adds a disabled-by-default, injected transaction/snapshot contract. It authorizes from a trusted snapshot before loading confidential canonical data; reads canonical payload and its revision within the same snapshot; returns only the existing allowlisted projection; then checks fresh authoritative identity/session/role/manager state before releasing a response.
- `lib/hr-canonical-read-contract.ts` exports the existing authority fingerprint for reuse, avoiding inconsistent revocation checks between read paths.
- `tests/hr-canonical-pinned-snapshot.test.ts` exercises synthetic snapshot contention (bounded whole-read retry), session revocation, manager reassignment, suspended users, invalid paths, restricted fields, revision mismatches, no partial leaks and default-disabled behavior. Registered in the mandatory logic suite.

## Security boundaries and next gates

The injected transport is an interface, **not** an actual Firestore Admin SDK transaction, production callable handler or authorization proof. The synthetic test harness models a consistent snapshot. A future server implementation must guarantee transactional/immutable read consistency across authority, session, canonical payload and revision, and prove session revocation behavior against actual deployed rules. The post-snapshot check narrows but cannot eliminate revocation races after its final read. Conflict retries never bypass permission denial or stale-session checks.

Candidate canonical paths and rules remain test-only. Existing legacy shared-HCM and actor-audit confidentiality weaknesses, real backup/restore, historical migration, older-client compatibility, rate limiting, browser/staging QA and separate Mia release approval remain open. No main/integration writes, live employee/user/order/payroll/inventory/payment mutations, external messages or deployment.

**Next unblocked action:** implement a synthetic Firestore emulator transaction transport using the pinned interface, with conflict and post-transaction revocation tests, before any server endpoint.
