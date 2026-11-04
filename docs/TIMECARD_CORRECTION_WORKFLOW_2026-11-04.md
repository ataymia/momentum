# Momentum | Administrator Timecard Correction Workflow
Date: 2026-11-04
Status: Implemented in isolated branch for engineering QA. NOT deployed or approved for production.
Branch: `feature/payroll-provider-lifecycle-2026-11-04`

## User job
An Administrator must be able to repair employee punch errors, missing breaks, missed shifts and even a missing historical timecard, then return the corrected week to the employee for attestation and the appropriate manager for a new decision. No historical punch or recorded wage may silently disappear.

## Normal path
1. Administrator opens **Timekeeping > Administrator timecard corrections**.
2. Search by employee name, card identifier or week. Filter by status. Open full timecard.
3. Correct an existing punch (in/out, meal, break) or add a verified missing shift. Each change requires a written reason; the original display values, exact web punch timestamps, editing actor and UTC timestamp are preserved.
4. If an entire week has no timecard, create the missing weekly record (starting as **Returned**, zero hours and no attestation) and add verified shifts to it.
5. The timecard becomes **Returned**, employee attestation is cleared, existing pending review requests are returned, and the employee receives a timecard correction notice. The original approval history is retained.
6. Employee opens **Timekeeping > My timecard history**, selects the prior week, reviews the entries, adds an attestation explanation, re-attests and submits.
7. Existing manager review flow approves or returns it. Only approved/ready timecards can be used by native payroll.
8. Administrator can export filtered timecard registers; employee can export their own week history.

## Records / controls
- Canonical business source: `Workspace.timeEntries`, `Workspace.timecards`, `Workspace.approvals`, `Workspace.notifications`.
- Internal calculation references: `PayrollState.runs[].lines[].sourceTimecardIds`.
- Mutations: `lib/timecard-admin-corrections.ts`, exposed in `lib/workspace-context-v5.tsx`.
- UI: `components/hcm/timecard-record.tsx`, `components/hcm/admin-timecard-correction-center.tsx`, `components/hcm/employee-timecard-history.tsx`, and `/people/timekeeping`.
- Administrator rights checked in the pure mutation engine, not just the UI.
- Source preservation: correction history retains old times, original exact instants, original source and previous note; new missed entries identify their creating Administrator, timestamp and reason.
- No silent duplicate pay: cannot modify a timecard consumed by an active payroll run or create a new week overlapping an existing regular/final pay run for that employee.
- No overlapping shifts or unverified overnight punches are accepted through this form. Whole-number break minutes must be shorter than the shift; meal times must be consistent.
- All corrections on unpaid cards force fresh employee attestation and manager approval, including edits to previously manager-approved cards.

## Exceptions / escalation
- **Already in payroll:** Do not rewrite the original timecard. Open an auditable payroll adjustment/correction through the payroll processor; preserve the original wage statement and any settled or filed evidence.
- **Cross-midnight shift:** Current correction form does not support it; validate actual instants and build a separate overnight correction before accepting.
- **Wrong date, deleted shift, retroactive pay corrections, salary proration:** Not yet implemented. The Administrator cannot silently delete a punch or change the source week.
- **Employee cannot attest:** requires a formally approved exception workflow that records independent evidence; NOT automatically approved.
- **Multiple actors editing at once:** optimistic client update is not a server transaction. Production requires version preconditions and authoritative payroll locks, not only the local UI check.
- **Original mobile GPS route data:** This correction workflow must never fabricate or alter GPS tracking records. It preserves existing punch evidence rather than claiming corrected hours were physically tracked.
- **Sensitive access:** Role-based UX is not sufficient. Firestore rules, HR confidentiality/read model and payroll repository permissions require independent staging verification.

## QA
- `tests/timecard-admin-corrections.test.ts` covers Administrator permission, preservation of original timestamps, correction history, approval reset, notification targeting, missing-week creation, future dates, overlapping shifts, duplicate card/source prevention, payroll consumption and normalization.
- Final fixed-commit CI and browser tests must pass before merge.
- Manual acceptance: test an Administrator correction, employee historical-week re-attestation, manager approval, refreshed persistence, printing/export, and attempted edits on a released payroll source.

## MASTER command center handoff
Workstream: HR/timekeeping and Payroll, 2026-11-04.
Decision: Keep one shared canonical timecard source, require verified reasons and re-attestation.
Owner: Mia (operational acceptance); Engineering (code and tests); designated payroll approver (final payroll correction).
Outcome: Fewer uncorrectable punches and reduced risk of paying incorrect wages; no verified financial KPI yet.
Status: Feature branch committed, build and staging tests pending.
Dependency: Verified storage rules, payroll read model, approved correction exception procedure.
Next decision: After fixed-SHA tests, accept employee/Administrator timecard correction scenarios in isolated staging before allowing production merge.
