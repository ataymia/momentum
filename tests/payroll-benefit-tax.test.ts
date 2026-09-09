import assert from "node:assert/strict";
import test from "node:test";
import { createDemoData } from "../lib/demo-data";
import { createHcmSeed } from "../lib/hcm-engine";
import { activeBenefitTaxRule, calculateRegularLine, createPayrollSeed, normalizePayrollState, payrollBenefitDeductions } from "../lib/payroll-engine";

function fixture() {
  const base = createDemoData();
  const cardSeed = base.timecards[0];
  const entrySeed = base.timeEntries[0];
  const card = { ...cardSeed, id: "tc-approved", userId: "usr-jordan", weekStart: "2026-08-01", weekEnd: "2026-08-07", status: "Manager approved" as const, attested: true, approverId: "usr-avery" };
  const entry = { ...entrySeed, id: "te-approved", userId: "usr-jordan", date: "2026-08-05", clockIn: "09:00", clockOut: "17:00", breakMinutes: 0 };
  const data = { ...base, timecards: [card], timeEntries: [entry] };
  const hcm = createHcmSeed(data);
  hcm.compensation = [{ id: "comp-1", userId: "usr-jordan", basis: "Hourly", rate: 20, effectiveDate: "2026-01-01", reason: "Test", status: "Active", approvedBy: "usr-mia", createdAt: "2026-01-01T12:00:00Z" }];
  hcm.benefitPlans = [{ id: "plan-med", name: "Medical", category: "Medical", planYear: "2026", startDate: "2026-01-01", endDate: "2026-12-31", active: true, eligibilityNote: "Test", tiers: [{ id: "tier-self", name: "Employee", employeeContributionPerPayPeriod: 50, employerContributionPerPayPeriod: 100 }] }];
  hcm.benefitEnrollments = [{ id: "enroll-med", userId: "usr-jordan", planId: "plan-med", tierId: "tier-self", dependentIds: [], election: "Enroll", status: "Active", effectiveDate: "2026-01-01", event: "Open enrollment", submittedAt: "2025-12-01T12:00:00Z" }];
  const payroll = createPayrollSeed();
  payroll.payGroups = [{ id: "group-1", name: "Weekly", frequency: "Weekly", overtimeThresholdHours: 40, active: true }];
  payroll.employees = [{ userId: "usr-jordan", payGroupId: "group-1", paymentMethod: "Manual", paymentTokenLabel: "", active: true }];
  payroll.withholdingProfiles = [{ userId: "usr-jordan", federalPercent: 10, statePercent: 2, localPercent: 0, additionalWithholding: 0, postTaxDeduction: 0, effectiveDate: "2026-01-01" }];
  return { data, hcm, payroll, card };
}

test("employee-paid active benefit without payroll tax treatment blocks regular payroll instead of guessing", () => {
  const { data, hcm, payroll, card } = fixture();
  const benefits = payrollBenefitDeductions(payroll, hcm, "usr-jordan", "2026-08-07");
  assert.equal(benefits.unconfigured.length, 1);
  assert.equal(benefits.total, 0);
  assert.equal(calculateRegularLine(payroll, data, hcm, "usr-jordan", "2026-08-01", "2026-08-07", [card.id]), null);
});

test("pre-tax benefit treatment reduces taxable wages and records the deduction split", () => {
  const { data, hcm, payroll, card } = fixture();
  payroll.benefitTaxRules = [{ id: "rule-pre", planId: "plan-med", tierId: "tier-self", treatment: "Pre-tax", effectiveDate: "2026-01-01", active: true }];
  const line = calculateRegularLine(payroll, data, hcm, "usr-jordan", "2026-08-01", "2026-08-07", [card.id]);
  assert.ok(line);
  assert.equal(line?.grossPay, 160);
  assert.equal(line?.benefitDeduction, 50);
  assert.equal(line?.preTaxBenefitDeduction, 50);
  assert.equal(line?.postTaxBenefitDeduction, 0);
  assert.equal(line?.taxableWages, 110);
  assert.ok(Math.abs((line?.employeeTaxes ?? 0) - 13.2) < 0.0001);
  assert.ok(Math.abs((line?.netPay ?? 0) - 96.8) < 0.0001);
});

test("post-tax benefit treatment leaves taxable wages intact while still reducing net pay", () => {
  const { data, hcm, payroll, card } = fixture();
  payroll.benefitTaxRules = [{ id: "rule-post", planId: "plan-med", tierId: "tier-self", treatment: "Post-tax", effectiveDate: "2026-01-01", active: true }];
  const line = calculateRegularLine(payroll, data, hcm, "usr-jordan", "2026-08-01", "2026-08-07", [card.id]);
  assert.ok(line);
  assert.equal(line?.benefitDeduction, 50);
  assert.equal(line?.preTaxBenefitDeduction, 0);
  assert.equal(line?.postTaxBenefitDeduction, 50);
  assert.equal(line?.taxableWages, 160);
  assert.ok(Math.abs((line?.employeeTaxes ?? 0) - 19.2) < 0.0001);
  assert.ok(Math.abs((line?.netPay ?? 0) - 90.8) < 0.0001);
});

test("effective-dated benefit tax rules use the latest applicable configuration", () => {
  const { payroll } = fixture();
  payroll.benefitTaxRules = [
    { id: "rule-old", planId: "plan-med", tierId: "tier-self", treatment: "Pre-tax", effectiveDate: "2026-01-01", active: true },
    { id: "rule-new", planId: "plan-med", tierId: "tier-self", treatment: "Post-tax", effectiveDate: "2026-07-01", active: true },
  ];
  assert.equal(activeBenefitTaxRule(payroll, "plan-med", "tier-self", "2026-06-30")?.id, "rule-old");
  assert.equal(activeBenefitTaxRule(payroll, "plan-med", "tier-self", "2026-07-01")?.id, "rule-new");
});

test("older payroll state normalizes with an empty benefit tax rule ledger", () => {
  const normalized = normalizePayrollState({ version: 5, payGroups: [], employees: [], withholdingProfiles: [], employerTaxRules: [], runs: [], liabilities: [], disbursements: [] });
  assert.deepEqual(normalized.benefitTaxRules, []);
});
