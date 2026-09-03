import assert from "node:assert/strict";
import test from "node:test";
import {
  canRecordSettlementDate,
  createCommerceSeed,
  creditCanApply,
  creditCanApprove,
  invoiceBalance,
  invoiceCanVoid,
  invoicePendingAmount,
  invoiceRecordableAmount,
  paymentSettlementDate,
  refundCanApprove,
  refundCanFail,
  refundCanRequest,
  refundCanSend,
  refundCanSettle,
  refundRemainingAmount,
  type CreditMemo,
  type Payment,
  type PaymentAllocation,
  type Refund,
} from "../lib/commerce-engine";
import { createDemoData } from "../lib/demo-data";

function openInvoiceState() {
  const data = createDemoData();
  const source = data.orders.find((order) => order.id === "ord-1049")!;
  const order = { ...source, status: "Approved" as const, paymentStatus: "Open" as const };
  const workspace = { ...data, orders: data.orders.map((item) => item.id === order.id ? order : item) };
  const state = createCommerceSeed(workspace);
  const invoice = state.invoices.find((item) => item.orderId === order.id)!;
  return { state, invoice };
}

const payment = (id: string, accountId: string, amount: number, status: Payment["status"], settledAt?: string): Payment => ({
  id,
  accountId,
  amount,
  method: "ACH",
  status,
  receivedAt: "2026-09-03T15:00:00Z",
  settledAt,
  createdBy: "test",
  createdAt: "2026-09-03T15:00:00Z",
});

const allocation = (id: string, paymentId: string, invoiceId: string, amount: number): PaymentAllocation => ({
  id,
  paymentId,
  invoiceId,
  amount,
  createdBy: "test",
  createdAt: "2026-09-03T15:00:00Z",
});

test("pending payment allocations reserve receivable capacity without pretending cash settled", () => {
  const { state, invoice } = openInvoiceState();
  const pending = payment("pending-1", invoice.accountId, 100, "Pending");
  const pendingAllocation = allocation("alloc-pending", pending.id, invoice.id, pending.amount);
  const withPending = { ...state, payments: [pending], allocations: [pendingAllocation] };

  assert.equal(invoiceBalance(withPending, invoice), invoice.total);
  assert.equal(invoicePendingAmount(withPending, invoice.id), 100);
  assert.equal(invoiceRecordableAmount(withPending, invoice), invoice.total - 100);
});

test("settlement evidence uses the actual settlement date rather than the entry timestamp", () => {
  const cleared = payment("cleared", "acc-101", 240, "Cleared", "2026-08-30");
  assert.equal(paymentSettlementDate(cleared), "2026-08-30");
  assert.equal(canRecordSettlementDate("2020-01-01"), true);
  assert.equal(canRecordSettlementDate("2099-01-01"), false);
  assert.equal(canRecordSettlementDate(undefined), false);
});

test("credit approval requires a different authorized actor than the creator", () => {
  const credit: CreditMemo = { id: "credit-independent", invoiceId: "invoice-1", amount: 25, reason: "Documented billing correction", status: "Draft", createdAt: "2026-09-03T12:00:00Z", createdBy: "usr-elena" };
  assert.equal(creditCanApprove(credit, "usr-elena"), false);
  assert.equal(creditCanApprove(credit, "usr-mia"), true);
  assert.equal(creditCanApprove({ ...credit, status: "Approved" }, "usr-mia"), false);
});

test("an approved credit cannot be applied after later settlement consumes the receivable", () => {
  const { state, invoice } = openInvoiceState();
  const credit: CreditMemo = { id: "credit-1", invoiceId: invoice.id, amount: 100, reason: "Documented billing correction", status: "Approved", createdAt: "2026-09-03T12:00:00Z", createdBy: "usr-elena", approvedBy: "usr-mia", approvedAt: "2026-09-03T13:00:00Z" };
  const withCredit = { ...state, credits: [credit] };
  assert.equal(creditCanApply(withCredit, credit), true);

  const cleared = payment("paid-full", invoice.accountId, invoice.total, "Cleared", "2026-09-03");
  const clearedAllocation = allocation("alloc-full", cleared.id, invoice.id, cleared.amount);
  const settled = { ...withCredit, payments: [cleared], allocations: [clearedAllocation] };
  assert.equal(creditCanApply(settled, credit), false);
});

test("refund requests require verified-quality evidence and cannot exceed uncommitted cleared funds", () => {
  const { state, invoice } = openInvoiceState();
  const cleared = payment("quality-payment", invoice.accountId, 240, "Cleared", "2026-09-02");
  const clearedAllocation = allocation("quality-allocation", cleared.id, invoice.id, cleared.amount);
  const paid = { ...state, payments: [cleared], allocations: [clearedAllocation] };

  assert.equal(refundCanRequest(paid, cleared.id, 24, "Verified damaged product", ""), false);
  assert.equal(refundCanRequest(paid, cleared.id, 24, "Verified damaged product", "Lot inspection and delivery photos reviewed"), true);

  const existing: Refund = { id: "refund-existing", paymentId: cleared.id, amount: 200, reason: "Verified quality issue", basis: "Verified quality issue", evidence: "Inspection record", status: "Requested", createdAt: "2026-09-03T14:00:00Z", createdBy: "usr-elena" };
  const committed = { ...paid, refunds: [existing] };
  assert.equal(refundRemainingAmount(committed, cleared.id), 40);
  assert.equal(refundCanRequest(committed, cleared.id, 41, "Second verified issue", "Additional evidence"), false);
});

test("refund approval, send, settlement, and failure each require their own evidence", () => {
  const requested: Refund = { id: "refund-lifecycle", paymentId: "payment-1", amount: 24, reason: "Verified quality issue", basis: "Verified quality issue", evidence: "Inspection record", status: "Requested", createdAt: "2026-09-01T12:00:00Z", createdBy: "usr-elena" };
  assert.equal(refundCanApprove(requested, "usr-elena"), false);
  assert.equal(refundCanApprove(requested, "usr-mia"), true);

  const approved: Refund = { ...requested, status: "Approved", approvedBy: "usr-mia", approvedAt: "2026-09-02T10:00:00Z" };
  assert.equal(refundCanSend(approved, ""), false);
  assert.equal(refundCanSend(approved, "ACH-TRACE-123"), true);

  const sent: Refund = { ...approved, status: "Sent", sentReference: "ACH-TRACE-123", sentAt: "2026-09-03T09:00:00Z", sentBy: "usr-elena" };
  assert.equal(refundCanSettle(sent, "2026-09-02"), false);
  assert.equal(refundCanSettle(sent, "2026-09-03"), true);
  assert.equal(refundCanSettle(sent, "2099-01-01"), false);
  assert.equal(refundCanFail(sent, ""), false);
  assert.equal(refundCanFail(sent, "Bank return"), true);
});

test("invoice void is blocked while money or active credits still point at the invoice", () => {
  const { state, invoice } = openInvoiceState();
  assert.equal(invoiceCanVoid(state, invoice.id), true);

  const pending = payment("void-pending", invoice.accountId, 50, "Pending");
  const pendingAllocation = allocation("void-allocation", pending.id, invoice.id, pending.amount);
  assert.equal(invoiceCanVoid({ ...state, payments: [pending], allocations: [pendingAllocation] }, invoice.id), false);

  const credit: CreditMemo = { id: "void-credit", invoiceId: invoice.id, amount: 25, reason: "Billing correction", status: "Draft", createdAt: "2026-09-03T12:00:00Z", createdBy: "usr-elena" };
  assert.equal(invoiceCanVoid({ ...state, credits: [credit] }, invoice.id), false);
});
