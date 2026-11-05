# HR actor-audit reviewer identity and session gate (review only)
**November 5, 2026 | Task 01 | No production approval**

## Implementation
- `lib/hr-audit-reviewer-session-review.ts` implements a disabled-by-default, read-only gate for a reviewer identity. It does **not** append, migrate, authorize a write, create a route or return confidential audit event content.
- `functions/tests/hr-actor-audit-reviewer-emulator.test.mjs` uses actual Firebase Admin Authentication and Firestore SDKs, an isolated local Auth/Firestore emulator, and synthetic identities. `package.json` adds this suite to the mandatory full audit.
- The reviewer must have a real Admin Auth ID token, verified with `verifyIdToken(token, true)`, matching project/issuer/subject and unexpired claims. Only a verified UID may be used to derive server-owned authority paths. A matching Administrator `userAccess` record, separately server-owned `hrAuditReviewerAuthorityReview` record and active `hrAuditReviewerSessionReview` epoch are required. The actor cannot self-review.
- A pinned read-only transaction checks all three records; a second Admin Auth revocation check and fresh role/session read deny a revoked or reassigned reviewer before returning **metadata-only** reviewer status. Default-off, nonlocal emulator host, project mismatch, malformed tokens and unauthorized roles fail closed.
- In-memory-only Firestore candidate rules deny all browser roles, including Administrator, from reading or writing reviewer authority/session records. They are not deployed.

## Critical boundary and unresolved risk
**A successful gate result is not permission to migrate or write an audit receipt.** The prior synthetic immutable-receipt harness remains a separate test fixture and is intentionally not wired to this gate. A future trusted write executor must bind the exact human-reviewed subject decision, immutable event digest, independent evidence, original snapshot version, source/target receipt, reviewer role/session and authorization **inside the same write transaction**, including contention and session revocation. A post-transaction recheck cannot undo an already committed write and cannot eliminate the final check-to-use race. No cryptographic signature claim is made from unsigned Auth emulator tokens.

No production HR rules, migration, records, employees, timecards, payroll, payments, orders, inventory, notifications, GPS, contracts, main/integration branch, staging flags, merge or deployment were changed.

## Verification and acceptance
Mandatory suite: `npm run test:hr-admin-emulator`; full GitHub Actions audit additionally runs TypeScript, lint, logic, Firestore/Storage rules, Functions and Next build. Record the exact final commit and workflow conclusion in the queue; never transfer a prior SHA's success.

**Built:** review code and tests. **Automated-Verified:** only after exact-SHA full CI success. **Visual/Staging QA Needed:** yes. **Blocked External:** manager/reviewer authority matrix, verified source inventory and decisions, independent backup restoration, old-client compatibility, approved staging. **User Accepted:** no. **Released:** no.

## MASTER handoff
- **Owner:** Platform engineering for server-side implementation; HR/security reviewer for independent decision evidence and confidentiality; Mia for staging, cutover and release signoff.
- **Financial/KPI outcome:** none established; no commercial or personnel transaction.
- **Proposed next safe increment:** synthetic trusted write-transaction authorization binding for immutable receipts, explicitly testing mid-transaction session revocation, without a callable endpoint.
- The 00 Director Command Center MASTER conversation was not directly edited; repository records and available prior decisions are the basis for this review.
