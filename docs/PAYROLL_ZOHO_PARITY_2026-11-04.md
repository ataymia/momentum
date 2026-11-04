# Momentum Payroll | Zoho US process-parity and provider-led execution
Review date: November 4, 2026. Owner: Operations / Payroll Engineering. Branch: `feature/payroll-provider-lifecycle-2026-11-04`.

## Non-negotiable workflow
Momentum owns the internal calculation, record, exception handling, review, approval, exports, and audit trail. An authorized external provider owns validated tax computation, employee disbursement execution, deposits and government filings. These are separate evidence/status transitions. No production release is authorized.

Internal estimate -> draft review -> approved immutable snapshot -> prepared provider handoff -> externally submitted -> provider accepted or discrepancy -> disbursement release -> actual settlement reconciliation -> tax deposits -> form filing acknowledgments -> completed accounting close.

## Functional inventory (not a claim of full implementation)

| Capability | Current source of truth | Coverage | Outstanding acceptance |
|---|---|---|---|
| Employee HR compensation and effective dates | HCM compensation and history | Existing | Role/approval and effective-rate edge cases |
| Pay groups and pay frequency | Native payroll context | Existing | Pay schedule calendar, dates, holiday/weekend cutoff |
| Hourly, salaried wages, overtime | Approved timecard + native calculation | Existing | Multi-role, double time, breaks, cross-week OT, certified wage logic |
| Bonuses / sales incentives | Bonus engine, payment milestones | Partial | Approval, collected-cash validation, commissions, clawbacks |
| Pre/post-tax benefits | HCM election and payroll tax-treatment rules | Partial | Tax-qualified plan verification, elections, annual ceilings |
| Withholding estimates | Configured percentages | Internal estimate only | Real W-4, FICA, wage caps, additional Medicare, state tax tables, provider validation |
| Gross to net, draft generation, status | Payroll engine | Existing | Specific adjustments, deductions and corrections |
| Pay-run submission/review/approval | Existing admin approval | Partial | Maker-checker permissions, comments and delegated approval |
| Regular and monthly bonus runs | Native payroll | Existing | Configured pay groups, settlement and payroll provider acceptance |
| Disbursement instruction and settlement | Existing ledger | Existing | Actual provider integration and bank reconciliation |
| Tax liability scheduling/payment evidence | Existing ledger | Existing | Jurisdiction deposit schedule, cross-period rollforward, refund/offset |
| Provider handoff / totals / discrepancies | New provider lifecycle | Implemented in this branch | Provider-specific approved data mapping and secure transmission |
| Provider review acceptance vs. funds paid | New handoff lifecycle | Implemented in this branch | End-to-end provider-specific QA |
| Pay reconciliation per employee | New provider lifecycle | Implemented in this branch | Verify final settlement references, failures and retries in staging |
| Tax filing plan / submission / receipt / rejection | New filing case state | Implemented in this branch | Accepted official form exports and API where supported |
| Filing amendments | Filing case supports amendment-of a filed original | Partial | Form-specific corrected return creation and validation |
| Wage statements and employee portal | Existing payroll page | Partial | Authenticated employee-only pay stub, PDF printing, YTD, safe backend data scoping |
| Prior payroll / YTD migration | None approved | Missing | Versioned historical import and independent reconciliation |
| Employee deductions/garnishments/reimbursements | Basic post-tax field | Partial | Priorities, ceilings, remittance and receipts |
| Tax form generation and electronic filing | External provider | NOT connected | Provider selected, API mapping, agency acknowledgments and authorization |
| General ledger posting and reports | Accounting system | Partial | Payroll journal batches, cost centers, liabilities, close reconciliation |
| W-2/W-3, 940/941/944 and state forms | External provider + filing register | Evidence tracking only | Form-specific validated data and filing adapters |
| 1099 contractors | Not Zoho Payroll US native | Separate workstream | Worker classification, 1099 provider workflow and reporting |

