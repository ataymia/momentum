import { evaluateSalesRepAccountBonuses, orderFirstSettlementDate, type BonusMilestone } from "./bonus-engine";
import { arizonaDateKey, isValidCalendarDateKey } from "./date-time";
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

const today = () => arizonaDateKey();
const payrollReadyTimecard = (status: string) => ["Manager approved", "Payroll ready"].includes(status);
const zeroBenefits = (): PayrollBenefitDeductions => ({ preTax: 0, postTax: 0, total: 0, unconfigured: [] });
const finiteNonNegative = (value: number) => Number.isFinite(value) && value >= 0;
const percentValid = (value: number) => Number.isFinite(value) && value >= 0 && value <= 100;
const validInstant = (value?: string) => Boolean(value && !Number.isNaN(new Date(value).getTime()));
const validTime = (value?: string) => Boolean(value && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value));
const payFrequencies = new Set<PayFrequency>(["Weekly", "Biweekly", "Semimonthly", "Monthly"]);
const paymentMethods = new Set<PayrollEmployee["paymentMethod"]>(["ACH", "Check", "Manual"]);
const runKinds = new Set<PayrollRunKind>(["Regular", "Monthly bonus"]);
const runStatuses = new Set<PayRunStatus>(["Draft", "Approved", "Released", "Voided"]);
const liabilityTypes = new Set<TaxLiabilityType>(["Federal employee", "State employee", "Local employee", "Employer"]);
const liabilityStatuses = new Set<TaxLiabilityStatus>(["Accrued", "Scheduled", "Paid", "Reversed"]);
const disbursementStatuses = new Set<DisbursementStatus>(["Released", "Settled", "Failed", "Voided"]);
const benefitTreatments = new Set<BenefitTaxTreatment>(["Pre-tax", "Post-tax"]);
const uniqueBy = <T>(records: T[], key: (record: T) => string) => { const seen = new Set<string>(); return records.filter((record) => { const value = key(record); return Boolean(value) && !seen.has(value) && (seen.add(value), true); }); };
const payLineNumeric = (line: PayLine) => [line.regularHours,line.overtimeHours,line.regularPay,line.overtimePay,line.bonusPay,line.grossPay,line.benefitDeduction,line.preTaxBenefitDeduction??0,line.postTaxBenefitDeduction??0,line.taxableWages,line.federalTax,line.stateTax,line.localTax,line.additionalWithholding,line.postTaxDeduction,line.employeeTaxes,line.employerTaxes,line.netPay];
const payLineValid = (line: PayLine) => Boolean(line?.employeeId && Array.isArray(line.sourceTimecardIds) && Array.isArray(line.sourceBonusIds) && new Set(line.sourceTimecardIds).size === line.sourceTimecardIds.length && new Set(line.sourceBonusIds).size === line.sourceBonusIds.length && payLineNumeric(line).every(finiteNonNegative) && Math.abs(line.grossPay-(line.regularPay+line.overtimePay+line.bonusPay))<0.005 && Math.abs(line.employeeTaxes-(line.federalTax+line.stateTax+line.localTax+line.additionalWithholding))<0.005 && Math.abs(line.benefitDeduction-((line.preTaxBenefitDeduction??0)+(line.postTaxBenefitDeduction??0)))<0.005 && Math.abs(line.netPay-(line.grossPay-(line.preTaxBenefitDeduction??0)-(line.postTaxBenefitDeduction??0)-line.employeeTaxes-line.postTaxDeduction))<0.005);

export function withholdingProfileValid(profile: WithholdingProfile | undefined) {
  return Boolean(profile && [profile.federalPercent, profile.statePercent, profile.localPercent].every(percentValid) && [profile.additionalWithholding, profile.postTaxDeduction].every(finiteNonNegative) && isValidCalendarDateKey(profile.effectiveDate));
}

export function createPayrollSeed(): PayrollState {
  return { version: 5, payGroups: [], employees: [], withholdingProfiles: [], employerTaxRules: [], benefitTaxRules: [], runs: [], liabilities: [], disbursements: [] };
}

