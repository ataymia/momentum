import { evaluateSalesRepAccountBonuses, orderFirstSettlementDate, type BonusMilestone } from "./bonus-engine";
import { activeBenefitEnrollments, activeCompensation, type HCMState } from "./hcm-engine";
import type { TimeEntry, WorkspaceData } from "./types";

export const PAYROLL_STORAGE_KEY = "momentum-payroll-v5";
export type PayrollRunKind = "Regular" | "Monthly bonus";
export type PayFrequency = "Weekly" | "Biweekly" | "Semimonthly" | "Monthly";
export type PayGroup = { id: string; name: string; frequency: PayFrequency; overtimeThresholdHours: number; active: boolean };
export type PayrollEmployee = { userId: string; payGroupId: string; paymentMethod: "ACH" | "Check" | "Manual"; paymentTokenLabel: string; active: boolean };
export type WithholdingProfile = { userId: string; federalPercent: number; statePercent: number; localPercent: number; additionalWithholding: number; postTaxDeduction: number; effectiveDate: string };
export type EmployerTaxRule = { id: string; name: string; percent: number; effectiveDate: string; active: boolean };
export type BenefitTaxTreatment = "Pre-tax" | "Post-tax";
export type BenefitTaxRule = { id: string; planId: string; tierId: string; treatment: BenefitTaxTreatment; effectiveDate: string; active: boolean };
export type PayLine = {
  employeeId: string;
  regularHours: number;
  overtimeHours: number;
  regularPay: number;
  overtimePay: number;
  bonusPay: number;
  grossPay: number;
  benefitDeduction: number;
  preTaxBenefitDeduction?: number;
  postTaxBenefitDeduction?: number;
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
export type PayrollState = { version: 5; payGroups: PayGroup[]; employees: PayrollEmployee[]; withholdingProfiles: WithholdingProfile[]; employerTaxRules: EmployerTaxRule[]; benefitTaxRules: BenefitTaxRule[]; runs: PayRun[]; liabilities: TaxLiability[]; disbursements: Disbursement[] };
export type RegularPayrollSource = { timecardIds: string[]; entries: TimeEntry[] };
export type PayrollHourBreakdown = { totalHours: number; regularHours: number; overtimeHours: number };
export type PayrollBenefitDeductions = { preTax: number; postTax: number; total: number; unconfigured: { enrollmentId: string; planId: string; tierId: string }[] };

const today = () => new Date().toISOString().slice(0, 10);
const payrollReadyTimecard = (status: string) => ["Manager approved", "Payroll ready"].includes(status);
const zeroBenefits = (): PayrollBenefitDeductions => ({ preTax: 0, postTax: 0, total: 0, unconfigured: [] });
const finiteNonNegative = (value: number) => Number.isFinite(value) && value >= 0;

export function withholdingProfileValid(profile: WithholdingProfile | undefined) {
  return Boolean(profile && [profile.federalPercent, profile.statePercent, profile.localPercent, profile.additionalWithholding, profile.postTaxDeduction].every(finiteNonNegative));
}

export function createPayrollSeed(): PayrollState {
  return { version: 5, payGroups: [], employees: [], withholdingProfiles: [], employerTaxRules: [], benefitTaxRules: [], runs: [], liabilities: [], disbursements: [] };
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
    benefitTaxRules: Array.isArray(state.benefitTaxRules) ? state.benefitTaxRules : [],
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

export function activeBenefitTaxRule(state: PayrollState, planId: string, tierId: string, asOf = today()) {
  return state.benefitTaxRules
    .filter((rule) => rule.active && rule.planId === planId && rule.tierId === tierId && rule.effectiveDate <= asOf)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];
}

export function payrollBenefitDeductions(state: PayrollState, hcm: HCMState, userId: string, asOf = today()): PayrollBenefitDeductions {
  const result = zeroBenefits();
  for (const enrollment of activeBenefitEnrollments(hcm, userId, asOf)) {
    const plan = hcm.benefitPlans.find((item) => item.id === enrollment.planId);
    const tier = plan?.tiers.find((item) => item.id === enrollment.tierId);
    const amount = tier?.employeeContributionPerPayPeriod ?? 0;
    if (amount <= 0) continue;
    const planValid = Boolean(plan?.active && plan.startDate <= asOf && plan.endDate >= asOf && tier);
    const rule = planValid ? activeBenefitTaxRule(state, enrollment.planId, enrollment.tierId, asOf) : undefined;
    if (!rule) {
      result.unconfigured.push({ enrollmentId: enrollment.id, planId: enrollment.planId, tierId: enrollment.tierId });
      continue;
    }
    if (rule.treatment === "Pre-tax") result.preTax += amount;
    else result.postTax += amount;
  }
  result.total = result.preTax + result.postTax;
  return result;
}

export function consumedTimecards(state: PayrollState) {
  return new Set(state.runs.filter((run) => run.status !== "Voided").flatMap((run) => run.lines.flatMap((line) => line.sourceTimecardIds)));
}

export function consumedBonuses(state: PayrollState) {
  return new Set(state.runs.filter((run) => run.status !== "Voided").flatMap((run) => run.lines.flatMap((line) => line.sourceBonusIds)));
}

export function regularPayrollSource(data: WorkspaceData, employeeId: string, periodStart: string, periodEnd: string, sourceTimecardIds: string[]): RegularPayrollSource | null {
  const timecardIds = [...new Set(sourceTimecardIds)];
  if (!timecardIds.length || !periodStart || !periodEnd || periodEnd < periodStart) return null;
  const cards = timecardIds.map((id) => data.timecards.find((card) => card.id === id));
  if (cards.some((card) => !card)) return null;
  const resolved = cards.filter((card): card is WorkspaceData["timecards"][number] => Boolean(card));
  if (resolved.some((card) => card.userId !== employeeId || !payrollReadyTimecard(card.status) || card.weekStart < periodStart || card.weekEnd > periodEnd)) return null;
  const ordered = [...resolved].sort((left, right) => left.weekStart.localeCompare(right.weekStart));
  if (ordered.some((card, index) => index > 0 && card.weekStart <= ordered[index - 1].weekEnd)) return null;
  const entries = data.timeEntries.filter((entry) => entry.userId === employeeId && resolved.some((card) => entry.date >= card.weekStart && entry.date <= card.weekEnd));
  const seen = new Set<string>();
  return { timecardIds, entries: entries.filter((entry) => seen.has(entry.id) ? false : (seen.add(entry.id), true)) };
}

export function payrollHourBreakdown(data: WorkspaceData, employeeId: string, source: RegularPayrollSource, overtimeThresholdHours: number): PayrollHourBreakdown | null {
  if (!finiteNonNegative(overtimeThresholdHours)) return null;
  const cards = source.timecardIds.map((id) => data.timecards.find((card) => card.id === id));
  if (cards.some((card) => !card)) return null;
  let totalHours = 0;
  let regularHours = 0;
  let overtimeHours = 0;
  for (const card of cards.filter((item): item is WorkspaceData["timecards"][number] => Boolean(item))) {
    if (card.userId !== employeeId) return null;
    const weekHours = source.entries.filter((entry) => entry.date >= card.weekStart && entry.date <= card.weekEnd).reduce((sum, entry) => sum + timeEntryHours(entry), 0);
    const weekOvertime = Math.max(0, weekHours - overtimeThresholdHours);
    totalHours += weekHours;
    overtimeHours += weekOvertime;
    regularHours += weekHours - weekOvertime;
  }
  return { totalHours, regularHours, overtimeHours };
}

export function invalidTimecardSourcesForRun(run: PayRun, data: WorkspaceData) {
  if (run.kind !== "Regular") return [] as string[];
  const invalid = new Set<string>();
  for (const line of run.lines) {
    const source = regularPayrollSource(data, line.employeeId, run.periodStart, run.periodEnd, line.sourceTimecardIds);
    if (!source) {
      for (const id of line.sourceTimecardIds) invalid.add(id);
      if (!line.sourceTimecardIds.length) invalid.add(`${line.employeeId}:missing-source-timecard`);
    }
  }
  return [...invalid];
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
  const source = regularPayrollSource(data, employeeId, periodStart, periodEnd, sourceTimecardIds);
  const benefits = payrollBenefitDeductions(state, hcm, employeeId, periodEnd);
  if (!employee || !withholdingProfileValid(withholding) || !compensation || !finiteNonNegative(compensation.rate) || !group || !source || benefits.unconfigured.length > 0) return null;
  const employerTaxRules = activeEmployerTaxes(state, periodEnd);
  if (employerTaxRules.some((rule) => !finiteNonNegative(rule.percent))) return null;
  const totalHours = source.entries.reduce((sum, entry) => sum + timeEntryHours(entry), 0);
  const breakdown = compensation.basis === "Hourly" ? payrollHourBreakdown(data, employeeId, source, group.overtimeThresholdHours) : null;
  if (compensation.basis === "Hourly" && !breakdown) return null;
  const overtimeHours = compensation.basis === "Hourly" ? breakdown!.overtimeHours : 0;
  const regularHours = compensation.basis === "Hourly" ? breakdown!.regularHours : totalHours;
  const regularPay = compensation.basis === "Hourly" ? regularHours * compensation.rate : compensation.rate;
  const overtimePay = compensation.basis === "Hourly" ? overtimeHours * compensation.rate * 1.5 : 0;
  return calculateNet(state, employeeId, periodEnd, regularHours, overtimeHours, regularPay, overtimePay, 0, source.timecardIds, [], withholding!, benefits);
}

export function calculateBonusLine(state: PayrollState, hcm: HCMState, employeeId: string, payDate: string, bonusAmount: number, bonusIds: string[]): PayLine | null {
  void hcm;
  const employee = activePayrollEmployee(state, employeeId);
  const withholding = activeWithholding(state, employeeId, payDate);
  if (!employee || !withholdingProfileValid(withholding) || !finiteNonNegative(bonusAmount) || bonusAmount <= 0) return null;
  const employerTaxRules = activeEmployerTaxes(state, payDate);
  if (employerTaxRules.some((rule) => !finiteNonNegative(rule.percent))) return null;
  return calculateNet(state, employeeId, payDate, 0, 0, 0, 0, bonusAmount, [], bonusIds, withholding!, zeroBenefits());
}

function calculateNet(state: PayrollState, employeeId: string, asOf: string, regularHours: number, overtimeHours: number, regularPay: number, overtimePay: number, bonusPay: number, sourceTimecardIds: string[], sourceBonusIds: string[], withholding: WithholdingProfile, benefits: PayrollBenefitDeductions): PayLine | null {
  const grossPay = regularPay + overtimePay + bonusPay;
  if (!finiteNonNegative(grossPay) || !finiteNonNegative(benefits.preTax) || !finiteNonNegative(benefits.postTax)) return null;
  const rawTaxableWages = grossPay - benefits.preTax;
  if (rawTaxableWages < -0.005) return null;
  const taxableWages = Math.max(0, rawTaxableWages);
  const federalTax = taxableWages * (withholding.federalPercent / 100);
  const stateTax = taxableWages * (withholding.statePercent / 100);
  const localTax = taxableWages * (withholding.localPercent / 100);
  const employeeTaxes = federalTax + stateTax + localTax + withholding.additionalWithholding;
  const employerTaxes = activeEmployerTaxes(state, asOf).reduce((sum, rule) => sum + taxableWages * (rule.percent / 100), 0);
  if (![federalTax, stateTax, localTax, employeeTaxes, employerTaxes].every(finiteNonNegative)) return null;
  const rawNetPay = grossPay - benefits.preTax - benefits.postTax - employeeTaxes - withholding.postTaxDeduction;
  if (rawNetPay < -0.005) return null;
  const netPay = Math.max(0, rawNetPay);
  const benefitDeduction = benefits.total;
  return { employeeId, regularHours, overtimeHours, regularPay, overtimePay, bonusPay, grossPay, benefitDeduction, preTaxBenefitDeduction: benefits.preTax, postTaxBenefitDeduction: benefits.postTax, taxableWages, federalTax, stateTax, localTax, additionalWithholding: withholding.additionalWithholding, postTaxDeduction: withholding.postTaxDeduction, employeeTaxes, employerTaxes, netPay, sourceTimecardIds, sourceBonusIds };
}
