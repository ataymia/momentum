# HR legacy role/record confidentiality matrix (review only)
November 4, 2026, 21:20 Phoenix. Queue 01. No production rule changes.

## Concrete finding and source
The generated `firestore.rules` currently allows a Sales Manager to read/write a direct report's `userDomains/{uid}/hcm/documents` and `privateProfiles`, and read/write `compensationChanges` despite the stricter HR confidentiality requirement. `manages(uid)` also allows team membership without an explicit managerId, so a manager can read another team member's leave request even if not assigned to that employee. Ordinary active employees can read shared `domains/hcm/fields/documents` and `compensation` arrays containing records of other employees. Actor-sharded `userDomains/{actorUid}/hcm/audit` can contain another employee's before/after history; its actor can read/write that document. These are authorization design risks, not assertions of actual production data exposure.

## Implemented test-only candidate
`lib/hr-legacy-confidentiality-shadow-review.ts` derives an in-memory candidate from the **current generated** rules, with strict source-shape checks. It denies all employee-owned shared HCM arrays to non-Administrators; denies non-Administrator actor-audit reads/writes; restricts manager HCM shard access to explicitly assigned direct reports, not team-only membership; and denies managers access to reports' private documents, profiles, dependents, benefits and compensation/ledger history. Own-document reads and ordinary direct-report leave/request review remain available. The generated rule source, browser clients, runtime data and deployed policy are unchanged.

`tests/hr-legacy-role-matrix-review.test.ts` characterizes CURRENT exposures as expected emulator successes, then requires the CANDIDATE to deny those paths. It checks shared-field coverage against `DOMAIN_SPECS`, role matrix, direct-report vs team-only, reassignment, separated/customer roles, manager private fields, actor audit, and source-schema drift. The suite is mandatory in `npm run test:rules`.

## Not a release-ready rule
This is an intentionally stricter **candidate**, not approved role policy. Employee self-service writes to private fields, mixed-ownership shared `_root` documents, query/list behavior, old client compatibility, chunk manifests, pending journals, manager approvals, real backups, verified historical backfill and restoration all need separate examination. Any rule cutover before backfill could hide legacy-only leave, documents and audit records. A passing emulator test is not evidence that actual confidential production records are secured. Do not deploy this candidate or enable staging mutations.

## Required control-tower handoff
**Decision needed (Mia + HR/security owner):** confirm the allowed manager read/write field matrix, especially documents, dependents, benefits, profile changes, compensation changes and HR audit. Default to deny until explicitly approved. No approval deadline established.

**Engineering next:** design and test a server-owned, append-only actor-audit migration/reconciliation contract that preserves subject history and prevents browser actor forgery, with synthetic data only. This is the single next unblocked action.

**Dependencies:** explicit staging project/roles; historical inventory; independently verified backup/restore; legacy client compatibility; source-backed per-field role decisions; staging/mobile/browser role QA; production release authorization.

**Status:** Built on isolated review branch; Automated-Verified only after exact-SHA CI success; Visual/Staging QA Needed; Blocked External for cutover; User Accepted: No; Released: No. No KPI or financial outcome claimed. Main, integration, employees, payroll, customer records, money, inventory and external messages unchanged.
