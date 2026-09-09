import { evaluateSalesRepAccountBonuses } from "./bonus-engine";
import type { HCMState } from "./hcm-engine";
import {
  calculateBonusLine,
  calculateRegularLine,
  invalidBonusSourcesForRun,
  invalidTimecardSourcesForRun,
  type PayLine,
  type PayRun,
  type PayrollState,
} from "./payroll-engine";
import type { WorkspaceData } from "./types";

export type PayrollRunControlIssue = {
  code: "invalid-source" | "stale-calculation";
  employeeId?: string;
  detail: string;
};

const numericFields: (keyof PayLine)[] = [
  "regularHours",
  "overtimeHours",
  "regularPay",
  "overtimePay",
  "bonusPay",
  "grossPay",
  "benefitDeduction",
  "preTaxBenefitDeduction",
  "postTaxBenefitDeduction",
  "taxableWages",
  "federalTax",
  "stateTax",
  "localTax",
  "additionalWithholding",
  "postTaxDeduction",
  "employeeTaxes",
  "employerTaxes",
  "netPay",
];

const numericValue = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
const sameNumber = (left: unknown, right: unknown) => Math.abs(numericValue(left) - numericValue(right)) < 0.005;
const sameIds = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((value, index) => value === b[index]);
};

export function payLinesMatch(recorded: PayLine, expected: PayLine) {
  if (recorded.employeeId !== expected.employeeId) return false;
  if (!sameIds(recorded.sourceTimecardIds, expected.sourceTimecardIds)) return false;
  if (!sameIds(recorded.sourceBonusIds, expected.sourceBonusIds)) return false;
  return numericFields.every((field) => sameNumber(recorded[field], expected[field]));
}

function expectedLine(state: PayrollState, data: WorkspaceData, hcm: HCMState, run: PayRun, line: PayLine) {
  if (run.kind === "Regular") {
    return calculateRegularLine(state, data, hcm, line.employeeId, run.periodStart, run.periodEnd, line.sourceTimecardIds);
  }

  const ids = [...new Set(line.sourceBonusIds)];
  if (!ids.length || ids.length !== line.sourceBonusIds.length) return null;
  const earned = new Map(
    evaluateSalesRepAccountBonuses(data)
      .filter((signal) => signal.status === "Earned")
      .map((signal) => [signal.id, signal] as const),
  );
  const signals = ids.map((id) => earned.get(id));
  if (signals.some((signal) => !signal)) return null;
  if (signals.some((signal) => signal?.repId !== line.employeeId)) return null;
  const amount = signals.reduce((sum, signal) => sum + (signal?.amount ?? 0), 0);
  return calculateBonusLine(state, hcm, line.employeeId, run.payDate, amount, ids);
}

export function payrollRunDrift(state: PayrollState, data: WorkspaceData, hcm: HCMState, run: PayRun) {
  const stale: string[] = [];
  for (const line of run.lines) {
    const expected = expectedLine(state, data, hcm, run, line);
    if (!expected || !payLinesMatch(line, expected)) stale.push(line.employeeId);
  }
  return [...new Set(stale)];
}

export function payrollRunControlIssues(state: PayrollState, data: WorkspaceData, hcm: HCMState, run: PayRun): PayrollRunControlIssue[] {
  const issues: PayrollRunControlIssue[] = [];
  for (const source of invalidTimecardSourcesForRun(run, data)) issues.push({ code: "invalid-source", detail: `Timecard source ${source} is no longer payroll-ready.` });
  for (const source of invalidBonusSourcesForRun(run, data)) issues.push({ code: "invalid-source", detail: `Bonus source ${source} is no longer earned.` });
  for (const employeeId of payrollRunDrift(state, data, hcm, run)) issues.push({ code: "stale-calculation", employeeId, detail: `Payroll math for ${employeeId} no longer matches current approved source records and configuration.` });
  return issues;
}
