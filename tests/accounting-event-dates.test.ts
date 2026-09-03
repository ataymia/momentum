import assert from "node:assert/strict";
import test from "node:test";
import { sourceEvents } from "../lib/accounting-engine";
import type { CommerceState, CreditMemo, Invoice, Payment } from "../lib/commerce-engine";
import { createDemoData } from "../lib/demo-data";
import { createInventoryLedgerSeed } from "../lib/inventory-ledger";

const invoice: Invoice = {
  id: "invoice-date-test",
  number: "INV-DATE",
  orderId: "order-date-test",
  accountId: "acc-101",
  issuedAt: "2026-09-01T17:30:00Z",
  terms: "Prepaid",
  total: 240,
  status: "Open",
  createdAt: "2026-09-01T17:30:00Z",
};

const baseCommerce = (): CommerceState => ({ version: 1, invoices: [invoice], payments: [], allocations: [], credits: [], refunds: [], notes: [] });

const inventory = createInventoryLedgerSeed(createDemoData());

test("accounting posts cleared cash on the actual settlement date, not the later entry timestamp", () => {
  const payment: Payment = {
    id: "payment-date-test",
    accountId: invoice.accountId,
    receivedAt: "2026-09-03T18:00:00Z",
    settledAt: "2026-08-30",
    amount: 240,
    method: "ACH",
    status: "Cleared",
    createdBy: "usr-elena",
    createdAt: "2026-09-03T18:00:00Z",
  };
  const event = sourceEvents({ ...baseCommerce(), payments: [payment] }, inventory).find((item) => item.sourceId === payment.id);
  assert.equal(event?.type, "Payment cleared");
  assert.equal(event?.date, "2026-08-30");
});

test("a reversed cleared payment stays visible to accounting on the reversal date", () => {
  const payment: Payment = {
    id: "payment-reversal-test",
    accountId: invoice.accountId,
    receivedAt: "2026-08-30T18:00:00Z",
    settledAt: "2026-08-30",
    settledBy: "usr-elena",
    reversedAt: "2026-09-03T16:00:00Z",
    reversedBy: "usr-mia",
    amount: 240,
    method: "ACH",
    status: "Reversed",
    createdBy: "usr-elena",
    createdAt: "2026-08-30T18:00:00Z",
  };
  const event = sourceEvents({ ...baseCommerce(), payments: [payment] }, inventory).find((item) => item.type === "Payment reversed" && item.sourceId === payment.id);
  assert.equal(event?.date, "2026-09-03");
  assert.equal(event?.amount, 240);
  assert.match(event?.blockedReason ?? "", /approved treatment/i);
});

test("accounting dates an applied credit when it is applied, not when it was approved", () => {
  const credit: CreditMemo = {
    id: "credit-date-test",
    invoiceId: invoice.id,
    amount: 24,
    reason: "Documented billing correction",
    status: "Applied",
    createdAt: "2026-09-01T10:00:00Z",
    createdBy: "usr-elena",
    approvedAt: "2026-09-02T10:00:00Z",
    approvedBy: "usr-mia",
    appliedAt: "2026-09-03T10:00:00Z",
  };
  const event = sourceEvents({ ...baseCommerce(), credits: [credit] }, inventory).find((item) => item.sourceId === credit.id);
  assert.equal(event?.type, "Credit applied");
  assert.equal(event?.date, "2026-09-03");
});

test("invoice accounting event uses the invoice issue timestamp", () => {
  const event = sourceEvents(baseCommerce(), inventory).find((item) => item.sourceId === invoice.id);
  assert.equal(event?.type, "Invoice issued");
  assert.equal(event?.date, "2026-09-01");
});
