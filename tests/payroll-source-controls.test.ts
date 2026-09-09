import assert from "node:assert/strict";
import test from "node:test";
import { createDemoData } from "../lib/demo-data";
import { createHcmSeed } from "../lib/hcm-engine";
import { calculateRegularLine, createPayrollSeed, invalidTimecardSourcesForRun, regularPayrollSource, type PayRun } from "../lib/payroll-engine";

function payrollFixture() {
  const base = createDemoData();
  const timecardSeed = base.timecards[0];
  const entrySeed = base.timeEntries[0];
  const approved = {
    ...timecardSeed,
    id: "tc-approved",
    userId: "usr-jordan",
    weekStart: "2026-08-01",
    weekEnd: "2026-08-07",
    status: "Manager approved" as const,
    attested: true,
    approverId: "usr-avery",
  };
  const open = {
    ...timecardSeed,
    id: "tc-open",
    userId: "usr-jordan",
    weekStart: "2026-08-08",
    weekEnd: "2026-08-14",
    status: "Open" as const,
    attested: false,
    approverId: undefined,
  };
  const approvedEntry = {
    ...entrySeed,
    id: "te-approved",
    userId: "usr-jordan",
    date: "2026-08-05",
    clockIn: "09:00",
    clockOut: "17:00",
    breakMinutes: 0,
  };
  const openEntry = {
    ...entrySeed,
    id: "te-open",
    userId: "usr-jordan",
    date: "2026-08-10",
    clockIn: "09:00",
    clockOut: "17:00",
    breakMinutes: 0,
  };
  return { data: { ...base, timecards: [approved, open], timeEntries: [approvedEntry, openEntry] }, approved, open };
}

function configuredPayroll(data: ReturnType<typeof createDemoData>) {
  const payroll = createPayrollSeed();
  payroll.payGroups = [{ id: "group-1", name: "Configured", frequency: "Biweekly", overtimeThresholdHours: 40, active: true }];
  payroll.employees = [{ userId: "usr-jordan", payGroupId: "group-1", paymentMethod: "Manual", paymentTokenLabel: "", active: true }];
  payroll.withholdingProfiles = [{ userId: "usr-jordan", federalPercent: 0, statePercent: 0, localPercent: 0, additionalWithholding: 0, postTaxDeduction: 0, effectiveDate: "2026-01-01" }];
  const hcm = createHcmSeed(data);
  hcm.compensation = [{ id: "comp-1", userId: "usr-jordan", basis: "Hourly", rate: 20, effectiveDate: "2026-01-01", reason: "Test", status: "Active", approvedBy: "usr-mia", createdAt: "2026-01-01T12:00:00Z" }];
  return { payroll, hcm };
}

function runWithSource(timecardId: string): PayRun {
  return {
    id: "run-regular",
    kind: "Regular",
    createdAt: "2026-08-15T12:00:00Z",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-14",
    payDate: "2026-08-15",
    status: "Draft",
    lines: [{
      employeeId: "usr-jordan",
      regularHours: 8,
      overtimeHours: 0,
      regularPay: 160,
      overtimePay: 0,
      bonusPay: 0,
      grossPay: 160,
      benefitDeduction: 0,
      taxableWages: 160,
      federalTax: 0,
      stateTax: 0,
      localTax: 0,
      additionalWithholding: 0,
      postTaxDeduction: 0,
      employeeTaxes: 0,
      employerTaxes: 0,
      netPay: 160,
      sourceTimecardIds: [timecardId],
      sourceBonusIds: [],
    }],
  };
}

test("regular payroll source includes only entries inside the approved source timecard windows", () => {
  const { data } = payrollFixture();
  const source = regularPayrollSource(data, "usr-jordan", "2026-08-01", "2026-08-14", ["tc-approved", "tc-approved"]);
  assert.deepEqual(source?.timecardIds, ["tc-approved"]);
  assert.deepEqual(source?.entries.map((entry) => entry.id), ["te-approved"]);
});

