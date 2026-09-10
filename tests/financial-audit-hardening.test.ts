import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeAccountingState, journalBalanced, type JournalEntry } from "../lib/accounting-engine";
import { normalizeAuditState, type AuditEvent } from "../lib/audit-engine";
import { canRecordSettlementDate, createCommerceSeed, normalizeCommerceState, refundRemainingAmount, type CommerceState, type Payment, type PaymentAllocation } from "../lib/commerce-engine";
import { createDemoData } from "../lib/demo-data";
import { normalizeFinanceState, type Expense } from "../lib/finance-engine";
import { normalizeNotificationState, resolveNotificationRecipients, type NotificationDelivery } from "../lib/notification-engine";
import { normalizePayrollState, timeEntryHours, withholdingProfileValid, type WithholdingProfile } from "../lib/payroll-engine";
import { disbursementCanRecordSettlement, liabilityCanRecordPaid, type TaxLiabilityRecord } from "../lib/payroll-settlement-controls";

const data = createDemoData();

test("commerce normalization preserves seeded paid evidence and rejects corrupt cash rows", () => {
  const seed = createCommerceSeed(data);
  const normalized = normalizeCommerceState({ version:1, invoices:[], payments:[{ id:"bad-payment", accountId:data.accounts[0].id, receivedAt:"2026-02-30", amount:Number.NaN, method:"ACH", status:"Cleared", createdBy:"x", createdAt:"bad" }], allocations:[], credits:[], refunds:[], notes:[] }, data);
  assert.ok(normalized.payments.some((payment) => payment.id.endsWith("-seed")));
  assert.equal(normalized.payments.some((payment) => payment.id === "bad-payment"), false);
  assert.ok(normalized.invoices.length >= seed.invoices.length);
  assert.equal(canRecordSettlementDate("2026-02-30"), false);
});

test("refund capacity follows allocated cleared funds instead of gross payment amount", () => {
  const seed = createCommerceSeed(data);
  const invoice = seed.invoices[0];
  assert.ok(invoice);
  const payment: Payment = { id:"partial-allocation-payment", accountId:invoice.accountId, receivedAt:"2026-09-10T15:00:00Z", amount:100, method:"ACH", status:"Cleared", settledAt:"2026-09-10", createdBy:"usr-mia", createdAt:"2026-09-10T15:00:00Z" };
  const allocation: PaymentAllocation = { id:"partial-allocation", paymentId:payment.id, invoiceId:invoice.id, amount:40, createdAt:"2026-09-10T15:00:00Z", createdBy:"usr-mia" };
  const state: CommerceState = { ...seed, payments:[payment], allocations:[allocation], refunds:[] };
  assert.equal(refundRemainingAmount(state, payment.id), 40);
});

test("finance normalization refuses an unevidenced paid reimbursement", () => {
  const base: Expense = { id:"expense-paid", requesterId:"usr-jordan", submittedAt:"2026-09-10T12:00:00Z", merchant:"Office store", amount:25, category:"Office / warehouse supplies", businessPurpose:"Dry erase markers", status:"Paid", managerDecisionAt:"2026-09-10T13:00:00Z", managerReviewerId:"usr-avery", financeDecisionAt:"2026-09-10T14:00:00Z", financeReviewerId:"usr-mia", paidAt:"2026-09-10T15:00:00Z", paidBy:"usr-mia" };
  assert.equal(normalizeFinanceState({ version:3, expenses:[base] }).expenses.length, 0);
  assert.equal(normalizeFinanceState({ version:3, expenses:[{ ...base, paymentReference:"ACH-TRACE-1" }] }).expenses.length, 1);
});

test("accounting normalization drops malformed journals and journal balance rejects invalid lines", () => {
  const bad: JournalEntry = { id:"bad-journal", number:"JE-1", date:"2026-09-10", memo:"Bad", status:"Draft", sourceType:"Manual", sourceId:"bad-journal", createdAt:"2026-09-10T12:00:00Z", createdBy:"usr-mia", lines:[{ id:"line-1", accountId:"acct-cash", debit:-10, credit:0 },{ id:"line-2", accountId:"acct-sales", debit:0, credit:-10 }] };
  assert.equal(journalBalanced(bad), false);
  const twoSided: JournalEntry = { ...bad, id:"two-sided", lines:[{ id:"line-a", accountId:"acct-cash", debit:10, credit:10 }] };
  assert.equal(journalBalanced(twoSided), false);
  const normalized = normalizeAccountingState({ version:1, settings:{ basis:"Cash", inventoryValuation:"FIFO", fiscalYearStartMonth:1 }, accounts:[], rules:[], journals:[bad], reconciliations:[] });
  assert.equal(normalized.journals.length, 0);
  assert.ok(normalized.accounts.some((account) => account.systemRole === "Cash"));
});

