# HR trusted identity and Firestore transaction composition: review-only evidence

**Date:** 2026-11-04 (Phoenix). **Work package:** 01, confidential Human Resources.
**Branch:** `review/hr-trusted-identity-firestore-compose-2026-11-04-1719`. **Status:** Built, automated verification pending until an exact final-SHA GitHub Actions success; visual/staging QA needed; not accepted or released.

## Scope implemented

The mandatory `tests/hr-canonical-pinned-transaction-emulator.test.ts` suite now composes the **existing** disabled-by-default `executeHrCanonicalTrustedIdentityReview` boundary with the **existing** Firestore emulator-backed `runTransaction` transport. No parallel production HR storage path or approval engine was introduced.

The tests use an injected Firebase Admin-shaped `verifyIdToken(raw, true)` fake, synthetic session/authority/employee records, a fixed test clock, and candidate browser-deny rules installed **only in the emulator**. A server-only privileged emulator context reads the synthetic canonical records. No real Firebase Admin SDK credentials or production project are used.

## Acceptance and security regressions

1. Valid verified employee, direct-report manager and Administrator identities retrieve only their role-authorized projections through real Firestore emulator transactions. Confidential reason, evidence and pay notes never appear in results.
2. Manager private-document/compensation requests and Marketing/customer HR requests are denied **before** any canonical HR document read.
3. A forged token audience is rejected before transport construction. A verified UID different from the authoritative actor/session is denied before confidential retrieval.
4. Session revocation immediately after a transaction denies the previously valid projection without retry; a verifier revocation error at the final token check also returns no data.
5. An Administrator-controlled account suspension injected during the second verifier check is caught by the final fresh server authorization. A manager reassignment after the transaction denies without retry.
6. Only explicit synthetic snapshot contention retries once. The default-disabled entry point performs zero verifier, transaction or confidential read operations.

The existing suite already verifies direct browser denial on proposed canonical, session and authority paths for employee, manager, Administrator, Marketing, customer and anonymous contexts.

## Important limits and release gates

- The injected verifier is **not** cryptographic token verification; the privileged emulator client is **not** a production Firebase Admin SDK handler. No callable endpoint or connected-data read/write was enabled.
- Candidate deny rules are not deployed rules. Legacy shared-HCM and actor-audit confidentiality weaknesses remain unresolved.
- Final reauthorization narrows the permission-revocation window but cannot eliminate a post-check race. No claim of linearizable release-time authorization, measured contention behavior, or production latency.
- Actual historical inventory, migration/backfill, older-client compatibility, independently verified backup restoration, authorized staging roles/browser/mobile testing and HR/security review are outstanding.
- No main or integration edits, force push, merge, production deployment, HR/payroll or commercial data mutation, GPS, external message, payment, contract or merchant activation.

## Verification and handoff

Mandatory CI must pass at the **exact final commit**: TypeScript, lint, logic, Firestore/Storage emulators, generated rules integrity, Functions and production build. Record the final SHA and run link in the master queue only after observing results.

**Owners:** Platform engineering for trusted server integration and rule remediation; HR/security reviewer for confidentiality, historical migration and restoration signoff; Mia for separate staging and release approval. **Deadline:** none approved. **KPI/financial impact:** no transactions and no measured productivity or financial effect.

**Next unblocked action:** implement a disabled-by-default, server-only Firebase Admin SDK-shaped transport factory contract that binds the verified UID to trusted Firestore authority and canonical reads, with synthetic fail-closed configuration tests, without exposing an endpoint.
