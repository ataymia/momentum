import assert from "node:assert/strict";
import test from "node:test";
import { buildPayrollJournal, buildPayrollVoidJournal, createAccountingSeed, journalBalanced, sourceEvents, unprocessedSourceEvents } from "../lib/accounting-engine";
import type { CommerceState } from "../lib/commerce-engine";
import { createDemoData } from "../lib/demo-data";
import { createInventoryLedgerSeed } from "../lib/inventory-ledger";
import { createPayrollSeed, type PayRun } from "../lib/payroll-engine";

const payrollLine = {
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
  sourceTimecardIds: ["tc-1"],
  sourceBonusIds: [],
};

const releasedRun = (): PayRun => ({
  id: "run-accounting-correction",
  kind: "Regular",
  createdAt: "2026-09-01T10:00:00Z",
  periodStart: "2026-08-24",
  periodEnd: "2026-08-30",
  payDate: "2026-09-01",
  status: "Released",
  approvedAt: "2026-09-01T11:00:00Z",
  approvedBy: "usr-mia",
  releasedAt: "2026-09-01T12:00:00Z",
  releasedBy: "usr-mia",
  lines: [payrollLine],
});

const emptyCommerce: CommerceState = { version: 1, invoices: [], payments: [], allocations: [], credits: [], refunds: [], notes: [] };
const inventory = createInventoryLedgerSeed(createDemoData());

test("voided payroll creates a balanced reversal of the posted payroll journal", () => {
  const accounting = createAccountingSeed();
  const release = buildPayrollJournal(accounting, releasedRun(), "usr-mia");
  assert.ok(release);
  const posted = { ...release!, status: "Posted" as const, postedAt: "2026-09-01T13:00:00Z", postedBy: "usr-mia" };
  const withPosted = { ...accounting, journals: [posted] };
  const voided: PayRun = { ...releasedRun(), status: "Voided", voidedAt: "2026-09-03T09:30:00Z", voidedBy: "usr-mia", voidReason: "Approved time source changed" };
  const reversal = buildPayrollVoidJournal(withPosted, voided, "usr-mia");
  assert.ok(reversal);
  assert.equal(reversal?.sourceType, "Payroll voided");
  assert.equal(reversal?.date, "2026-09-03");
  assert.equal(journalBalanced(reversal!), true);
  assert.deepEqual(reversal?.lines.map((line) => [line.debit, line.credit]), posted.lines.map((line) => [line.credit, line.debit]));
});

test("a draft payroll journal is not treated as posted money that needs a reversal entry", () => {
  const accounting = createAccountingSeed();
  const draft = buildPayrollJournal(accounting, releasedRun(), "usr-mia");
  assert.ok(draft);
  const voided: PayRun = { ...releasedRun(), status: "Voided", voidedAt: "2026-09-03T09:30:00Z", voidedBy: "usr-mia", voidReason: "Correction" };
  assert.equal(buildPayrollVoidJournal({ ...accounting, journals: [draft!] }, voided, "usr-mia"), null);
});

test("voided payroll remains a distinct accounting source event even when the release journal used the same run id", () => {
  const payroll = createPayrollSeed();
  const voided: PayRun = { ...releasedRun(), status: "Voided", voidedAt: "2026-09-03T09:30:00Z", voidedBy: "usr-mia", voidReason: "Correction" };
  payroll.runs = [voided];
  const accounting = createAccountingSeed();
  const release = buildPayrollJournal(accounting, releasedRun(), "usr-mia");
  assert.ok(release);
  const posted = { ...release!, status: "Posted" as const, postedAt: "2026-09-01T13:00:00Z", postedBy: "usr-mia" };
  const state = { ...accounting, journals: [posted] };
  const events = sourceEvents(emptyCommerce, inventory, payroll);
  const payrollVoid = events.find((event) => event.type === "Payroll voided" && event.sourceId === voided.id);
  assert.equal(payrollVoid?.date, "2026-09-03");
  assert.equal(unprocessedSourceEvents(state, events).some((event) => event.type === "Payroll voided" && event.sourceId === voided.id), true);
});
