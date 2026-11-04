# Canonical HR read: synthetic Firestore transport and revision-race review (November 4, 2026)

**Task 01. Review-only child of PR #124. No endpoint, real migration, staging activation, deployed rule change or release.**

## Concrete engineering increment

- `lib/hr-canonical-read-contract.ts` now requires a trusted canonical revision re-read before returning an allowlisted projection. It compares the version fetched with the original canonical document, then checks authoritative session/role/manager/target state again. A mismatch returns `canonical-changed` or `authority-changed`, never stale HR data. A missing verifier fails closed. The existing before/after authority checks remain.
- `tests/hr-canonical-read-contract.test.ts` adds deterministic version replacement, mid-verification revocation and missing-verifier regressions.
- `tests/hr-canonical-read-emulator.test.ts` uses the real Firestore emulator with synthetic employee, manager, Administrator, customer and Marketing identities. Test-only injected rules deny all browser reads/writes to candidate canonical HR documents and synthetic authority/session paths, including Administrator. The test transport uses a privileged **rules-disabled emulator context only**, not a production Admin SDK handler.
- The emulator tests exercise permitted self/manager/Admin projections, private file/reason minimization, compensation restriction, midflight manager suspension, reassignment, canonical revision replacement, revocation during version verification, and disabled-by-default operation. `package.json` registers the suite in the mandatory Firestore rules audit.

## Important limitations

1. This is **not** a production-safe read endpoint. The candidate `hrCanonicalReview` storage and injected rules are not deployed. No real employee record or production credential is accessed. The emulator's privileged bypass is strictly test-only.
2. Re-reading a revision and authority narrows stale-response windows but does **not** prove atomic consistency under concurrent writes. A future trusted handler must use transactional or immutable version-pinned snapshots, monotonic revision enforcement and revocation semantics, with rate limits, audit and secure transport. An unchanged version on a mutated payload is not detectable by this candidate alone.
3. The legacy shared `domains/hcm/fields` and actor-audit confidentiality weaknesses remain open. Historical inventory, independent backup/restore, older-client compatibility, real server authorization and browser/mobile role QA are blocked until an approved staging plan exists.
4. No HR approval, PTO, payroll, payment, user status, marketing, inventory, customer data, external message, GPS, contract, staging flag, main merge or deployment was enabled or modified.

## Verification and handoff

Required exact-SHA GitHub Actions: TypeScript, ESLint, full logic, Firestore/Storage emulators, generated rules integrity, Functions build/lint, production build and clean tree. Record final run conclusion in the autonomous queue. A green test is **Automated-Verified** for this review slice only, not Visual/Staging QA, User Accepted or Released.

**Owners:** Platform engineering owns trusted server implementation and historical compatibility; HR/security reviewer owns confidentiality and restore acceptance; Mia separately authorizes staging and release. No deadline, KPI uplift, monetary transaction or measured financial outcome established.

**Next unblocked engineering action:** build a disabled-by-default, transactionally version-pinned synthetic HR read snapshot adapter with revocation retry tests, before any callable endpoint or migration.
