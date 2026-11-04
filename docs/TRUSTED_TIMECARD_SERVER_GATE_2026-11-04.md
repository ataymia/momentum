# Trusted Administrator Timecard Correction | Release Gate
Date: November 4, 2026
Owner: Engineering / HR Timekeeping
Feature branch: `feature/payroll-provider-lifecycle-2026-11-04`
Status: Built for review and automated testing. **Not deployed or enabled.**

## Operating decision
Keep one canonical employee timecard record. An Administrator may propose a correction, but only an authenticated, server-owned Firestore transaction can finalize it. The employee must review and re-attest changed hours, and payroll must never silently change after a processed run.

## Implemented interfaces
- Administrator **Timekeeping** correction screen for punch edits, verified missed shifts and missing weeks
- `lib/timecard-trusted-client.ts`: authenticated token request, server receipt verification and cloud refresh
- `functions/src/index.ts`: HTTPS endpoint `correctEmployeeTimecard` with Firebase token verification including revocation
- `functions/src/timecard-trusted-transaction.ts`: current database reads and atomic update, authorizations, before-image retention, notification, idempotency receipt, audit and platform update signals
- `functions/src/timecard-correction-policy.ts`: request validation, original-punch compare-and-swap, wage consumption/period locks, overlap validation and corrections
- Tests: `tests/timecard-trusted-policy.test.ts`, `tests/timecard-trusted-client.test.ts`, `tests/timecard-trusted-transaction-emulator.test.ts`, plus existing demo engine tests

## Normal transaction
1. Administrator opens a timecard and records the correct shift or verified missing week, including a specific reason.
2. Client submits a unique request reference; source entries and payroll state supplied by the browser are **not accepted** as truth.
3. Server checks a nonrevoked Firebase session, the Administrator's current active access record and the employee's current access.
4. One transaction reads fresh per-employee timecard and time entry shards; shared legacy time evidence; all current payroll runs; payroll period locks; pending approvals; notifications; and any prior request receipt.
5. The decision rejects locked payroll sources, any ambiguous record or duplicate week, overlapping shifts, stale previous punch values, malformed source data, missing audit inputs, or reused request IDs with a different command.
6. If valid, it writes corrected entries and their before-images, returns weekly status to `Returned`, clears attestation/approval, returns pending approval records, writes the employee-targeted notification, creates immutable audit/receipt records, and bumps Firestore document versions, atomically.
7. The client confirms an exact server receipt before refreshing the workspace. The employee re-attests through the historical timecard flow and a manager reviews it again.

## Explicit release switches
Two independent release gates exist and default **OFF**:
- Server: `MOMENTUM_ENABLE_TIMECARD_CORRECTIONS=true` in the functions runtime
- Client: `NEXT_PUBLIC_ENABLE_TIMECARD_CORRECTIONS=true` at web build time

Do not activate either until authorized and staged. Their existence is **not** production approval. Keep the existing local-demo correction path available without granting connected writes.

## Outstanding production acceptance
1. **CI:** fixed-SHA application typecheck/lint, logic tests, Firestore Rules/emulator tests, Functions build/lint and production web build
2. **Real staging:** separate Administrator and employee identities; live per-user shard hydration, sync after refresh, Manager reapproval and employee notice delivery; idempotent retries on actual HTTPS requests
3. **Concurrency:** two competing admins edit one source; payroll run created during an edit; payroll period lock changed during an edit; Firestore conflict retries; denial leaves no partial records
4. **Historical migration:** legacy shared/unowned time entries must be reconciled before an employee's timecard is changed; no duplicate or hidden sources
5. **Cross-midnight cases:** overnight punches remain unsupported by the standard form and require a separately verified workflow
6. **Payroll corrections:** wages already consumed or settled require a distinct adjustment and payroll-provider reconciliation. **Do not edit historical pay source entries in place.**
7. **Data privacy:** review audit/receipt Security Rules, retention, administrative access, employee record isolation and all failure messaging
8. **Operational acceptance:** Mia approves the exact correction procedure; Flo or an authorized company representative approves any organizational permission/release changes

## Current scope boundaries
- The new endpoint records evidence and timekeeping state only. It does not pay wages, execute payroll, alter finalized pay, file tax returns, or send an external email.
- The feature is code-complete enough for staged QA but does not assert proven live behavior or payroll compliance.
- Server decisions check the approved payroll snapshot and period locks. A missing canonical source denies changes rather than inferring it is safe to edit.
- Server transaction uses current Firestore documents and a create-only idempotency receipt. The browser cannot mark success without a matching receipt.

## Next engineering block
Verify the final branch audit. Then perform end-to-end staging with a verified Administrator and employee, and implement the separate **retroactive payroll adjustment** path for already-processed wage differences. Do not merge or deploy without explicit Mia authorization.

### MASTER handoff
Workstream: HR Timekeeping + Payroll | November 4, 2026
Verified code decisions: server-owned correction, audit receipt, cross-shard read, payroll locks and two rollout gates
Unverified: end-to-end staging and user acceptance; external payroll provider correction handling
Owner: Engineering (build/tests/staging), Mia (operations and release decision)
KPI outcome: expected lower unresolved timecard exceptions; actual savings/error reduction not measured
Next decision: approve staged role-based test scenarios after CI is green, not live release