## Special-pay increment (isolated branch, November 4)
- **Off-cycle:** Admin-selected active/on-leave employee, approved taxable amount in cents, source reference and reason; new draft calculates internal estimated withholding without repeating fixed standard-period deductions.
- **Final pay:** Verified HR `Separated` status/date; Admin selects exact approved, unconsumed hourly timecards and/or an evidenced taxable final adjustment. Full salary-period proration is never guessed. Existing payroll account metadata may be inactive after separation without cancelling owed final wages.
- Both types use the existing Draft → Approved pipeline and the new provider review. **For special runs, provider acceptance is required before the existing release action records payout instructions.** No wire/ACH/filing is executed in this branch.
- Idempotency rules prevent reuse of a timecard or special earnings evidence reference for the same employee, unless the earlier run is fully voided. Payroll drift rechecks source math before handoff.
- A released special run with provider submission or filing evidence cannot be blindly voided/reissued. Provider-returned-for-correction batches may proceed to the controlled correction flow if no settled funds or paid liabilities exist.
- New components: `lib/payroll-special-runs.ts`, `components/payroll/special-payroll-panel.tsx`, and `tests/payroll-special-runs.test.ts`. New write controls are isolated local demo only until acceptance.
- **Not yet covered:** salary proration engine, severance classification, garnishments, non-taxable expenses, retroactive payroll corrections with settlement history, state-specific final payday deadline engine, government filing data schemas, processor API, and fully authenticated employee payslip access.

## Rules
1. Draft amounts are internal estimates; do not represent configured percentage withholding as actual IRS W-4/FICA computation.
2. A prepared or downloaded CSV is not externally submitted. An external submission ID is necessary.
3. External provider acceptance must include a provider run reference and compared gross/net/taxes/employee count. Differences return the run for correction; approved source amounts are immutable.
4. A provider-accepted batch is not a settled payroll; settlement must match every employee's confirmed payment. Existing payout records contain payment references, failures and retry history.
5. Tax liability Paid requires separate deposit evidence. A form is Filed only after entering a genuine external receipt and date. Due dates are entered from verified jurisdiction instructions, never manufactured from a calendar assumption.
6. Keep sensitive SSNs, DOBs, account/routing numbers and real W-4 signatures outside CSV exports. A processor-ready secure employee mapping/integration is a separate approved dependency.
7. Changes to pay math are versioned. Old runs without calculationVersion remain on calculation version 1. New runs record version 2 rounded currency. A future tax ruleset must also be versioned and independently checked.
8. Do not directly call a tax agency, bank, provider, API, or payroll release without explicit operating authority. This branch adds models/UI, not live submissions.
9. Firestore payroll domain remains Administrator-only. The existing HR legacy shared-shard confidentiality issue is independently tracked by PR #121's review work and blocks full HR release.
10. No main merge or production deployment until fixed-SHA CI, role/privacy tests, browser/staging QA and explicit Mia acceptance.

## Authoritative process benchmarks
- Zoho regular payroll: https://www.zoho.com/us/payroll/help/employer/pay-runs/regular-payroll.html
- Zoho off-cycle payroll: https://www.zoho.com/us/payroll/help/employer/pay-runs/off-cycle-payroll.html
- Zoho termination payroll: https://www.zoho.com/us/payroll/help/employer/pay-runs/termination-payroll.html
- Zoho taxes and forms: https://www.zoho.com/us/payroll/help/employer/taxes-and-forms/
- Zoho prior payroll: https://www.zoho.com/us/payroll/help/employer/prior-payroll.html
- IRS third-party payroll provider obligations: https://www.irs.gov/businesses/small-businesses-self-employed/third-party-payer-arrangements-payroll-service-providers-and-reporting-agents

## Next build block
1. Reconcile and validate full CI for provider lifecycle.
2. Add off-cycle/termination pay-run models, approved supplemental earnings and prior-payroll migration with explicit source evidence and duplicate-payment controls.
3. Build tax-calculation adapter contract with provider-reviewed per-employee authoritative numbers, rounding/versioning and agency-specific liability metadata, not invented rates.
4. Add time-off, garnishment, multi-job payroll, reconciliation and general ledger exports.
5. Complete safe employee-only pay statement read projections, secure PDF statements and retention.
6. Validate actual provider integration only after selecting a processor and receiving an authorized API/file schema. Do not guess third-party credentials, endpoints or schema.

### Current status
Built in isolated branch; automated build acceptance pending; staging QA and operational acceptance outstanding; not deployed. External tax filing and payment are not executed by this branch.
