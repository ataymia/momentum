import { evaluateSalesRepAccountBonuses, orderFirstSettlementDate, type BonusMilestone } from "./bonus-engine";
import { activeCompensation, benefitDeductionPerPayPeriod, type HCMState } from "./hcm-engine";
import type { TimeEntry, WorkspaceData } from "./types";

export const PAYROLL_STORAGE_KEY = "momentum-payroll-v5";
export type PayrollRunKind = "Regular" | "Monthly bonus";
export type PayFrequency = "Weekly" | "Biweekly" | "Semimonthly" | "Monthly";
export type PayGroup = { id: string; name: string; frequency: PayFrequency; overtimeThresholdHours: number; active: boolean };
export type PayrollEmployee = { userId: string; payGroupId: string; paymentMethod: "ACH" | "Check" | "Manual"; paymentTokenLabel: string; active: boolean };
export type WithholdingProfile = { userId: string; federalPercent: number; statePercent: number; localPercent: number; additionalWithholding: number; postTaxDeduction: number; effectiveDate: string };
export type EmployerTaxRule = { id: string; name: string; percent: number; effectiveDate: string; active: boolean };
export type PayLine = {
  employeeId: string;
  regularHours: number;
  overtimeHours: number;
  regularPay: number;
  overtimePay: number;
  bonusPay: number;
  grossPay: number;
  benefitDeduction: number;
  taxableWages: number;
  federalTax: number;
  stateTax: number;
  localTax: number;
  additionalWithholding: number;
  postTaxDeduction: number;
  employeeTaxes: number;
  employerTaxes: number;
  netPay: number;
  sourceTimecardIds: string[];
  sourceBonusIds: string[];
};
export type PayRunStatus = "Draft" | "Approved" | "Released" | "Voided";
export type PayRun = { id: string; kind: PayrollRunKind; createdAt: string; periodStart: string; periodEnd: string; payDate: string; status: PayRunStatus; lines: PayLine[]; approvedAt?: string; approvedBy?: string; releasedAt?: string; releasedBy?: string; voidedAt?: string; voidedBy?: string; voidReason?: string; reissueOf?: string };
export type TaxLiabilityType = "Federal employee" | "State employee" | "Local employee" | "Employer";
export type TaxLiabilityStatus = "Accrued" | "Scheduled" | "Paid" | "Reversed";
export type TaxLiability = { id: string; payRunId: string; type: TaxLiabilityType; amount: number; status: TaxLiabilityStatus; createdAt: string; dueDate?: string };
export type DisbursementStatus = "Released" | "Settled" | "Failed" | "Voided";
export type Disbursement = { id: string; payRunId: string; userId: string; amount: number; method: PayrollEmployee["paymentMethod"]; tokenLabel: string; status: DisbursementStatus; createdAt: string; settledAt?: string };
export type PayrollState = { version: 5; payGroups: PayGroup[]; employees: PayrollEmployee[]; withholdingProfiles: WithholdingProfile[]; employerTaxRules: EmployerTaxRule[]; runs: PayRun[]; liabilities: TaxLiability[]; disbursements: Disbursement[] };

const today = () => new Date().toISOString().slice(0, 10);

export function createPayrollSeed(): PayrollState {
  return { version: 5, payGroups: [], employees: [], withholdingProfiles: [], employerTaxRules: [], runs: [], liabilities: [], disbursements: [] };
}

export function normalizePayrollState(input: unknown): PayrollState {
  const seed = createPayrollSeed();
  if (!input || typeof input !== "object") return seed;
  const state = input as Partial<PayrollState>;
  return {
    version: 5,
    payGroups: Array.isArray(state.payGroups) ? state.payGroups : [],
    employees: Array.isArray(state.employees) ? state.employees : [],
    withholdingProfiles: Array.isArray(state.withholdingProfiles) ? state.withholdingProfiles : [],
    employerTaxRules: Array.isArray(state.employerTaxRules) ? state.employerTaxRules : [],
    runs: Array.isArray(state.runs) ? state.runs : [],
    liabilities: Array.isArray(state.liabilities) ? state.liabilities : [],
    disbursements: Array.isArray(state.disbursements) ? state.disbursements : [],
  };
}

export function timeEntryHours(entry: TimeEntry) {
  if (!entry.clockOut) return 0;
  const minutes = (value: string) => {
    const [hours, mins] = value.split(":").map(Number);
    return hours * 60 + mins;
  };
  return Math.max(0, (minutes(entry.clockOut) - minutes(entry.clockIn) - Math.max(0, entry.breakMinutes)) / 60);
}

export function activePayrollEmployee(state: PayrollState, userId: string) {
  return state.employees.find((employee) => employee.userId === userId && employee.active);
}

export function activeWithholding(state: PayrollState, userId: string, asOf = today()) {
  return state.withholdingProfiles.filter((profile) => profile.userId === userId && profile.effectiveDate <= asOf).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];
}

export function activeEmployerTaxes(state: PayrollState, asOf = today()) {
  return state.employerTaxRules.filter((rule) => rule.active && rule.effectiveDate <= asOf);
}

export function consumedTimecards(state: PayrollState) {
  return new Set(state.runs.filter((run) => run.status !== "Voided").flatMap((run) => run.lines.flatMap((line) => line.sourceTimecardIds)));
}

