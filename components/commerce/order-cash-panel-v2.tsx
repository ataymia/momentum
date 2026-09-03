"use client";

import { BadgeDollarSign, FileText, Landmark, ReceiptText, RotateCcw, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { InvoiceTerms, PaymentMethod, arAgingBucket, computedInvoiceStatus, creditCanApprove, invoiceBalance, invoicePaidAmount, invoicePendingAmount, invoiceRecordableAmount, openReceivables, paymentSettlementDate, refundCanApprove, refundRemainingAmount } from "../../lib/commerce-engine";
import { useCommerce } from "../../lib/commerce-context";
import { customerForLocation, locationLabel } from "../../lib/crm-hierarchy";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Field, Modal, Section, StatusPill, formatDate, formatMoney } from "../ui";

const invoiceTone = (status: string) => status === "Paid" ? "success" as const : status === "Partially paid" ? "warning" as const : status === "Void" ? "danger" as const : "info" as const;
const paymentTone = (status: string) => status === "Cleared" ? "success" as const : status === "Failed" || status === "Reversed" ? "danger" as const : "warning" as const;
const todayKey = () => new Date().toISOString().slice(0, 10);

export function OrderCashPanel() {
  const { data, scope, currentUser } = useWorkspace();
  const { commerce, setInvoiceTerms, recordPayment, setPaymentStatus, failPayment, reversePayment, createCredit, approveCredit, applyCredit, requestRefund, approveRefund, markRefundSent, settleRefund, failRefund, addNote, voidInvoice } = useCommerce();
  const orderIds = new Set(scope.orders.map((order) => order.id));
  const invoices = commerce.invoices.filter((invoice) => orderIds.has(invoice.orderId)).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  const receivables = openReceivables(commerce).filter((item) => orderIds.has(item.invoice.orderId));

  const [selectedId, setSelectedId] = useState(invoices[0]?.id ?? "");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [clearPaymentId, setClearPaymentId] = useState<string | null>(null);
  const [clearSettlementDate, setClearSettlementDate] = useState(todayKey());
  const [paymentFailId, setPaymentFailId] = useState<string | null>(null);
  const [paymentFailureReason, setPaymentFailureReason] = useState("");
  const [paymentReverseId, setPaymentReverseId] = useState<string | null>(null);
  const [paymentReversalReason, setPaymentReversalReason] = useState("");
  const [paymentReversalReference, setPaymentReversalReference] = useState("");
  const [refundSendId, setRefundSendId] = useState<string | null>(null);
  const [refundSendReference, setRefundSendReference] = useState("");
  const [refundSettleId, setRefundSettleId] = useState<string | null>(null);
  const [refundSettlementDate, setRefundSettlementDate] = useState(todayKey());
  const [refundFailId, setRefundFailId] = useState<string | null>(null);
  const [refundFailureReason, setRefundFailureReason] = useState("");
  const [note, setNote] = useState("");
  const [paymentForm, setPaymentForm] = useState({ amount: "", method: "ACH" as PaymentMethod, status: "Cleared" as "Pending" | "Cleared", settlementDate: todayKey(), reference: "", note: "" });
  const [creditForm, setCreditForm] = useState({ amount: "", reason: "" });
  const [refundForm, setRefundForm] = useState({ paymentId: "", amount: "", reason: "", evidence: "" });

  if (!currentUser || currentUser.role === "Customer") return null;

  const selected = invoices.find((invoice) => invoice.id === selectedId) ?? invoices[0];
  const selectedOrder = selected ? data.orders.find((order) => order.id === selected.orderId) : undefined;
  const selectedLocation = selected ? data.accounts.find((location) => location.id === selected.accountId) : undefined;
  const selectedCustomer = selectedLocation ? customerForLocation(data, selectedLocation) : undefined;
  const payments = selected ? commerce.allocations.filter((allocation) => allocation.invoiceId === selected.id).map((allocation) => ({ allocation, payment: commerce.payments.find((payment) => payment.id === allocation.paymentId) })).filter((item) => item.payment) : [];
  const credits = selected ? commerce.credits.filter((credit) => credit.invoiceId === selected.id) : [];
  const refunds = commerce.refunds;
  const notes = selected ? commerce.notes.filter((entry) => entry.invoiceId === selected.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];
  const balance = selected ? invoiceBalance(commerce, selected) : 0;
  const paid = selected ? invoicePaidAmount(commerce, selected.id) : 0;
  const pending = selected ? invoicePendingAmount(commerce, selected.id) : 0;
  const recordable = selected ? invoiceRecordableAmount(commerce, selected) : 0;
  const canFinance = currentUser.role === "Administrator" || currentUser.role === "Operations";
  const arTotal = receivables.reduce((sum, item) => sum + item.balance, 0);
  const pastDue = receivables.filter((item) => ["1–30", "31–60", "61–90", "90+"].includes(arAgingBucket(item.invoice, item.balance))).reduce((sum, item) => sum + item.balance, 0);
  const userName = (id?: string) => id ? data.users.find((user) => user.id === id)?.name ?? id : undefined;

  const submitPayment = (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    const id = recordPayment({ invoiceId: selected.id, amount: Number(paymentForm.amount), method: paymentForm.method, status: paymentForm.status, settlementDate: paymentForm.status === "Cleared" ? paymentForm.settlementDate : undefined, processorReference: paymentForm.reference || undefined, note: paymentForm.note || undefined });
    if (!id) return;
    setPaymentOpen(false);
    setPaymentForm({ amount: "", method: "ACH", status: "Cleared", settlementDate: todayKey(), reference: "", note: "" });
  };
  const submitCredit = (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    const id = createCredit(selected.id, Number(creditForm.amount), creditForm.reason);
    if (!id) return;
    setCreditOpen(false);
    setCreditForm({ amount: "", reason: "" });
  };
  const submitRefund = (event: FormEvent) => {
    event.preventDefault();
    const id = requestRefund(refundForm.paymentId, Number(refundForm.amount), refundForm.reason, refundForm.evidence);
    if (!id) return;
    setRefundOpen(false);
    setRefundForm({ paymentId: "", amount: "", reason: "", evidence: "" });
  };
  const confirmClearPayment = () => {
    if (!clearPaymentId || !setPaymentStatus(clearPaymentId, "Cleared", clearSettlementDate)) return;
    setClearPaymentId(null);
    setClearSettlementDate(todayKey());
  };
  const confirmPaymentFailure = () => {
    if (!paymentFailId || !failPayment(paymentFailId, paymentFailureReason)) return;
    setPaymentFailId(null);
    setPaymentFailureReason("");
  };
  const confirmPaymentReversal = () => {
    if (!paymentReverseId || !reversePayment(paymentReverseId, paymentReversalReason, paymentReversalReference)) return;
    setPaymentReverseId(null);
    setPaymentReversalReason("");
    setPaymentReversalReference("");
  };
  const confirmRefundSent = () => {
    if (!refundSendId || !markRefundSent(refundSendId, refundSendReference)) return;
    setRefundSendId(null);
    setRefundSendReference("");
  };
  const confirmRefundSettlement = () => {
    if (!refundSettleId || !settleRefund(refundSettleId, refundSettlementDate)) return;
    setRefundSettleId(null);
    setRefundSettlementDate(todayKey());
  };
  const confirmRefundFailure = () => {
    if (!refundFailId || !failRefund(refundFailId, refundFailureReason)) return;
    setRefundFailId(null);
    setRefundFailureReason("");
  };
  const submitNote = () => {
    if (!selected || !note.trim()) return;
    addNote(selected.id, note);
    setNote("");
  };
  const setTerms = (terms: InvoiceTerms) => {
    if (!selected) return;
    const issued = new Date(`${selected.issuedAt.slice(0, 10)}T12:00:00`);
    const days = terms === "Net 7" ? 7 : terms === "Net 15" ? 15 : terms === "Net 30" ? 30 : 0;
    if (days > 0) issued.setDate(issued.getDate() + days);
    const dueDate = terms === "Custom" ? selected.dueDate : issued.toISOString().slice(0, 10);
    setInvoiceTerms(selected.id, terms, dueDate);
  };

  return (
    <div className="page commerce-depth-panel">
      <Section title="Order-to-cash control" description="Orders, invoices, payments, credits, quality-refund exceptions, reversals, and reconciliation remain separate records with one traceable chain.">
        <div className="company-rule-facts"><div><span>Open receivables</span><strong>{formatMoney(arTotal)}</strong><small>{receivables.length} open invoice{receivables.length === 1 ? "" : "s"}</small></div><div><span>Past due</span><strong>{formatMoney(pastDue)}</strong><small>Based on configured due dates</small></div><div><span>Cleared payments</span><strong>{commerce.payments.filter((payment) => payment.status === "Cleared").length}</strong><small>Settlement records</small></div><div><span>Credits / refunds</span><strong>{commerce.credits.length} / {commerce.refunds.length}</strong><small>Separate control records</small></div></div>
      </Section>

      <div className="company-grid company-grid--two">
        <Section title="Invoice ledger" description="Invoice records generated from eligible orders">
          <div className="company-request-list">
            {invoices.map((invoice) => {
              const order = data.orders.find((item) => item.id === invoice.orderId);
              const location = data.accounts.find((item) => item.id === invoice.accountId);
              const status = computedInvoiceStatus(commerce, invoice);
              const open = invoiceBalance(commerce, invoice);
              return <button key={invoice.id} className={`account-table ${selected?.id === invoice.id ? "is-selected" : ""}`} onClick={() => setSelectedId(invoice.id)}><span className="account-name-cell"><i><FileText size={17} /></i><span><strong>{invoice.number}</strong><small>{location ? locationLabel(location) : "Location"} · {order?.number}</small></span></span><span><StatusPill tone={invoiceTone(status)}>{status}</StatusPill></span><span>{formatMoney(invoice.total)}</span><span>{open > 0 ? `${formatMoney(open)} due` : "Settled"}</span></button>;
            })}
            {invoices.length === 0 && <div className="review-empty"><ReceiptText size={24} /><h3>No invoices in scope</h3><p>Approved or fulfillment-stage orders create invoice records automatically.</p></div>}
          </div>
        </Section>

        {selected && <Section title="Invoice detail" description="Customer, location, order, terms, settlement, credit, and notes">
          <div className="company-rule-facts"><div><span>Invoice</span><strong>{selected.number}</strong><small>{selectedOrder?.number}</small></div><div><span>Cleared</span><strong>{formatMoney(paid)}</strong><small>{pending > 0 ? `${formatMoney(pending)} pending` : "No pending settlement"}</small></div><div><span>Balance</span><strong>{formatMoney(balance)}</strong><small>{recordable < balance ? `${formatMoney(recordable)} still recordable` : arAgingBucket(selected, balance)}</small></div><div><span>Status</span><strong>{computedInvoiceStatus(commerce, selected)}</strong><small>{selected.terms}{selected.dueDate ? ` · due ${selected.dueDate}` : ""}</small></div></div>
          <div className="dispatch-record-pair"><article><small>Customer</small><strong>{selectedCustomer?.name ?? "Customer"}</strong><p>{selectedCustomer?.accountType}</p></article><article><small>Location</small><strong>{selectedLocation ? locationLabel(selectedLocation) : "Location"}</strong><p>{selectedLocation?.streetAddress || selectedLocation?.location}</p></article></div>
          {canFinance && <div className="account-detail__actions"><label className="reassign-field"><span>Payment terms</span><select value={selected.terms} onChange={(event) => setTerms(event.target.value as InvoiceTerms)}><option>Prepaid</option><option>COD</option><option>Net 7</option><option>Net 15</option><option>Net 30</option><option>Custom</option></select></label><Button size="sm" icon={<BadgeDollarSign size={14} />} onClick={() => { setPaymentForm((form) => ({ ...form, amount: String(recordable), settlementDate: todayKey() })); setPaymentOpen(true); }} disabled={recordable <= 0}>Record payment</Button><Button size="sm" variant="secondary" onClick={() => { setCreditForm((form) => ({ ...form, amount: String(recordable) })); setCreditOpen(true); }} disabled={recordable <= 0}>Create credit</Button>{computedInvoiceStatus(commerce, selected) !== "Paid" && selected.status !== "Void" && <Button size="sm" variant="danger" onClick={() => { const reason = window.prompt("Reason for voiding this invoice. Pending payments and active credits must be resolved first."); if (reason) voidInvoice(selected.id, reason); }}>Void invoice</Button>}</div>}

          <div className="accounting-rule-list">
            {payments.map(({ allocation, payment }) => {
              if (!payment) return null;
              const refundable = refundRemainingAmount(commerce, payment.id);
              const hasLiveRefund = refundable < payment.amount;
              return <article key={allocation.id}><span><Landmark size={17} /></span><div><strong>{formatMoney(allocation.amount)} · {payment.method}</strong><p>{payment.processorReference ?? "No processor reference"} · allocated to {selected.number}</p><small>Recorded {formatDate(payment.receivedAt, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}{paymentSettlementDate(payment) ? ` · settled ${formatDate(paymentSettlementDate(payment)!, { month: "short", day: "numeric", year: "numeric" })}${payment.settledBy ? ` by ${userName(payment.settledBy)}` : ""}` : " · not settled"}{payment.failureReason ? ` · failed: ${payment.failureReason}` : ""}{payment.reversalReason ? ` · reversed: ${payment.reversalReason}${payment.reversalReference ? ` (${payment.reversalReference})` : ""}` : ""}</small></div><StatusPill tone={paymentTone(payment.status)}>{payment.status}</StatusPill>{canFinance && payment.status === "Pending" && <><Button size="sm" onClick={() => { setClearPaymentId(payment.id); setClearSettlementDate(todayKey()); }}>Record settlement</Button><Button size="sm" variant="ghost" onClick={() => { setPaymentFailId(payment.id); setPaymentFailureReason(""); }}>Mark failed</Button></>}{canFinance && payment.status === "Cleared" && refundable > 0 && <Button size="sm" variant="ghost" onClick={() => { setRefundForm({ paymentId: payment.id, amount: String(refundable), reason: "", evidence: "" }); setRefundOpen(true); }}>Quality refund</Button>}{canFinance && payment.status === "Cleared" && !hasLiveRefund && <Button size="sm" variant="secondary" onClick={() => { setPaymentReverseId(payment.id); setPaymentReversalReason(""); setPaymentReversalReference(""); }}>Record reversal</Button>}{canFinance && payment.status === "Cleared" && hasLiveRefund && <small>Resolve refund lifecycle before payment reversal</small>}</article>;
            })}
            {credits.map((credit) => {
              const canApprove = canFinance && creditCanApprove(credit, currentUser.id);
              return <article key={credit.id}><span><RotateCcw size={17} /></span><div><strong>{formatMoney(credit.amount)} credit</strong><p>{credit.reason}</p><small>Requested by {userName(credit.createdBy)}{credit.approvedBy ? ` · approved by ${userName(credit.approvedBy)}${credit.approvedAt ? ` ${formatDate(credit.approvedAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}` : ""}{credit.appliedBy ? ` · applied by ${userName(credit.appliedBy)}${credit.appliedAt ? ` ${formatDate(credit.appliedAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}` : ""}</small></div><StatusPill tone={credit.status === "Applied" ? "success" : credit.status === "Void" ? "danger" : "warning"}>{credit.status}</StatusPill>{credit.status === "Draft" && canApprove && <Button size="sm" onClick={() => approveCredit(credit.id)}>Approve</Button>}{credit.status === "Draft" && canFinance && !canApprove && <small>Independent approval required</small>}{canFinance && credit.status === "Approved" && <Button size="sm" onClick={() => applyCredit(credit.id)}>Apply</Button>}</article>;
            })}
            {refunds.filter((refund) => payments.some(({ payment }) => payment?.id === refund.paymentId)).map((refund) => {
              const canApprove = canFinance && refundCanApprove(refund, currentUser.id);
              return <article key={refund.id}><span><RotateCcw size={17} /></span><div><strong>{formatMoney(refund.amount)} quality refund</strong><p>{refund.reason}</p><small>{refund.basis ?? "Verified quality issue"} · Evidence: {refund.evidence ?? "Legacy evidence record"}</small><small>Requested by {userName(refund.createdBy)}{refund.approvedBy ? ` · approved by ${userName(refund.approvedBy)}` : ""}{refund.sentReference ? ` · sent ref ${refund.sentReference}` : ""}{refund.settledAt ? ` · settled ${formatDate(refund.settledAt, { month: "short", day: "numeric", year: "numeric" })}${refund.settledBy ? ` by ${userName(refund.settledBy)}` : ""}` : ""}{refund.failureReason ? ` · failed: ${refund.failureReason}` : ""}</small></div><StatusPill tone={refund.status === "Settled" ? "success" : refund.status === "Failed" ? "danger" : "warning"}>{refund.status}</StatusPill>{refund.status === "Requested" && canApprove && <Button size="sm" onClick={() => approveRefund(refund.id)}>Approve</Button>}{refund.status === "Requested" && canFinance && !canApprove && <small>Independent approval required</small>}{canFinance && refund.status === "Approved" && <Button size="sm" onClick={() => { setRefundSendId(refund.id); setRefundSendReference(""); }}>Record sent</Button>}{canFinance && refund.status === "Sent" && <Button size="sm" onClick={() => { setRefundSettleId(refund.id); setRefundSettlementDate(todayKey()); }}>Record settled</Button>}{canFinance && ["Requested", "Approved", "Sent"].includes(refund.status) && <Button size="sm" variant="ghost" onClick={() => { setRefundFailId(refund.id); setRefundFailureReason(""); }}>Mark failed</Button>}</article>;
            })}
          </div>

          <div className="form-grid"><Field label="Receivable / reconciliation note" className="field--full"><textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Collection note, discrepancy, customer promise, or reconciliation evidence" /></Field><div className="field--full"><Button size="sm" variant="secondary" onClick={submitNote}>Add note</Button></div></div>
          {notes.length > 0 && <div className="hcm-audit-list">{notes.map((entry) => <article key={entry.id}><span><ShieldCheck size={16} /></span><div><strong>{data.users.find((user) => user.id === entry.authorId)?.name ?? "User"}</strong><p>{entry.note}</p><small>{formatDate(entry.createdAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small></div></article>)}</div>}
        </Section>}
      </div>

      <Modal open={paymentOpen} title="Record customer payment" description="Pending means money has been initiated but has not settled. Cleared requires the actual bank or processor settlement date." onClose={() => setPaymentOpen(false)} footer={<><Button variant="ghost" onClick={() => setPaymentOpen(false)}>Cancel</Button><Button type="submit" form="payment-form">Record payment</Button></>}>
        <form id="payment-form" className="form-grid" onSubmit={submitPayment}><Field label="Amount"><input required type="number" min="0.01" step="0.01" max={recordable} value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} /></Field><Field label="Method"><select value={paymentForm.method} onChange={(event) => setPaymentForm({ ...paymentForm, method: event.target.value as PaymentMethod })}><option>Card</option><option>ACH</option><option>Wire</option><option>Cash</option><option>Other</option></select></Field><Field label="Settlement state"><select value={paymentForm.status} onChange={(event) => setPaymentForm({ ...paymentForm, status: event.target.value as "Pending" | "Cleared" })}><option>Cleared</option><option>Pending</option></select></Field>{paymentForm.status === "Cleared" && <Field label="Actual settlement date"><input required type="date" max={todayKey()} value={paymentForm.settlementDate} onChange={(event) => setPaymentForm({ ...paymentForm, settlementDate: event.target.value })} /></Field>}<Field label="Processor / bank reference"><input value={paymentForm.reference} onChange={(event) => setPaymentForm({ ...paymentForm, reference: event.target.value })} /></Field><Field label="Note" className="field--full"><textarea rows={3} value={paymentForm.note} onChange={(event) => setPaymentForm({ ...paymentForm, note: event.target.value })} /></Field>{pending > 0 && <div className="form-callout field--full"><Landmark size={17}/><p>{formatMoney(pending)} is already recorded as pending settlement and cannot be double-allocated.</p></div>}</form>
      </Modal>
      <Modal open={creditOpen} title="Create credit memo" description="Credits require a reason and remain distinct from payments and refunds. The creator cannot approve their own credit." onClose={() => setCreditOpen(false)} footer={<><Button variant="ghost" onClick={() => setCreditOpen(false)}>Cancel</Button><Button type="submit" form="credit-form">Create draft credit</Button></>}><form id="credit-form" className="form-grid" onSubmit={submitCredit}><Field label="Amount"><input required type="number" min="0.01" step="0.01" max={recordable} value={creditForm.amount} onChange={(event) => setCreditForm({ ...creditForm, amount: event.target.value })} /></Field><Field label="Reason" className="field--full"><textarea required rows={3} value={creditForm.reason} onChange={(event) => setCreditForm({ ...creditForm, reason: event.target.value })} /></Field></form></Modal>
      <Modal open={refundOpen} title="Request quality refund" description="Current operating direction allows refund exceptions for a verified quality issue on our side. The requester cannot approve the refund. The formal customer refund policy is still pending." onClose={() => setRefundOpen(false)} footer={<><Button variant="ghost" onClick={() => setRefundOpen(false)}>Cancel</Button><Button type="submit" form="refund-form">Create quality refund request</Button></>}><form id="refund-form" className="form-grid" onSubmit={submitRefund}><Field label="Amount"><input required type="number" min="0.01" step="0.01" value={refundForm.amount} onChange={(event) => setRefundForm({ ...refundForm, amount: event.target.value })} /></Field><Field label="Quality issue" className="field--full"><textarea required rows={3} value={refundForm.reason} onChange={(event) => setRefundForm({ ...refundForm, reason: event.target.value })} placeholder="Describe the verified product or fulfillment quality issue" /></Field><Field label="Evidence reviewed" className="field--full"><textarea required rows={3} value={refundForm.evidence} onChange={(event) => setRefundForm({ ...refundForm, evidence: event.target.value })} placeholder="Lot, photos, inspection notes, delivery evidence, or other supporting record" /></Field></form></Modal>
      <Modal open={Boolean(clearPaymentId)} title="Record payment settlement" description="Use the date the bank or processor actually settled the funds. This date drives collected-sales and sales-bonus eligibility." onClose={() => setClearPaymentId(null)} footer={<><Button variant="ghost" onClick={() => setClearPaymentId(null)}>Cancel</Button><Button onClick={confirmClearPayment}>Mark cleared</Button></>}><Field label="Actual settlement date"><input type="date" max={todayKey()} value={clearSettlementDate} onChange={(event) => setClearSettlementDate(event.target.value)} /></Field></Modal>
      <Modal open={Boolean(paymentFailId)} title="Mark payment failed" description="Use this for a pending payment attempt that did not settle. The reason remains in the audit trail and releases the pending amount for collection again." onClose={() => { setPaymentFailId(null); setPaymentFailureReason(""); }} footer={<><Button variant="ghost" onClick={() => { setPaymentFailId(null); setPaymentFailureReason(""); }}>Cancel</Button><Button onClick={confirmPaymentFailure}>Mark failed</Button></>}><Field label="Failure reason"><textarea rows={3} required value={paymentFailureReason} onChange={(event) => setPaymentFailureReason(event.target.value)} placeholder="ACH rejected, card failed, bank return before settlement…" /></Field></Modal>
      <Modal open={Boolean(paymentReverseId)} title="Record payment reversal" description="Use this only when previously settled funds were later reversed by the bank or processor. It reopens the receivable and creates a blocked Accounting review event." onClose={() => { setPaymentReverseId(null); setPaymentReversalReason(""); setPaymentReversalReference(""); }} footer={<><Button variant="ghost" onClick={() => { setPaymentReverseId(null); setPaymentReversalReason(""); setPaymentReversalReference(""); }}>Cancel</Button><Button onClick={confirmPaymentReversal}>Record reversal</Button></>}><div className="form-grid"><Field label="Reversal reason" className="field--full"><textarea rows={3} required value={paymentReversalReason} onChange={(event) => setPaymentReversalReason(event.target.value)} placeholder="Processor reversal, bank return after settlement, chargeback…" /></Field><Field label="Processor / bank reference" className="field--full"><input value={paymentReversalReference} onChange={(event) => setPaymentReversalReference(event.target.value)} placeholder="Return code, processor case, bank reference…" /></Field></div></Modal>
      <Modal open={Boolean(refundSendId)} title="Record refund sent" description="An approved refund is not treated as money sent until an external processor or bank reference is recorded." onClose={() => { setRefundSendId(null); setRefundSendReference(""); }} footer={<><Button variant="ghost" onClick={() => { setRefundSendId(null); setRefundSendReference(""); }}>Cancel</Button><Button onClick={confirmRefundSent}>Record sent</Button></>}><Field label="Processor / bank reference"><input required value={refundSendReference} onChange={(event) => setRefundSendReference(event.target.value)} placeholder="ACH trace, processor refund ID, bank confirmation…" /></Field></Modal>
      <Modal open={Boolean(refundSettleId)} title="Record refund settlement" description="Use the actual date the outgoing refund settled. It cannot precede the recorded send date or be in the future." onClose={() => { setRefundSettleId(null); setRefundSettlementDate(todayKey()); }} footer={<><Button variant="ghost" onClick={() => { setRefundSettleId(null); setRefundSettlementDate(todayKey()); }}>Cancel</Button><Button onClick={confirmRefundSettlement}>Record settled</Button></>}><Field label="Actual settlement date"><input type="date" max={todayKey()} value={refundSettlementDate} onChange={(event) => setRefundSettlementDate(event.target.value)} /></Field></Modal>
      <Modal open={Boolean(refundFailId)} title="Mark refund failed" description="Use this when the refund attempt did not complete. The reason remains in the audit trail and releases the failed amount from the committed-refund total." onClose={() => { setRefundFailId(null); setRefundFailureReason(""); }} footer={<><Button variant="ghost" onClick={() => { setRefundFailId(null); setRefundFailureReason(""); }}>Cancel</Button><Button onClick={confirmRefundFailure}>Mark failed</Button></>}><Field label="Failure reason"><textarea rows={3} required value={refundFailureReason} onChange={(event) => setRefundFailureReason(event.target.value)} placeholder="Processor rejection, bank return, canceled before settlement…" /></Field></Modal>
    </div>
  );
}
