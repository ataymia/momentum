# Momentum Payroll | Retroactive Wage Correction
Date: November 4, 2026
Branch: feature/payroll-provider-lifecycle-2026-11-04
Status: Isolated local-demo workflow. NOT production-enabled.

## Purpose
A settled paycheck can be disputed without deleting or overwriting the historical timecard, wage calculation, tax accrual or actual disbursement. The original released run remains the source record. A retroactive case records the independently verified corrected gross, approved variance, and external evidence.

## Administrator workflow
1. Open Payroll > Retro corrections.
2. Select an original Released run with a Settled employee payment matching that employee's recorded net pay.
3. Enter verified corrected gross, detailed reason and source-evidence reference.
4. The system computes gross difference = corrected gross - original gross, to USD cents.
5. Create Draft case; second open case for same original run and employee is rejected, including when submitted with a different evidence reference.
6. Review source and evidence, mark Reviewed, then explicitly Approve.
7. If positive: the approved case can generate ONE linked Off-cycle Draft using a new, unlocked pay date. The new run retains retroCaseId and originalRunId as special source metadata. Original run stays immutable.
8. If negative: the case enters Recovery review. No negative paycheck, deduction or ACH debit is automatically executed. Closing requires a documented external resolution reference.
9. If zero: the case closes with no payment.
10. Download correction register CSV; processor export includes correction case, original run and evidence reference.

## Money and process controls
- The source must actually be Released and have exactly one matching Settled disbursement for that employee.
- Historical pay and original timecard are not changed. The new case retains original/corrected gross, difference, reason, reference, actor and timestamps.
- One open case per employee and original run prevents accidental duplicate supplemental funding; correction of a correction run is blocked.
- Positive correction creates a Draft only. Existing payroll approval, processor submission, acceptance, release, settlement and filing work remain separate.
- Off-cycle supplemental tax values are INTERNAL estimates from configured rules. The payroll provider must validate exact tax, withholding, amended return obligations and amounts.
- A prior closed pay period is not reopened. The new supplemental pay date is checked for a Payroll period lock.
- No external payment, tax filing, payroll run release or email is triggered by creating a correction case.
- The UI, case mutations and supplemental drafting remain local-demo only. Connected payroll records are read-only for this feature.

## Remaining gaps
1. The corrected gross currently requires approved source evidence entered by a human. Historical automatic timecard/hourly rate/overtime reconstruction is a separate pending calculator.
2. Production needs a server-authoritative retro case transaction, strong role controls, durable audit/idempotency and staged release; this local UI is not a live payroll solution.
3. External provider recalculation and genuine government filings remain out of scope. A recorded handoff is documentary, not proof of processor acceptance.
4. Retention, scaling and future sharding of the Administrator-only payroll root case history require review to avoid data loss.
5. Browser staging tests for old/new record persistence, export accuracy, manager approval, provider acceptance, payment settlement and amendments remain necessary.

## QA scenarios
- Underpayment: Original settled gross $100, verified corrected gross $150, resulting $50 linked supplemental Draft with preserved source.
- Overpayment: $100 settled gross and corrected $75: review/closure without changing any settled transaction or making a deduction.
- No change: $100 versus $100 closes with no money movement.
- Block unpaid/voided source, duplicate case ID, second active source case (even with distinct evidence), invalid cents, stale original gross, missing payroll setup, and second supplemental draft.
- Round-trip correction case and source-link fields through payroll normalization and CSV export.

## MASTER HANDOFF
Workstream/date: Payroll/HR Timekeeping, November 4 2026.
Decisions: Preserve original settled wages; explicitly review discrepancies; only a positive approved difference may create an off-cycle draft; negative difference enters human recovery review.
Implemented: New case calculation engine, audit trail, UI, review and approval, source-linked supplemental drafting, CSV export, tests.
Unverified: Connected multi-user staging, live provider settlement and tax-provider reconciliation.
Owners: Engineering (build and staging); Mia (operational acceptance and release authority).
KPI: Correction accuracy, duplicate source prevention and time-to-reconciliation, not yet measured.
Next action: Confirm final automated audit, then develop evidence-based historical hour/rate calculation and processor-reconciliation tests before any production activation.