test("open, returned, missing, wrong-employee, and out-of-period timecards cannot source regular payroll", () => {
  const { data, approved } = payrollFixture();
  assert.equal(regularPayrollSource(data, "usr-jordan", "2026-08-01", "2026-08-14", ["tc-open"]), null);
  assert.equal(regularPayrollSource(data, "usr-jordan", "2026-08-01", "2026-08-14", ["missing"]), null);
  assert.equal(regularPayrollSource(data, "usr-elena", "2026-08-01", "2026-08-14", ["tc-approved"]), null);
  assert.equal(regularPayrollSource(data, "usr-jordan", "2026-08-02", "2026-08-14", ["tc-approved"]), null);
  const returnedData = { ...data, timecards: data.timecards.map((card) => card.id === approved.id ? { ...card, status: "Returned" as const } : card) };
  assert.equal(regularPayrollSource(returnedData, "usr-jordan", "2026-08-01", "2026-08-14", ["tc-approved"]), null);
});

test("overlapping source timecards are rejected instead of double-counting the same work date", () => {
  const { data, approved } = payrollFixture();
  const overlap = { ...approved, id: "tc-overlap", weekStart: "2026-08-07", weekEnd: "2026-08-13" };
  const overlapped = { ...data, timecards: [approved, overlap] };
  assert.equal(regularPayrollSource(overlapped, "usr-jordan", "2026-08-01", "2026-08-14", [approved.id, overlap.id]), null);
});

test("regular payroll calculation cannot leak hours from an unapproved week in the same pay-period range", () => {
  const { data } = payrollFixture();
  const { payroll, hcm } = configuredPayroll(data);
  const line = calculateRegularLine(payroll, data, hcm, "usr-jordan", "2026-08-01", "2026-08-14", ["tc-approved"]);
  assert.equal(line?.regularHours, 8);
  assert.equal(line?.grossPay, 160);
  assert.deepEqual(line?.sourceTimecardIds, ["tc-approved"]);
});

test("biweekly payroll applies the configured overtime threshold separately to each approved workweek", () => {
  const base = createDemoData();
  const timecardSeed = base.timecards[0];
  const entrySeed = base.timeEntries[0];
  const first = { ...timecardSeed, id: "tc-week-1", userId: "usr-jordan", weekStart: "2026-08-01", weekEnd: "2026-08-07", status: "Manager approved" as const, attested: true, approverId: "usr-avery" };
  const second = { ...timecardSeed, id: "tc-week-2", userId: "usr-jordan", weekStart: "2026-08-08", weekEnd: "2026-08-14", status: "Manager approved" as const, attested: true, approverId: "usr-avery" };
  const dates = ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-08", "2026-08-09", "2026-08-10", "2026-08-11", "2026-08-12"];
  const entries = dates.map((date, index) => ({ ...entrySeed, id: `te-${index + 1}`, userId: "usr-jordan", date, clockIn: "09:00", clockOut: "17:00", breakMinutes: 0 }));
  const data = { ...base, timecards: [first, second], timeEntries: entries };
  const { payroll, hcm } = configuredPayroll(data);
  const line = calculateRegularLine(payroll, data, hcm, "usr-jordan", "2026-08-01", "2026-08-14", [first.id, second.id]);
  assert.equal(line?.regularHours, 80);
  assert.equal(line?.overtimeHours, 0);
  assert.equal(line?.grossPay, 1600);
});

test("a regular run is blocked if its source timecard later leaves payroll-ready status", () => {
  const { data } = payrollFixture();
  const run = runWithSource("tc-approved");
  assert.deepEqual(invalidTimecardSourcesForRun(run, data), []);
  const returnedData = { ...data, timecards: data.timecards.map((card) => card.id === "tc-approved" ? { ...card, status: "Returned" as const } : card) };
  assert.deepEqual(invalidTimecardSourcesForRun(run, returnedData), ["tc-approved"]);
});