export function normalizePayrollState(input: unknown): PayrollState {
  const seed = createPayrollSeed();
  if (!input || typeof input !== "object") return seed;
  const state = input as Partial<PayrollState>;
  const payGroups = uniqueBy((Array.isArray(state.payGroups) ? state.payGroups : []).filter((group): group is PayGroup => Boolean(group?.id && group.name?.trim() && payFrequencies.has(group.frequency) && finiteNonNegative(group.overtimeThresholdHours) && typeof group.active === "boolean")), (group) => group.id);
  const payGroupIds = new Set(payGroups.map((group) => group.id));
  const employees = uniqueBy((Array.isArray(state.employees) ? state.employees : []).filter((employee): employee is PayrollEmployee => Boolean(employee?.userId && payGroupIds.has(employee.payGroupId) && paymentMethods.has(employee.paymentMethod) && typeof employee.paymentTokenLabel === "string" && typeof employee.active === "boolean")), (employee) => employee.userId);
  const withholdingProfiles = uniqueBy((Array.isArray(state.withholdingProfiles) ? state.withholdingProfiles : []).filter((profile): profile is WithholdingProfile => withholdingProfileValid(profile)), (profile) => `${profile.userId}:${profile.effectiveDate}`);
  const employerTaxRules = uniqueBy((Array.isArray(state.employerTaxRules) ? state.employerTaxRules : []).filter((rule): rule is EmployerTaxRule => Boolean(rule?.id && rule.name?.trim() && percentValid(rule.percent) && isValidCalendarDateKey(rule.effectiveDate) && typeof rule.active === "boolean")), (rule) => rule.id);
  const benefitTaxRules = uniqueBy((Array.isArray(state.benefitTaxRules) ? state.benefitTaxRules : []).filter((rule): rule is BenefitTaxRule => Boolean(rule?.id && rule.planId && rule.tierId && benefitTreatments.has(rule.treatment) && isValidCalendarDateKey(rule.effectiveDate) && typeof rule.active === "boolean")), (rule) => rule.id);
  const runs = uniqueBy((Array.isArray(state.runs) ? state.runs : []).filter((run): run is PayRun => Boolean(run?.id && runKinds.has(run.kind) && runStatuses.has(run.status) && validInstant(run.createdAt) && isValidCalendarDateKey(run.periodStart) && isValidCalendarDateKey(run.periodEnd) && run.periodEnd >= run.periodStart && isValidCalendarDateKey(run.payDate) && Array.isArray(run.lines) && run.lines.length > 0 && run.lines.every(payLineValid) && new Set(run.lines.map((line) => line.employeeId)).size === run.lines.length && (!run.approvedAt || validInstant(run.approvedAt)) && (!run.releasedAt || validInstant(run.releasedAt)) && (!run.voidedAt || validInstant(run.voidedAt)) && (run.status !== "Approved" || Boolean(run.approvedAt && run.approvedBy)) && (run.status !== "Released" || Boolean(run.approvedAt && run.approvedBy && run.releasedAt && run.releasedBy)) && (run.status !== "Voided" || Boolean(run.voidedAt && run.voidedBy && run.voidReason?.trim())))), (run) => run.id);
  const runIds = new Set(runs.map((run) => run.id));
  const liabilities = uniqueBy((Array.isArray(state.liabilities) ? state.liabilities : []).filter((liability): liability is TaxLiability => Boolean(liability?.id && runIds.has(liability.payRunId) && liabilityTypes.has(liability.type) && liabilityStatuses.has(liability.status) && Number.isFinite(liability.amount) && liability.amount > 0 && validInstant(liability.createdAt) && (!liability.dueDate || isValidCalendarDateKey(liability.dueDate)))), (liability) => liability.id);
  const disbursements = uniqueBy((Array.isArray(state.disbursements) ? state.disbursements : []).filter((entry): entry is Disbursement => Boolean(entry?.id && runIds.has(entry.payRunId) && entry.userId && finiteNonNegative(entry.amount) && paymentMethods.has(entry.method) && typeof entry.tokenLabel === "string" && disbursementStatuses.has(entry.status) && validInstant(entry.createdAt) && (!entry.settledAt || isValidCalendarDateKey(entry.settledAt)))), (entry) => entry.id);
  return { version: 5, payGroups, employees, withholdingProfiles, employerTaxRules, benefitTaxRules, runs, liabilities, disbursements };
}

export function timeEntryHours(entry: TimeEntry) {
  if (!entry.clockOut || !validTime(entry.clockIn) || !validTime(entry.clockOut) || !finiteNonNegative(entry.breakMinutes)) return 0;
  const minutes = (value: string) => {
    const [hours, mins] = value.split(":").map(Number);
    return hours * 60 + mins;
  };
  const worked = minutes(entry.clockOut) - minutes(entry.clockIn) - entry.breakMinutes;
  return Number.isFinite(worked) && worked > 0 ? worked / 60 : 0;
}

export function activePayrollEmployee(state: PayrollState, userId: string) {
  return state.employees.find((employee) => employee.userId === userId && employee.active);
}

export function activeWithholding(state: PayrollState, userId: string, asOf = today()) {
  if (!isValidCalendarDateKey(asOf)) return undefined;
  return state.withholdingProfiles.filter((profile) => profile.userId === userId && withholdingProfileValid(profile) && profile.effectiveDate <= asOf).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];
}

