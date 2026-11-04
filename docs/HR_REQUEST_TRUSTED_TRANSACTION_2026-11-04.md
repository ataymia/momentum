# HR request decisions: disabled trusted transaction boundary (November 4, 2026)

**Task:** 01 Human Resources. **Review:** draft PR #121, child of #120. **Scope:** code and synthetic tests only. **Not live, not user accepted, not released.**

## Increment

- `lib/hr-request-trusted-transaction.ts` introduces an injected, server-only transaction interface, not a callable Function or Firestore Admin SDK binding. It **defaults to disabled** and returns without authenticating or reading any HR record until explicitly enabled in a synthetic test.
- The caller's intent contains only command ID, request kind/ID, decision, note and expected revision. The server supplies the verified UID and clock; actor/target access, employee directory, canonical HCM/revision and request-key receipt must be read from trusted storage inside **each transaction attempt**.
- Authorization is checked before reading confidential HCM. The canonical `evaluateHrDecisionCommand` is invoked only with transactionally obtained state, preserving the existing HCM request, PTO balance, audit and replay invariants.
- A successful transaction stages **one canonical HCM replacement** (request status, any PTO ledger adjustment, audit and revision) and **one create-only receipt** keyed by `kind:requestId`. The implementing store must guarantee atomicity and serializable retries.
- `tests/hr-request-trusted-transaction.test.ts` characterizes disabled mode, atomic effects, concurrent duplicate decisions, retry-time access revocation, unauthorized roles, target suspension, stale revision, insufficient PTO and server timestamps using synthetic records. The existing Firestore emulator test separately characterizes transaction conflicts and browser denial in candidate rules only.
- `tests/hr-request-trusted-transaction-emulator.test.ts` additionally wires the new transaction boundary to **real Firestore emulator transactions** using synthetic canonical HCM JSON and a create-only receipt document. It checks that two simultaneous approval attempts produce exactly one committed request/PTO debit/audit/receipt, and that browser roles cannot read or write either server-owned candidate path. These candidate rules are generated in test memory only.
- Repairs the previous PR #120 TypeScript failure: `withSecurityRulesDisabled` expects a void-returning callback, so the emulator helper now captures the generic result and returns it after awaiting the callback.

## Hard limitations and remaining security gate

1. **No real Firestore schema/adapter or callable handler exists.** The synthetic in-memory transaction runner serializes for testing but is not a database concurrency guarantee. The Firestore emulator characterizes transactions with test-only paths and privileged context, not deployed Admin SDK behavior.
2. The existing HCM shared/sharded legacy schema has not been transactionally migrated. Never map this adapter directly to legacy client-writable HR fields or assume atomic multi-shard replacement is safe.
3. A future authenticated server handler must verify Firebase token and revocation, reject malformed payloads, use server timestamps, rerun transaction-time role/record checks, and handle transaction errors without leaking confidential details.
4. Before activation, implement canonical server-owned storage with read/write rules denying all browser identities, transaction create-only receipt semantics, authoritative directory/target mapping, retention/backup/restore, and cross-role Firestore/Storage emulator tests. Existing shared-HCM and actor-audit confidentiality weaknesses remain unresolved.
5. Mia must separately approve staging project, synthetic fixtures, role/browser/mobile tests and eventual release. No staging flags, production reads/writes, employee changes, payroll, payment, notification, GPS, merge or deployment were authorized.

**Acceptance:** Built on review branch. Automated-Verified only upon exact-final-SHA full GitHub Actions pass. Visual/Staging QA Needed. Blocked External: staging authorization and verified HR migration/rules/security signoff. User Accepted: No. Released: No.

**Next safe action:** characterize a canonical server-owned HR decision document layout and Firestore transaction adapter in a synthetic emulator, with no live handler or generated-rule deployment.