export function consumedBonuses(state: PayrollState) {
  return new Set(state.runs.filter((run) => run.status !== "Voided").flatMap((run) => run.lines.flatMap((line) => line.sourceBonusIds)));
}

export function invalidBonusSourcesForRun(run: PayRun, data: WorkspaceData) {
  if (run.kind !== "Monthly bonus") return [] as string[];
  const currentlyEarned = new Set(evaluateSalesRepAccountBonuses(data).filter((signal) => signal.status === "Earned").map((signal) => signal.id));
  return [...new Set(run.lines.flatMap((line) => line.sourceBonusIds).filter((bonusId) => !currentlyEarned.has(bonusId)))];
}

export function bonusEarnedDate(data: WorkspaceData, signal: BonusMilestone) {
  if (signal.status !== "Earned") return undefined;
  const evidence = signal.evidenceOrderIds
    .map((orderId) => data.orders.find((order) => order.id === orderId))
    .filter((order): order is WorkspaceData["orders"][number] => Boolean(order && orderFirstSettlementDate(data, order)))
    .sort((a, b) => (orderFirstSettlementDate(data, a) ?? a.placedAt).localeCompare(orderFirstSettlementDate(data, b) ?? b.placedAt));
  if (signal.milestone === "Opening order") return evidence[0] ? orderFirstSettlementDate(data, evidence[0]) : undefined;
  let cases = 0;
  for (const order of evidence) {
    cases += order.cases;
    if (cases >= signal.thresholdCases) return orderFirstSettlementDate(data, order);
  }
  return undefined;
}

export function earnedBonusesForMonth(state: PayrollState, data: WorkspaceData, month: string) {
  const used = consumedBonuses(state);
  return evaluateSalesRepAccountBonuses(data)
    .map((signal) => ({ signal, earnedAt: bonusEarnedDate(data, signal) }))
    .filter((item) => item.earnedAt?.slice(0, 7) === month && !used.has(item.signal.id));
}

export function calculateRegularLine(state: PayrollState, data: WorkspaceData, hcm: HCMState, employeeId: string, periodStart: string, periodEnd: string, sourceTimecardIds: string[]): PayLine | null {
  const employee = activePayrollEmployee(state, employeeId);
  const withholding = activeWithholding(state, employeeId, periodEnd);
  const compensation = activeCompensation(hcm, employeeId, periodEnd);
  const group = employee ? state.payGroups.find((item) => item.id === employee.payGroupId && item.active) : undefined;
  if (!employee || !withholding || !compensation || !group) return null;
  const hours = data.timeEntries.filter((entry) => entry.userId === employeeId && entry.date >= periodStart && entry.date <= periodEnd).reduce((sum, entry) => sum + timeEntryHours(entry), 0);
  const overtimeHours = compensation.basis === "Hourly" ? Math.max(0, hours - group.overtimeThresholdHours) : 0;
  const regularHours = compensation.basis === "Hourly" ? Math.max(0, hours - overtimeHours) : hours;
  const regularPay = compensation.basis === "Hourly" ? regularHours * compensation.rate : compensation.rate;
  const overtimePay = compensation.basis === "Hourly" ? overtimeHours * compensation.rate * 1.5 : 0;
  return calculateNet(state, hcm, employeeId, periodEnd, regularHours, overtimeHours, regularPay, overtimePay, 0, sourceTimecardIds, [], withholding);
}

export function calculateBonusLine(state: PayrollState, hcm: HCMState, employeeId: string, payDate: string, bonusAmount: number, bonusIds: string[]): PayLine | null {
  const employee = activePayrollEmployee(state, employeeId);
  const withholding = activeWithholding(state, employeeId, payDate);
  if (!employee || !withholding || bonusAmount <= 0) return null;
  return calculateNet(state, hcm, employeeId, payDate, 0, 0, 0, 0, bonusAmount, [], bonusIds, withholding);
}

function calculateNet(state: PayrollState, hcm: HCMState, employeeId: string, asOf: string, regularHours: number, overtimeHours: number, regularPay: number, overtimePay: number, bonusPay: number, sourceTimecardIds: string[], sourceBonusIds: string[], withholding: WithholdingProfile): PayLine {
  const grossPay = regularPay + overtimePay + bonusPay;
  const benefitDeduction = bonusPay > 0 && regularPay === 0 ? 0 : benefitDeductionPerPayPeriod(hcm, employeeId, asOf);
  const taxableWages = Math.max(0, grossPay - benefitDeduction);
  const federalTax = taxableWages * (withholding.federalPercent / 100);
  const stateTax = taxableWages * (withholding.statePercent / 100);
  const localTax = taxableWages * (withholding.localPercent / 100);
  const employeeTaxes = federalTax + stateTax + localTax + withholding.additionalWithholding;
  const employerTaxes = activeEmployerTaxes(state, asOf).reduce((sum, rule) => sum + taxableWages * (rule.percent / 100), 0);
  const netPay = Math.max(0, grossPay - benefitDeduction - employeeTaxes - withholding.postTaxDeduction);
  return { employeeId, regularHours, overtimeHours, regularPay, overtimePay, bonusPay, grossPay, benefitDeduction, taxableWages, federalTax, stateTax, localTax, additionalWithholding: withholding.additionalWithholding, postTaxDeduction: withholding.postTaxDeduction, employeeTaxes, employerTaxes, netPay, sourceTimecardIds, sourceBonusIds };
}