export function activeEmployerTaxes(state: PayrollState, asOf = today()) {
  if (!isValidCalendarDateKey(asOf)) return [];
  return state.employerTaxRules.filter((rule) => rule.active && percentValid(rule.percent) && isValidCalendarDateKey(rule.effectiveDate) && rule.effectiveDate <= asOf);
}

function activeEmployerTaxConfigurationValid(state: PayrollState, asOf: string) {
  if (!isValidCalendarDateKey(asOf)) return false;
  return state.employerTaxRules.every((rule) => {
    if (!rule.active) return true;
    if (!rule.id?.trim() || !rule.name?.trim() || !isValidCalendarDateKey(rule.effectiveDate)) return false;
    if (rule.effectiveDate > asOf) return true;
    return percentValid(rule.percent);
  });
}

export function activeBenefitTaxRule(state: PayrollState, planId: string, tierId: string, asOf = today()) {
  if (!isValidCalendarDateKey(asOf)) return undefined;
  return state.benefitTaxRules
    .filter((rule) => rule.active && benefitTreatments.has(rule.treatment) && isValidCalendarDateKey(rule.effectiveDate) && rule.planId === planId && rule.tierId === tierId && rule.effectiveDate <= asOf)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];
}

export function payrollBenefitDeductions(state: PayrollState, hcm: HCMState, userId: string, asOf = today()): PayrollBenefitDeductions {
  const result = zeroBenefits();
  if (!isValidCalendarDateKey(asOf)) return result;
  for (const enrollment of activeBenefitEnrollments(hcm, userId, asOf)) {
    const plan = hcm.benefitPlans.find((item) => item.id === enrollment.planId);
    const tier = plan?.tiers.find((item) => item.id === enrollment.tierId);
    const amount = tier?.employeeContributionPerPayPeriod ?? 0;
    if (!Number.isFinite(amount) || amount < 0) { result.unconfigured.push({ enrollmentId: enrollment.id, planId: enrollment.planId, tierId: enrollment.tierId }); continue; }
    if (amount === 0) continue;
    const planValid = Boolean(plan?.active && isValidCalendarDateKey(plan.startDate) && isValidCalendarDateKey(plan.endDate) && plan.startDate <= asOf && plan.endDate >= asOf && tier);
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
  if (!timecardIds.length || !isValidCalendarDateKey(periodStart) || !isValidCalendarDateKey(periodEnd) || periodEnd < periodStart) return null;
  const cards = timecardIds.map((id) => data.timecards.find((card) => card.id === id));
  if (cards.some((card) => !card)) return null;
  const resolved = cards.filter((card): card is WorkspaceData["timecards"][number] => Boolean(card));
  if (resolved.some((card) => card.userId !== employeeId || !payrollReadyTimecard(card.status) || !isValidCalendarDateKey(card.weekStart) || !isValidCalendarDateKey(card.weekEnd) || card.weekStart < periodStart || card.weekEnd > periodEnd)) return null;
  const ordered = [...resolved].sort((left, right) => left.weekStart.localeCompare(right.weekStart));
  if (ordered.some((card, index) => index > 0 && card.weekStart <= ordered[index - 1].weekEnd)) return null;
  const entries = data.timeEntries.filter((entry) => entry.userId === employeeId && isValidCalendarDateKey(entry.date) && resolved.some((card) => entry.date >= card.weekStart && entry.date <= card.weekEnd));
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
    if (!finiteNonNegative(weekHours)) return null;
    const weekOvertime = Math.max(0, weekHours - overtimeThresholdHours);
    totalHours += weekHours;
    overtimeHours += weekOvertime;
    regularHours += weekHours - weekOvertime;
  }
  return [totalHours,regularHours,overtimeHours].every(finiteNonNegative) ? { totalHours, regularHours, overtimeHours } : null;
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
    if (!Number.isFinite(order.cases) || order.cases <= 0) continue;
    cases += order.cases;
    if (cases >= signal.thresholdCases) return orderFirstSettlementDate(data, order);
  }
  return undefined;
}

export function earnedBonusesForMonth(state: PayrollState, data: WorkspaceData, month: string) {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month)) return [];
  const used = consumedBonuses(state);
  return evaluateSalesRepAccountBonuses(data)
    .map((signal) => ({ signal, earnedAt: bonusEarnedDate(data, signal) }))
    .filter((item) => item.earnedAt?.slice(0, 7) === month && !used.has(item.signal.id));
}

