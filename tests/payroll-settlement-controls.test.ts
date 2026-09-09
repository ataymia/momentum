import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { disbursementCanRecordFailure, disbursementCanRecordSettlement, disbursementCanRetry, disbursementRecord, liabilityCanRecordPaid, liabilityCanSchedule, taxLiabilityRecord, validSettlementDate } from "../lib/payroll-settlement-controls";
import type { Disbursement, TaxLiability } from "../lib/payroll-engine";

const liability = (status: TaxLiability["status"]): TaxLiability => ({ id: "tax-1", payRunId: "run-1", type: "Federal employee", amount: 100, status, createdAt: "2026-09-01T12:00:00Z" });
const disbursement = (status: Disbursement["status"]): Disbursement => ({ id: "disb-1", payRunId: "run-1", userId: "usr-1", amount: 700, method: "ACH", tokenLabel: "ending 1234", status, createdAt: "2026-09-01T12:00:00Z" });

test("settlement evidence dates cannot be future dates", () => {
  assert.equal(validSettlementDate("2026-09-09", "2026-09-09"), true);
  assert.equal(validSettlementDate("2026-09-08", "2026-09-09"), true);
  assert.equal(validSettlementDate("2026-09-10", "2026-09-09"), false);
  assert.equal(validSettlementDate("09/09/2026", "2026-09-09"), false);
});

test("payroll settlement and payroll UI default business dates to Arizona", () => {
  const controls = readFileSync(new URL("../lib/payroll-settlement-controls.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../components/pages/payroll-v2.tsx", import.meta.url), "utf8");
  assert.match(controls, /const today = \(\) => arizonaDateKey\(\)/);
  assert.doesNotMatch(controls, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
  assert.match(page, /const today = \(\) => arizonaDateKey\(\)/);
  assert.doesNotMatch(page, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
});

test("tax liability follows accrued to scheduled to paid and paid evidence is mandatory", () => {
  assert.equal(liabilityCanSchedule(liability("Accrued")), true);
  assert.equal(liabilityCanSchedule(liability("Scheduled")), false);
  assert.equal(liabilityCanRecordPaid(liability("Scheduled"), "IRS-TRACE-1", "2026-09-09", "2026-09-09"), true);
  assert.equal(liabilityCanRecordPaid(liability("Scheduled"), "", "2026-09-09", "2026-09-09"), false);
  assert.equal(liabilityCanRecordPaid(liability("Accrued"), "IRS-TRACE-1", "2026-09-09", "2026-09-09"), false);
});

test("released employee payment requires external evidence to settle or a reason to fail", () => {
  assert.equal(disbursementCanRecordSettlement(disbursement("Released"), "ACH-SETTLED-1", "2026-09-09", "2026-09-09"), true);
  assert.equal(disbursementCanRecordSettlement(disbursement("Released"), "", "2026-09-09", "2026-09-09"), false);
  assert.equal(disbursementCanRecordSettlement(disbursement("Failed"), "ACH-SETTLED-1", "2026-09-09", "2026-09-09"), false);
  assert.equal(disbursementCanRecordFailure(disbursement("Released"), "Bank returned ACH"), true);
  assert.equal(disbursementCanRecordFailure(disbursement("Released"), ""), false);
});

test("a failed disbursement can be retried only once until its replacement relationship is resolved", () => {
  assert.equal(disbursementCanRetry(disbursement("Failed")), true);
  const replaced = { ...disbursement("Failed"), replacedBy: "disb-2" };
  assert.equal(disbursementCanRetry(replaced), false);
  assert.equal(disbursementRecord(replaced).replacedBy, "disb-2");
});

test("extended payroll evidence fields remain readable from normalized base records", () => {
  const paid = { ...liability("Paid"), paidAt: "2026-09-09", paidBy: "usr-mia", paymentReference: "TRACE-9" };
  const settled = { ...disbursement("Settled"), settledAt: "2026-09-09", settlementReference: "ACH-9" };
  assert.equal(taxLiabilityRecord(paid).paymentReference, "TRACE-9");
  assert.equal(disbursementRecord(settled).settlementReference, "ACH-9");
});