test("payroll rejects impossible dates corrupt percentages and invalid time entries", () => {
  const withholding: WithholdingProfile = { userId:"usr-jordan", federalPercent:101, statePercent:2, localPercent:0, additionalWithholding:0, postTaxDeduction:0, effectiveDate:"2026-09-10" };
  assert.equal(withholdingProfileValid(withholding), false);
  const payroll = normalizePayrollState({ version:5, payGroups:[{ id:"group", name:"Sales", frequency:"Biweekly", overtimeThresholdHours:Number.POSITIVE_INFINITY, active:true }], employees:[], withholdingProfiles:[withholding], employerTaxRules:[{ id:"tax", name:"Tax", percent:150, effectiveDate:"2026-02-30", active:true }], benefitTaxRules:[], runs:[], liabilities:[], disbursements:[] });
  assert.equal(payroll.payGroups.length, 0);
  assert.equal(payroll.withholdingProfiles.length, 0);
  assert.equal(payroll.employerTaxRules.length, 0);
  assert.equal(timeEntryHours({ id:"bad-time", userId:"usr-jordan", date:"2026-09-10", clockIn:"bogus", clockOut:"17:00", breakMinutes:0, source:"Demo mobile" }), 0);
});

test("payroll settlement evidence cannot predate the released source record", () => {
  const disbursement = { id:"disb", payRunId:"run", userId:"usr-jordan", amount:100, method:"ACH" as const, tokenLabel:"Payroll", status:"Released" as const, createdAt:"2026-09-10T15:00:00Z" };
  assert.equal(disbursementCanRecordSettlement(disbursement,"ACH-1","2026-09-09","2026-09-10"), false);
  assert.equal(disbursementCanRecordSettlement(disbursement,"ACH-1","2026-09-10","2026-09-10"), true);
  const liability: TaxLiabilityRecord = { id:"tax", payRunId:"run", type:"Federal employee", amount:10, status:"Scheduled", createdAt:"2026-09-10T14:00:00Z", scheduledAt:"2026-09-10T15:00:00Z", scheduledBy:"usr-mia" };
  assert.equal(liabilityCanRecordPaid(liability,"EFT-1","2026-09-09","2026-09-10"), false);
  assert.equal(liabilityCanRecordPaid(liability,"EFT-1","2026-09-10","2026-09-10"), true);
});

test("admin-sensitive notifications never inherit related employee or account recipients", () => {
  const event: AuditEvent = { id:"audit-admin", at:"2026-09-10T12:00:00Z", actorId:"usr-mia", actorRole:"Administrator", action:"Updated", module:"Payroll", collection:"runs", entityType:"Payroll.runs", entityId:"run-1", label:"Payroll run", summary:"Payroll changed", sensitivity:"admin", relatedAccountId:data.accounts[0].id, relatedUserId:"usr-jordan", changes:[] };
  assert.deepEqual(resolveNotificationRecipients(event,data),["usr-flo"]);
  const nonAdminActor = { ...event, id:"audit-admin-2", actorId:"usr-jordan" };
  const recipients = resolveNotificationRecipients(nonAdminActor,data);
  assert.deepEqual(new Set(recipients), new Set(["usr-mia","usr-flo"]));
  assert.equal(recipients.includes("usr-jordan"), false);
});

test("notification normalization rejects invalid delivery state and impossible destinations", () => {
  const delivery: NotificationDelivery = { id:"email-bad", sourceEventId:"audit-1", recipientUserId:"usr-jordan", channel:"Email", title:"Test", detail:"Detail", tone:"info", createdAt:"2026-09-10T12:00:00Z", status:"Unread" };
  const normalized = normalizeNotificationState({ version:1, escalationHours:Number.NaN, preferences:[{ userId:"usr-jordan", inApp:true, email:false, sms:true }], deliveries:[delivery] }, data.users);
  assert.equal(normalized.escalationHours,24);
  assert.equal(normalized.deliveries.length,0);
  assert.equal(normalized.preferences.find((item)=>item.userId==="usr-jordan")?.sms,false);
});

test("audit normalization recalculates sensitivity instead of trusting persisted labels", () => {
  const forged: AuditEvent = { id:"forged", at:"2026-09-10T12:00:00Z", actorId:"usr-jordan", actorRole:"Sales Representative", action:"Updated", module:"Payroll", collection:"runs", entityType:"Payroll.runs", entityId:"run-1", label:"Run", summary:"Changed", sensitivity:"operational", changes:[] };
  const normalized = normalizeAuditState({ version:1, events:[forged,{ ...forged, id:"bad-date", at:"not-a-date" }] });
  assert.equal(normalized.events.length,1);
  assert.equal(normalized.events[0].sensitivity,"admin");
});

test("accounting action center focus and Arizona date defaults are wired into the ledger panel", () => {
  const source = readFileSync(new URL("../components/accounting/accounting-panel-v2.tsx", import.meta.url), "utf8");
  assert.match(source,/arizonaDateKey\(\)/);
  assert.match(source,/momentum-focus-record/);
  assert.match(source,/id=\{`accounting-\$\{entry\.id\}`\}/);
});
