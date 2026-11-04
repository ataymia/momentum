# Canonical HR read contract: disabled synthetic security review (November 4, 2026)

**Task 01, child of PR #122. Not live, not staging-approved, not a migration or compliance signoff.**

## Implemented boundary

- `lib/hr-canonical-read-contract.ts` adds a pure server-oriented authorization and projection contract over the **test-only** `hrCanonicalReview/{uid}/fields/{field}` shape. It has no Firebase SDK, endpoint, browser hook, credential, persistent cache, writes, or enabled production path.
- `executeHrCanonicalReadReview` defaults to **disabled**. Synthetic tests explicitly opt in and inject an in-memory transport. A future real handler must authenticate server-side, re-read `userAccess` and directory state, validate the session/revocation epoch, fetch the candidate canonical document through privileged storage, and re-read authority **after** IO. Neither browser-supplied role, target owner, manager assignment nor claimed session epoch is trusted as authority.
- A Sales Manager can read only a directly assigned employee's limited leave, training, workflow and review summaries. Both target `userAccess.managerId` and `employeeDirectory.managerId` must match the manager's UID. A broad team membership does not grant confidential HR access. Managers cannot read documents, private profiles, compensation or raw evidence.
- Active employees can read only their own whitelisted self-service summaries, not compensation, raw document filenames/verification evidence, request reasons or performance narrative. Administrator-only compensation is projected with explicit fields; no unapproved payroll action is performed. All output fields are allowlisted. Unknown fields, mismatched ownership, duplicate record IDs, malformed payloads, missing versions and oversized arrays fail closed.
- Historical separated records remain retained. An **active Administrator** can request them only with an explicit historical flag and consistent `Separated` states in both trusted access and directory. Separated users cannot read their own data through an active session. Suspended is not a historical-retrieval shortcut.
- The synthetic executor authorizes **before** reading canonical data and **after** the asynchronous read. It captures an immutable authority fingerprint before IO and rejects stale responses after a role/session/manager/target-status change. This prevents a stale read from being emitted by this candidate, but does not repair browser caches or deployed rules.

## Automated checks

`tests/hr-canonical-read-contract.test.ts` covers self/admin/manager/cross-role access, manager reassignment, revoked and stale sessions, suspended/separated staff, explicit historical access, malformed/cross-owner/duplicate payloads, document evidence minimization, default-disabled mode, deny-before-IO, and post-IO revocation. The test is registered in the mandatory `test:logic` script. Full TypeScript, lint, logic, Firestore/Storage emulator, Functions, production build and integrity verification require **exact final SHA** GitHub Actions evidence before marking automated-verified.

## Known limits and release gates

1. This module is **not** a callable server handler or production read. `hrCanonicalReview` remains a test-only proposed collection, and no production Firestore/Storage rule or data is changed. A real server implementation needs signed authenticated identity, revocation/version semantics, secure authorization data loading and privacy-safe response transport, including pagination and rate limits.
2. The current shared `domains/hcm/fields` and actor-audit authorization weaknesses remain unresolved. Synthetic projection checks cannot repair existing browser reads or establish historical backfill. A denied canonical record is not proof that legacy history is absent.
3. Required before release: authorized staging data inventory, owner/subject reconciliation, independently verified backup/restore, older-client compatibility, actual trusted handler and deny-by-default rules, cross-role browser/mobile session testing, privacy/security acceptance, and explicit Mia signoff. Do not activate live reads, writes, payroll, forms, customer data, emails or deployments from this branch.
4. This does not establish legal electronic I-9/W-4 compliance, payroll settlements, performance improvements, financial outcomes or completed employee onboarding.

**Status:** Built for review; Automated-Verified only upon final exact-SHA CI; Visual/Staging QA Needed; Blocked External for real data inventory/restore; Not User Accepted; Not Released.

**Next safe engineering increment:** add a synthetic trusted server transport/Firestore emulator integration test for the read contract, including denied browser access, post-read authority revocation, and read-version consistency, without exposing an endpoint.
