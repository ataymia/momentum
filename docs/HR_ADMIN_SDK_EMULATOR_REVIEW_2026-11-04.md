# HR canonical reads: real Firebase Admin SDK emulator-only regression

**November 4, 2026 (Phoenix).** Queue 01, review branch `review/hr-admin-sdk-emulator-2026-11-04-1923`. No endpoint, deployment, live credentials, real HR data or schema activation.

## Scope and evidence

`functions/tests/hr-canonical-admin-emulator.test.mjs` imports the **actual** `firebase-admin/app` and `firebase-admin/firestore` packages already installed for Firebase Functions. It initializes a named Admin app with the dedicated synthetic project `momentum-hr-admin-sdk-review` and uses real Admin SDK `getFirestore().runTransaction(..., {readOnly:true})` and `DocumentReference.get()` calls against the local Firestore emulator. The existing default-disabled `createHrCanonicalServerTransportReview` and trusted-identity read contracts are exercised without a callable handler.

The test **fails before SDK initialization** unless `FIRESTORE_EMULATOR_HOST` is loopback on port 8080 and `GCLOUD_PROJECT` matches the dedicated review project. The Admin Firestore instance's `projectId` must also match. These gates prevent this test from silently falling back to production. The emulator runner uses `firebase-tools@15.30.1 emulators:exec --only firestore --project momentum-hr-admin-sdk-review`. CI installs the existing `functions/firebase-admin` dependency before running it. No new dependency or secret is introduced.

Synthetic fixtures cover active employee, direct-report manager, Administrator, Marketing and customer roles. Candidate emulator-only Firestore rules deny direct browser access to canonical records, session records and HR authority records for **all** roles. Admin SDK transaction reads still operate in the dedicated test project. Tests check read-only transaction options, self/manager/Admin projections, denied roles/compensation, allowlisted confidential fields, session revocation and manager reassignment **after** a real SDK transaction, malformed configuration, default-disabled behavior and project mismatch.

## Boundaries and acceptance gates

- The token verifier remains **synthetic**; this is not Firebase Auth signature or revocation verification. The Admin SDK uses no production credential, and the test does not call any Firebase Auth endpoint.
- The proposed `hrCanonicalReview`, `hrCanonicalReadAuthorityReview` and `hrCanonicalReadSessionReview` paths remain review-only. Rules are injected **inside the emulator**, not committed as production authorization policy.
- The transport has no write API, although the test fixture uses Admin SDK writes to seed and mutate **only synthetic emulator data**. No real user, payroll, order, inventory, payment, notification or contract is touched.
- Legacy shared-HCM and actor-audit confidentiality exposures, historical migration/restore, older-client compatibility, SDK token-verification integration, final post-check race, role/browser staging QA and explicit Mia release authorization remain open.
- Full GitHub Actions audit must pass at an **exact final SHA** before marking this increment AUTOMATED-VERIFIED. CI success is not staging acceptance or production readiness.

**Owners:** Platform engineering owns safe server integration and rules remediation; HR/security reviewer owns confidentiality and backup restoration; Mia owns separate staging/release signoff. **Deadline:** none approved. **Measured financial/KPI outcome:** none.

**Next unblocked action:** implement a fail-closed emulator-only Admin Auth token-verifier binding test (with the Auth emulator and synthetic identities), preserving the disabled-by-default read boundary and no callable endpoint.