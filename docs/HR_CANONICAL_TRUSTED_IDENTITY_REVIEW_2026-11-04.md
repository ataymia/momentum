# HR trusted identity/session boundary review (November 4, 2026)

**Task 01, isolated review child of PR #128. NOT LIVE.** No callable endpoint, Admin SDK initialization, production database connection, deployment, browser HR read, employee data, or role changes.

## Increment

`lib/hr-canonical-trusted-identity-review.ts` adds a disabled-by-default boundary in front of the existing pinned canonical HR read. A future trusted server handler must inject the actual Firebase Admin Auth `verifyIdToken(rawToken, true)` method, the server-owned Firebase project ID, and a transport factory that reads current session/access/directory/canonical records from trusted storage. This review contract does not itself verify cryptographic signatures or instantiate a Firebase Admin SDK.

The contract rejects malformed tokens before invoking the verifier. It accepts only SDK-verified claims bound to the configured project issuer/audience and a consistent UID/subject, with safe issued/authenticated/expiry times. It never consumes client-provided role or manager claims. The verified UID alone constructs the pinned transport; its authoritative session, actor access and directory identity must agree before any confidential canonical read. Existing pinned snapshot logic enforces owner, direct-manager and Administrator field scopes, revision consistency and a post-snapshot authority check. A second revocation-aware token verification and final server authority authorization occur before returning the allowlisted HR projection.

`tests/hr-canonical-trusted-identity-review.test.ts` uses only synthetic employee data and an injected fake verifier. It checks default-disabled zero-I/O, successful self/manager/Admin reads, no private reason/evidence leakage, spoofed role claims, malformed/cross-project/expired token claims, server identity mismatch, revocation between reads, session epoch changes, final manager reassignment, and SDK failure sanitization. The mandatory logic test script includes the new suite.

## Explicit limits and release blockers

- These tests do **not** cryptographically verify Firebase ID tokens. A production handler must use the real Firebase Admin SDK, enforce `checkRevoked=true`, server-only project configuration, replay/session policies, rate limiting and operational monitoring. It must never trust browser UID/role/claims as authority.
- The transport is injected and synthetic. There is no actual callable server endpoint, production Admin SDK transaction adapter, deployed rule remediation or authenticated staging/browser role test.
- Two checks narrow but cannot eliminate the race after the final authorization check; independently review response/session invalidation and caching.
- Existing shared-HCM and actor-audit Firestore confidentiality weaknesses remain unresolved. Historical migration, source reconciliation, older-client compatibility, independently tested backup/restore, official HR compliance, mobile/browser QA and explicit Mia acceptance remain release gates.
- No production reads or writes, HR decisions, payroll, financial transactions, inventory, GPS, emails, contracts, main/integration edits, merges or deployments were performed.

**Next unblocked action:** implement a synthetic server-side adapter composition test that injects a Firebase Admin-shaped verifier and transaction transport, proving that revoked sessions never invoke confidential Firestore reads, without exposing a callable endpoint.
