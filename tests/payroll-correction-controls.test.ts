import assert from "node:assert/strict";
import test from "node:test";
import { payrollCorrectionBlockers, voidPayrollRunForCorrection } from "../lib/payroll-controls";
import { consumedTimecards, createPayrollSeed, type PayRun } from "../lib/payroll-engine";

const run = (status: PayRun["status"]): PayRun => ({
  id: "run-correction",
  kind: "Regular",
  createdAt: "2026-09-01T12:00:00Z",
  periodStart: "2026-08-24",
  periodEnd: "2026-08-30",
  payDate: "2026-09-01",
  status,
  lines: [{
    employeeId: "usr-jordan",
    regularHours: 40,
    overtimeHours: 0,
    regularPay: 800,
    overtimePay: 0,
    bonusPay: 0,
    grossPay: 800,
    benefitDeduction: 0,
    taxableWages: 800,
    federalTax: 80,
    stateTax: 20,
    localTax: 0,
    additionalWithholding: 0,
    postTaxDeduction: 0,
    employeeTaxes: 100,
    employerTaxes: 60,
    netPay: 700,
    sourceTimecardIds: ["tc-correction"],
    sourceBonusIds: [],
  }],
});

test("voiding a stale draft frees its timecard source for a corrected payroll draft", () => {
  const payroll = createPayrollSeed();
  payroll.runs = [run("Draft")];
  assert.equal(consumedTimecards(payroll).has("tc-correction"), true);
  const corrected = voidPayrollRunForCorrection(payroll, "run-correction", "usr-mia", "Approved punch changed", "2026-09-02T12:00:00Z");
  assert.ok(corrected);
  assert.equal(corrected?.runs[0].status, "Voided");
  assert.equal(corrected?.runs[0].voidReason, "Approved punch changed");
  assert.equal(consumedTimecards(corrected!).has("tc-correction"), false);
});

test("an unsettled released payroll run can be voided for correction and its internal obligations are reversed", () => {
  const payroll = createPayrollSeed();
  payroll.runs = [run("Released")];
  payroll.disbursements = [{ id: "disb-1", payRunId: "run-correction", userId: "usr-jordan", amount: 700, method: "ACH", tokenLabel: "ending 1234", status: "Released", createdAt: "2026-09-01T12:00:00Z" }];
  payroll.liabilities = [{ id: "tax-1", payRunId: "run-correction", type: "Federal employee", amount: 80, status: "Accrued", createdAt: "2026-09-01T12:00:00Z" }];
  assert.deepEqual(payrollCorrectionBlockers(payroll, payroll.runs[0]), []);
  const corrected = voidPayrollRunForCorrection(payroll, "run-correction", "usr-mia", "Source no longer valid", "2026-09-02T12:00:00Z");
  assert.equal(corrected?.runs[0].status, "Voided");
  assert.equal(corrected?.disbursements[0].status, "Voided");
  assert.equal(corrected?.liabilities[0].status, "Reversed");
});

test("settled employee money blocks silent payroll voiding", () => {
  const payroll = createPayrollSeed();
  payroll.runs = [run("Released")];
  payroll.disbursements = [{ id: "disb-1", payRunId: "run-correction", userId: "usr-jordan", amount: 700, method: "ACH", tokenLabel: "ending 1234", status: "Settled", createdAt: "2026-09-01T12:00:00Z", settledAt: "2026-09-01T18:00:00Z" }];
  assert.equal(payrollCorrectionBlockers(payroll, payroll.runs[0]).some((item) => item.includes("settled")), true);
  assert.equal(voidPayrollRunForCorrection(payroll, "run-correction", "usr-mia", "Correction needed"), null);
});

test("paid payroll tax liability blocks silent payroll voiding", () => {
  const payroll = createPayrollSeed();
  payroll.runs = [run("Released")];
  payroll.liabilities = [{ id: "tax-1", payRunId: "run-correction", type: "Federal employee", amount: 80, status: "Paid", createdAt: "2026-09-01T12:00:00Z" }];
  assert.equal(payrollCorrectionBlockers(payroll, payroll.runs[0]).some((item) => item.includes("paid")), true);
  assert.equal(voidPayrollRunForCorrection(payroll, "run-correction", "usr-mia", "Correction needed"), null);
});
