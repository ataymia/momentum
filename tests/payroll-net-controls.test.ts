import assert from "node:assert/strict";
import test from "node:test";
import { createDemoData } from "../lib/demo-data";
import { createHcmSeed } from "../lib/hcm-engine";
import { calculateRegularLine, createPayrollSeed, type PayrollState } from "../lib/payroll-engine";

function fixture() {
  const base = createDemoData();
  const cardSeed = base.timecards[0];
  const entrySeed = base.timeEntries[0];
  const card = { ...cardSeed, id: "tc-approved", userId: "usr-jordan", weekStart: "2026-08-01", weekEnd: "2026-08-07", status: "Manager approved" as const, attested: true, approverId: "usr-avery" };
  const entry = { ...entrySeed, id: "te-approved", userId: "usr-jordan", date: "2026-08-05", clockIn: "09:00", clockOut: "17:00", breakMinutes: 0 };
  const data = { ...base, timecards: [card], timeEntries: [entry] };
  const hcm = createHcmSeed(data);
  hcm.compensation = [{ id: "comp-1", userId: "usr-jordan", basis: "Hourly", rate: 20, effectiveDate: "2026-01-01", reason: "Test", status: "Active", approvedBy: "usr-mia", createdAt: "2026-01-01T12:00:00Z" }];
  const payroll = createPayrollSeed();
  payroll.payGroups = [{ id: "group-1", name: "Weekly", frequency: "Weekly", overtimeThresholdHours: 40, active: true }];
  payroll.employees = [{ userId: "usr-jordan", payGroupId: "group-1", paymentMethod: "Manual", paymentTokenLabel: "", active: true }];
  payroll.withholdingProfiles = [{ userId: "usr-jordan", federalPercent: 10, statePercent: 2, localPercent: 0, additionalWithholding: 0, postTaxDeduction: 0, effectiveDate: "2026-01-01" }];
  return { data, hcm, payroll, card };
}

const line = (payroll: PayrollState, data: ReturnType<typeof createDemoData>, hcm: ReturnType<typeof createHcmSeed>, cardId = "tc-approved") => calculateRegularLine(payroll, data, hcm, "usr-jordan", "2026-08-01", "2026-08-07", [cardId]);

test("negative withholding or deduction configuration blocks payroll instead of creating negative tax math", () => {
  const { data, hcm, payroll, card } = fixture();
  payroll.withholdingProfiles[0] = { ...payroll.withholdingProfiles[0], federalPercent: -1 };
  assert.equal(line(payroll, data, hcm, card.id), null);

  payroll.withholdingProfiles[0] = { ...payroll.withholdingProfiles[0], federalPercent: 10, postTaxDeduction: -5 };
  assert.equal(line(payroll, data, hcm, card.id), null);
});

test("negative employer payroll tax rate blocks the line", () => {
  const { data, hcm, payroll, card } = fixture();
  payroll.employerTaxRules = [{ id: "bad-employer-tax", name: "Bad rule", percent: -2, effectiveDate: "2026-01-01", active: true }];
  assert.equal(line(payroll, data, hcm, card.id), null);
});

test("deductions that exceed gross pay block payroll rather than clamping net pay to zero", () => {
  const { data, hcm, payroll, card } = fixture();
  payroll.withholdingProfiles[0] = { ...payroll.withholdingProfiles[0], postTaxDeduction: 500 };
  assert.equal(line(payroll, data, hcm, card.id), null);
});

test("pre-tax benefits cannot exceed gross wages", () => {
  const { data, hcm, payroll, card } = fixture();
  hcm.benefitPlans = [{ id: "plan-1", name: "Test benefit", category: "Medical", planYear: "2026", startDate: "2026-01-01", endDate: "2026-12-31", active: true, eligibilityNote: "Test", tiers: [{ id: "tier-1", name: "Employee", employeeContributionPerPayPeriod: 200, employerContributionPerPayPeriod: 0 }] }];
  hcm.benefitEnrollments = [{ id: "enroll-1", userId: "usr-jordan", planId: "plan-1", tierId: "tier-1", dependentIds: [], election: "Enroll", status: "Active", effectiveDate: "2026-01-01", event: "Open enrollment", submittedAt: "2025-12-01T12:00:00Z" }];
  payroll.benefitTaxRules = [{ id: "rule-1", planId: "plan-1", tierId: "tier-1", treatment: "Pre-tax", effectiveDate: "2026-01-01", active: true }];
  assert.equal(line(payroll, data, hcm, card.id), null);
});
