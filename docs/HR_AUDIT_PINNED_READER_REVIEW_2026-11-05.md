# HR pinned cross-domain read adapter review (NOT LIVE)

November 5, 2026, 09:16 Phoenix. Queue 01. Review child of draft PR #146 at verified parent commit `16f595293c372e79ea111325d1a80358444fc9b4`.

## Implementation
`lib/hr-audit-pinned-reader-review.ts` is a default-disabled, local-emulator-only, server-shaped Firebase Admin Firestore adapter. It derives a finite, exact document set from an asserted inventory, requires a version for **every** chunk manifest, shard, legacy actor source, subject event and receipt, then reads them in **one read-only Admin Firestore transaction** with one attempt. It compares actual document updateTime to the predeclared versions, rejects missing/extra inventory paths and schema mismatches, checks declared shard and actor-event sets, and rechecks the injected reviewer authorization before returning a metadata-only classification.

The positive result is `versions-matched-unattested`. It never returns event content, employee IDs, paths or evidence, and never grants replay, append, migration, payroll, notification or any write capability. A positive result does **not** prove independently authenticated historical provenance, complete real-world inventory, a cryptographically attested reviewer, or legal retention compliance. The caller-provided inventory and `authorizeReviewer` callback are test contracts, **not** proof of real reviewer authorization. A production implementation requires separate verified identity/session integration and security review. The adapter refuses any project except the isolated `momentum-hr-admin-sdk-review` emulator, with exact loopback host and environment checks. There is no callable endpoint.

`functions/tests/hr-audit-pinned-reader-emulator.test.mjs` adds fifteen synthetic Admin SDK/emulator regressions for default denial, exact pinned reads, manifest/shard/legacy/subject/receipt version drift, missing receipts, missing/extra expected paths, malformed shard/duplicate IDs, mid-transaction reviewer revocation, denied pre-transaction access, extra historical events, browser denial and sanitized errors. The suite is registered in `package.json` mandatory `test:hr-admin-emulator`. Emulator fixture mutations are test-only and never touch production records or rules.

## Gates and limitations
- Built on an isolated review child branch only. Exact-final-SHA TypeScript, lint, logic, Firestore/Storage emulators, Admin Auth/Firestore, Functions and Next build verification is required before claiming AUTOMATED-VERIFIED.
- Existing legacy shared-HCM/actor-audit confidentiality weaknesses, authenticated historical provenance/inventory, backup restoration, older-client compatibility, approved HR access/retention policy and staging/mobile/role QA remain open.
- No production employee records, user status, payroll, inventory, orders, payments, email, GPS, contract, main/integration, merge or deployment changed.
- Owners: platform engineering for implementation and tests; HR/security reviewer for access policy, historical evidence and restore; Mia for staging/release approval. No approved deadline or measured KPI/financial outcome.
- Director Command Center MASTER chat was not directly accessed or modified.

**Next single unblocked action:** add a synthetic, independently session-verified reviewer gate around the pinned adapter and test revocation between authorization and the transaction's final check, without exposing a live endpoint.
