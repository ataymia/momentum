# HR canonical reads: real Firebase Auth emulator identity binding (review only)

**November 4, 2026, Phoenix. Queue 01.** Isolated child branch `review/hr-admin-auth-emulator-2026-11-04-2015`, parent review PR #132. No endpoint, live identity, employee record, credential, payroll or deployment.

## Implemented

The existing `functions/tests/hr-canonical-admin-emulator.test.mjs` now runs with both the local Firebase Authentication and Firestore emulators under the dedicated synthetic project `momentum-hr-admin-sdk-review`. `firebase.json` pins the Auth emulator to loopback port 9099; the package test script requires both emulators. The test aborts **before Admin SDK initialization** unless `FIREBASE_AUTH_EMULATOR_HOST`, `FIRESTORE_EMULATOR_HOST` and `GCLOUD_PROJECT` identify those loopback emulators and that exact synthetic project.

Actual Firebase Admin Auth `createUser` provisions five synthetic identities in the ephemeral Auth emulator. The local Auth REST sign-in issues test ID tokens. The existing default-disabled trusted identity boundary then injects the **real** `getAuth(app).verifyIdToken(token, true)` method into the previously tested **real** Admin Firestore read-only transaction transport. No role, UID, or record path is trusted from the token without server-owned session, directory and access checks. Synthetic confidential field values must not leak in denied responses.

New regression scenarios check employee/direct manager/Administrator access, Marketing/customer and compensation denials, an Auth-disabled user rejected before HR transactions, a user disabled after the Firestore transaction rejected on the second Auth verification, invalid tokens, and disabled-mode zero-I/O. Existing Firestore browser-deny, session-revocation, reassignment and project-mismatch tests remain mandatory.

## Non-negotiable security limits

- **Firebase Auth emulator ID tokens are unsigned.** The Admin SDK is configured to accept them only for the local emulator. Passing these tests is **not evidence of cryptographic production ID-token signature verification**. Never set `FIREBASE_AUTH_EMULATOR_HOST` in production, reuse emulator credentials, or accept emulator-issued tokens in any live service.
- Synthetic user accounts, passwords, emails and tokens are ephemeral test data only. The hardcoded test password is not a credential or operational secret. No production Auth or Firestore endpoint is contacted.
- The server transport remains disabled by default, read-only and not exposed through a callable endpoint. Test fixture seeding and Auth user creation affect only the local emulators. Candidate browser-deny rules are injected into the emulator, not deployed or substituted for production rules.
- Legacy shared-HCM/actor-audit confidentiality, older-client compatibility, historical backfill/restore, staging role/browser/mobile acceptance and the final post-check authorization race remain unresolved.
- Full TypeScript, ESLint, logic, Firestore/Storage emulators, Functions, build and integrity audit must pass at the **exact final SHA** before AUTOMATED-VERIFIED. No UI acceptance or release is implied.

**Owners:** Platform engineering (implementation), HR/security reviewer (confidentiality and restoration), Mia (separate staging/release authorization). **Deadline:** none approved. **Financial/KPI effect:** no transactions or measured improvement.

**Next unblocked action:** implement a read-only, emulator-only cross-role/legacy-field confidentiality regression covering existing shared HCM and actor-audit paths, to guide the production rules remediation without deploying any rules.
