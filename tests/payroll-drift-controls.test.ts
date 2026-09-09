import assert from "node:assert/strict";
import test from "node:test";
import { createDemoData } from "../lib/demo-data";
import { createHcmSeed } from "../lib/hcm-engine";
import { payrollRunControlIssues, payrollRunDrift } from "../lib/payroll-controls";
import { calculateRegularLine, createPayrollSeed, type PayRun } from "../lib/payroll-engine";

function fixture() {
  const base = createDemoData();
  const cardSeed = base.timecards[0];
  const entrySeed = base.timeEntries[0];
  const card = {
    ...cardSeed,
    id: "tc-approved",
    userId: "usr-jordan",
    weekStart: "2026-08-01",
    weekEnd: "2026-08-07",
    status: "Manager approved" as const,
    attested: true,
    approverId: "usr-avery",
  };
  const entry = {
    ...entrySeed,
    id: "te-approved",
    userId: "usr-jordan",
    date: "2026-08-05",
    clockIn: "09:00",
    clockOut: "17:00",
    breakMinutes: 0,
  };
  const data = { ...base, timecards: [card], timeEntries: [entry] };
  const payroll = createPayrollSeed();
  payroll.payGroups = [{ id: "group-1", name: "Weekly", frequency: "Weekly", overtimeThresholdHours: 40, active: true }];
  payroll.employees = [{ userId: "usr-jordan", payGroupId: "group-1", paymentMethod: "Manual", paymentTokenLabel: "", active: true }];
  payroll.withholdingProfiles = [{ userId: "usr-jordan", federalPercent: 10, statePercent: 2, localPercent: 0, additionalWithholding: 0, postTaxDeduction: 0, effectiveDate: "2026-01-01" }];
  const hcm = createHcmSeed(data);
  hcm.compensation = [{ id: "comp-1", userId: "usr-jordan", basis: "Hourly", rate: 20, effectiveDate: "2026-01-01", reason: "Test", status: "Active", approvedBy: "usr-mia", createdAt: "2026-01-01T12:00:00Z" }];
  const line = calculateRegularLine(payroll, data, hcm, "usr-jordan", "2026-08-01", "2026-08-07", [card.id]);
  assert.ok(line);
  const run: PayRun = { id: "run-1", kind: "Regular", createdAt: "2026-08-08T12:00:00Z", periodStart: "2026-08-01", periodEnd: "2026-08-07", payDate: "2026-08-08", status: "Draft", lines: [line!] };
  payroll.runs = [run];
  return { data, payroll, hcm, run };
}

test("a freshly built regular payroll run matches its approved sources", () => {
  const { data, payroll, hcm, run } = fixture();
  assert.deepEqual(payrollRunDrift(payroll, data, hcm, run), []);
  assert.deepEqual(payrollRunControlIssues(payroll, data, hcm, run), []);
});

test("editing an approved punch after draft creation makes the payroll run stale even while the timecard remains approved", () => {
  const { data, payroll, hcm, run } = fixture();
  const changed = { ...data, timeEntries: data.timeEntries.map((entry) => entry.id === "te-approved" ? { ...entry, clockOut: "18:00" } : entry) };
  assert.deepEqual(payrollRunDrift(payroll, changed, hcm, run), ["usr-jordan"]);
  assert.equal(payrollRunControlIssues(payroll, changed, hcm, run).some((issue) => issue.code === "stale-calculation"), true);
});

test("effective compensation changes after draft creation invalidate the stored payroll math", () => {
  const { data, payroll, hcm, run } = fixture();
  const changedHcm = { ...hcm, compensation: hcm.compensation.map((record) => record.id === "comp-1" ? { ...record, rate: 21 } : record) };
  assert.deepEqual(payrollRunDrift(payroll, data, changedHcm, run), ["usr-jordan"]);
});

test("withholding changes after draft creation invalidate taxes and net pay before release", () => {
  const { data, payroll, hcm, run } = fixture();
  const changedPayroll = { ...payroll, withholdingProfiles: payroll.withholdingProfiles.map((profile) => profile.userId === "usr-jordan" ? { ...profile, federalPercent: 12 } : profile) };
  assert.deepEqual(payrollRunDrift(changedPayroll, data, hcm, run), ["usr-jordan"]);
});

test("benefit deduction changes after draft creation invalidate the run instead of silently changing source-of-truth deductions", () => {
  const { data, payroll, hcm, run } = fixture();
  const changedHcm = {
    ...hcm,
    benefitPlans: [{ id: "plan-1", name: "Medical", category: "Medical" as const, planYear: "2026", startDate: "2026-01-01", endDate: "2026-12-31", active: true, eligibilityNote: "Test", tiers: [{ id: "tier-1", name: "Employee", employeeContributionPerPayPeriod: 50, employerContributionPerPayPeriod: 100 }] }],
    benefitEnrollments: [{ id: "enroll-1", userId: "usr-jordan", planId: "plan-1", tierId: "tier-1", dependentIds: [], election: "Enroll" as const, status: "Active" as const, effectiveDate: "2026-01-01", event: "Open enrollment" as const, submittedAt: "2025-12-01T12:00:00Z" }],
  };
  assert.deepEqual(payrollRunDrift(payroll, data, changedHcm, run), ["usr-jordan"]);
});