export function calculateRegularLine(state: PayrollState, data: WorkspaceData, hcm: HCMState, employeeId: string, periodStart: string, periodEnd: string, sourceTimecardIds: string[]): PayLine | null {
  if (!isValidCalendarDateKey(periodStart) || !isValidCalendarDateKey(periodEnd) || periodEnd < periodStart || !activeEmployerTaxConfigurationValid(state, periodEnd)) return null;
  const employee = activePayrollEmployee(state, employeeId);
  const withholding = activeWithholding(state, employeeId, periodEnd);
  const compensation = activeCompensation(hcm, employeeId, periodEnd);
  const group = employee ? state.payGroups.find((item) => item.id === employee.payGroupId && item.active) : undefined;
  const source = regularPayrollSource(data, employeeId, periodStart, periodEnd, sourceTimecardIds);
  const benefits = payrollBenefitDeductions(state, hcm, employeeId, periodEnd);
  if (!employee || !withholdingProfileValid(withholding) || !compensation || !finiteNonNegative(compensation.rate) || !group || !finiteNonNegative(group.overtimeThresholdHours) || !source || benefits.unconfigured.length > 0) return null;
  const employerTaxRules = activeEmployerTaxes(state, periodEnd);
  if (employerTaxRules.some((rule) => !percentValid(rule.percent))) return null;
  const totalHours = source.entries.reduce((sum, entry) => sum + timeEntryHours(entry), 0);
  if (!finiteNonNegative(totalHours)) return null;
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
  if (!isValidCalendarDateKey(payDate) || !bonusIds.length || new Set(bonusIds).size !== bonusIds.length || !activeEmployerTaxConfigurationValid(state, payDate)) return null;
  const employee = activePayrollEmployee(state, employeeId);
  const withholding = activeWithholding(state, employeeId, payDate);
  if (!employee || !withholdingProfileValid(withholding) || !finiteNonNegative(bonusAmount) || bonusAmount <= 0) return null;
  const employerTaxRules = activeEmployerTaxes(state, payDate);
  if (employerTaxRules.some((rule) => !percentValid(rule.percent))) return null;
  return calculateNet(state, employeeId, payDate, 0, 0, 0, 0, bonusAmount, [], bonusIds, withholding!, zeroBenefits());
}

function calculateNet(state: PayrollState, employeeId: string, asOf: string, regularHours: number, overtimeHours: number, regularPay: number, overtimePay: number, bonusPay: number, sourceTimecardIds: string[], sourceBonusIds: string[], withholding: WithholdingProfile, benefits: PayrollBenefitDeductions): PayLine | null {
  if (!isValidCalendarDateKey(asOf) || !activeEmployerTaxConfigurationValid(state, asOf) || ![regularHours,overtimeHours,regularPay,overtimePay,bonusPay].every(finiteNonNegative) || !withholdingProfileValid(withholding)) return null;
  const grossPay = regularPay + overtimePay + bonusPay;
  if (!finiteNonNegative(grossPay) || !finiteNonNegative(benefits.preTax) || !finiteNonNegative(benefits.postTax)) return null;
  const rawTaxableWages = grossPay - benefits.preTax;
  if (!Number.isFinite(rawTaxableWages) || rawTaxableWages < -0.005) return null;
  const taxableWages = Math.max(0, rawTaxableWages);
  const federalTax = taxableWages * (withholding.federalPercent / 100);
  const stateTax = taxableWages * (withholding.statePercent / 100);
  const localTax = taxableWages * (withholding.localPercent / 100);
  const employeeTaxes = federalTax + stateTax + localTax + withholding.additionalWithholding;
  const employerTaxes = activeEmployerTaxes(state, asOf).reduce((sum, rule) => sum + taxableWages * (rule.percent / 100), 0);
  if (![federalTax, stateTax, localTax, employeeTaxes, employerTaxes].every(finiteNonNegative)) return null;
  const rawNetPay = grossPay - benefits.preTax - benefits.postTax - employeeTaxes - withholding.postTaxDeduction;
  if (!Number.isFinite(rawNetPay) || rawNetPay < -0.005) return null;
  const netPay = Math.max(0, rawNetPay);
  const benefitDeduction = benefits.total;
  const line = { employeeId, regularHours, overtimeHours, regularPay, overtimePay, bonusPay, grossPay, benefitDeduction, preTaxBenefitDeduction: benefits.preTax, postTaxBenefitDeduction: benefits.postTax, taxableWages, federalTax, stateTax, localTax, additionalWithholding: withholding.additionalWithholding, postTaxDeduction: withholding.postTaxDeduction, employeeTaxes, employerTaxes, netPay, sourceTimecardIds, sourceBonusIds };
  return payLineValid(line) ? line : null;
}
