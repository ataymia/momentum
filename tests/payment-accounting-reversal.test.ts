import assert from "node:assert/strict";
import test from "node:test";
import { buildJournalFromEvent, buildPaymentReversalJournal, createAccountingSeed, journalBalanced, sourceEvents, unprocessedSourceEvents, type AccountingSourceEvent } from "../lib/accounting-engine";
import type { CommerceState, Payment } from "../lib/commerce-engine";
import { createDemoData } from "../lib/demo-data";
import { createInventoryLedgerSeed } from "../lib/inventory-ledger";

const clearedPayment = (): Payment => ({
  id: "payment-reversal-accounting",
  accountId: "acc-101",
  receivedAt: "2026-09-01T12:00:00Z",
  settledAt: "2026-09-01",
  settledBy: "usr-mia",
  amount: 240,
  method: "ACH",
  status: "Cleared",
  createdBy: "usr-mia",
  createdAt: "2026-09-01T12:00:00Z",
});

const reversedPayment = (): Payment => ({
  ...clearedPayment(),
  status: "Reversed",
  reversedAt: "2026-09-03T09:15:00Z",
  reversedBy: "usr-mia",
  reversalReason: "Bank returned ACH",
  reversalReference: "RETURN-001",
});

const paymentEvent: AccountingSourceEvent = {
  id: "payment:payment-reversal-accounting",
  type: "Payment cleared",
  date: "2026-09-01",
  amount: 240,
  description: "Cleared ACH payment",
  sourceId: "payment-reversal-accounting",
};

const configuredAccounting = () => {
  const state = createAccountingSeed();
  state.rules = [{ id: "rule-payment", eventType: "Payment cleared", debitAccountId: "acct-cash", creditAccountId: "acct-ar", effectiveDate: "2026-01-01", active: true, memoTemplate: "{description}" }];
  return state;
};

const inventory = createInventoryLedgerSeed(createDemoData());
const commerce = (payment: Payment): CommerceState => ({ version: 1, invoices: [], payments: [payment], allocations: [], credits: [], refunds: [], notes: [] });

test("a reversed payment creates an equal-and-opposite journal from the posted cleared-payment journal", () => {
  const accounting = configuredAccounting();
  const clearedJournal = buildJournalFromEvent(accounting, paymentEvent, "usr-mia");
  assert.ok(clearedJournal);
  const posted = { ...clearedJournal!, status: "Posted" as const, postedAt: "2026-09-01T13:00:00Z", postedBy: "usr-mia" };
  const withPosted = { ...accounting, journals: [posted] };
  const reversal = buildPaymentReversalJournal(withPosted, reversedPayment(), "usr-mia");
  assert.ok(reversal);
  assert.equal(reversal?.sourceType, "Payment reversed");
  assert.equal(reversal?.date, "2026-09-03");
  assert.equal(journalBalanced(reversal!), true);
  assert.deepEqual(reversal?.lines.map((line) => [line.debit, line.credit]), posted.lines.map((line) => [line.credit, line.debit]));
});

test("payment reversal is a system-built accounting event rather than a configurable debit-credit rule", () => {
  const event = sourceEvents(commerce(reversedPayment()), inventory).find((item) => item.type === "Payment reversed");
  assert.ok(event);
  assert.equal(event?.blockedReason, undefined);
  assert.equal(buildJournalFromEvent(configuredAccounting(), event!, "usr-mia"), null);
});

test("payment reversal remains unprocessed even when the original cleared-payment journal has the same payment id", () => {
  const accounting = configuredAccounting();
  const clearedJournal = buildJournalFromEvent(accounting, paymentEvent, "usr-mia");
  assert.ok(clearedJournal);
  const state = { ...accounting, journals: [{ ...clearedJournal!, status: "Posted" as const, postedAt: "2026-09-01T13:00:00Z", postedBy: "usr-mia" }] };
  const events = sourceEvents(commerce(reversedPayment()), inventory);
  assert.equal(unprocessedSourceEvents(state, events).some((event) => event.type === "Payment reversed" && event.sourceId === reversedPayment().id), true);
});
