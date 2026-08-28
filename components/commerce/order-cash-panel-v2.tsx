"use client";

import { BadgeDollarSign, FileText, Landmark, ReceiptText, RotateCcw, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { InvoiceTerms, PaymentMethod, arAgingBucket, computedInvoiceStatus, invoiceBalance, invoicePaidAmount, openReceivables } from "../../lib/commerce-engine";
import { useCommerce } from "../../lib/commerce-context";
import { customerForLocation, locationLabel } from "../../lib/crm-hierarchy";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Field, Modal, Section, StatusPill, formatDate, formatMoney } from "../ui";

const invoiceTone = (status: string) => status === "Paid" ? "success" as const : status === "Partially paid" ? "warning" as const : status === "Void" ? "danger" as const : "info" as const;
const paymentTone = (status: string) => status === "Cleared" ? "success" as const : status === "Failed" || status === "Reversed" ? "danger" as const : "warning" as const;

export function OrderCashPanel() {
  const { data, scope, currentUser } = useWorkspace();
  const { commerce, setInvoiceTerms, recordPayment, setPaymentStatus, createCredit, approveCredit, applyCredit, requestRefund, setRefundStatus, addNote, voidInvoice } = useCommerce();
  const orderIds = new Set(scope.orders.map((order) => order.id));
  const invoices = commerce.invoices.filter((invoice) => orderIds.has(invoice.orderId)).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  const receivables = openReceivables(commerce).filter((item) => orderIds.has(item.invoice.orderId));

  const [selectedId, setSelectedId] = useState(invoices[0]?.id ?? "");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [note, setNote] = useState("");
  const [paymentForm, setPaymentForm] = useState({ amount: "", method: "ACH" as PaymentMethod, status: "Cleared" as "Pending" | "Cleared", reference: "", note: "" });
  const [creditForm, setCreditForm] = useState({ amount: "", reason: "" });
  const [refundForm, setRefundForm] = useState({ paymentId: "", amount: "", reason: "" });

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
  const canFinance = currentUser.role === "Administrator" || currentUser.role === "Operations";
  const arTotal = receivables.reduce((sum, item) => sum + item.balance, 0);
  const pastDue = receivables.filter((item) => ["1–30", "31–60", "61–90", "90+"].includes(arAgingBucket(item.invoice, item.balance))).reduce((sum, item) => sum + item.balance, 0);

  const submitPayment = (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    const id = recordPayment({ invoiceId: selected.id, amount: Number(paymentForm.amount), method: paymentForm.method, status: paymentForm.status, processorReference: paymentForm.reference || undefined, note: paymentForm.note || undefined });
    if (!id) return;
    setPaymentOpen(false);
    setPaymentForm({ amount: "", method: "ACH", status: "Cleared", reference: "", note: "" });
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
    const id = requestRefund(refundForm.paymentId, Number(refundForm.amount), refundForm.reason);
    if (!id) return;
    setRefundOpen(false);
    setRefundForm({ paymentId: "", amount: "", reason: "" });
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
      <Section title="Order-to-cash control" description="Orders, invoices, payments, credits, refunds, and reconciliation remain separate records with one traceable chain.">
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
          <div className="company-rule-facts"><div><span>Invoice</span><strong>{selected.number}</strong><small>{selectedOrder?.number}</small></div><div><span>Total</span><strong>{formatMoney(selected.total)}</strong><small>{formatMoney(paid)} cleared</small></div><div><span>Balance</span><strong>{formatMoney(balance)}</strong><small>{arAgingBucket(selected, balance)}</small></div><div><span>Status</span><strong>{computedInvoiceStatus(commerce, selected)}</strong><small>{selected.terms}{selected.dueDate ? ` · due ${selected.dueDate}` : ""}</small></div></div>
          <div className="dispatch-record-pair"><article><small>Customer</small><strong>{selectedCustomer?.name ?? "Customer"}</strong><p>{selectedCustomer?.accountType}</p></article><article><small>Location</small><strong>{selectedLocation ? locationLabel(selectedLocation) : "Location"}</strong><p>{selectedLocation?.streetAddress || selectedLocation?.location}</p></article></div>
          {canFinance && <div className="account-detail__actions"><label className="reassign-field"><span>Payment terms</span><select value={selected.terms} onChange={(event) => setTerms(event.target.value as InvoiceTerms)}><option>Prepaid</option><option>COD</option><option>Net 7</option><option>Net 15</option><option>Net 30</option><option>Custom</option></select></label><Button size="sm" icon={<BadgeDollarSign size={14} />} onClick={() => { setPaymentForm((form) => ({ ...form, amount: String(balance) })); setPaymentOpen(true); }} disabled={balance <= 0}>Record payment</Button><Button size="sm" variant="secondary" onClick={() => setCreditOpen(true)} disabled={balance <= 0}>Create credit</Button>{computedInvoiceStatus(commerce, selected) !== "Paid" && selected.status !== "Void" && <Button size="sm" variant="danger" onClick={() => { const reason = window.prompt("Reason for voiding this invoice"); if (reason) voidInvoice(selected.id, reason); }}>Void invoice</Button>}</div>}

          <div className="accounting-rule-list">
            {payments.map(({ allocation, payment }) => payment && <article key={allocation.id}><span><Landmark size={17} /></span><div><strong>{formatMoney(allocation.amount)} · {payment.method}</strong><p>{payment.processorReference ?? "No processor reference"} · allocated to {selected.number}</p><small>{formatDate(payment.receivedAt, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</small></div><StatusPill tone={paymentTone(payment.status)}>{payment.status}</StatusPill>{canFinance && payment.status === "Pending" && <Button size="sm" onClick={() => setPaymentStatus(payment.id, "Cleared")}>Mark cleared</Button>}{canFinance && payment.status === "Cleared" && <Button size="sm" variant="ghost" onClick={() => { setRefundForm({ paymentId: payment.id, amount: String(payment.amount), reason: "" }); setRefundOpen(true); }}>Refund</Button>}</article>)}
            {credits.map((credit) => <article key={credit.id}><span><RotateCcw size={17} /></span><div><strong>{formatMoney(credit.amount)} credit</strong><p>{credit.reason}</p></div><StatusPill tone={credit.status === "Applied" ? "success" : credit.status === "Void" ? "danger" : "warning"}>{credit.status}</StatusPill>{canFinance && credit.status === "Draft" && <Button size="sm" onClick={() => approveCredit(credit.id)}>Approve</Button>}{canFinance && credit.status === "Approved" && <Button size="sm" onClick={() => applyCredit(credit.id)}>Apply</Button>}</article>)}
            {refunds.filter((refund) => payments.some(({ payment }) => payment?.id === refund.paymentId)).map((refund) => <article key={refund.id}><span><RotateCcw size={17} /></span><div><strong>{formatMoney(refund.amount)} refund</strong><p>{refund.reason}</p></div><StatusPill tone={refund.status === "Settled" ? "success" : refund.status === "Failed" ? "danger" : "warning"}>{refund.status}</StatusPill>{canFinance && refund.status === "Requested" && <Button size="sm" onClick={() => setRefundStatus(refund.id, "Approved")}>Approve</Button>}{canFinance && refund.status === "Approved" && <Button size="sm" onClick={() => setRefundStatus(refund.id, "Sent")}>Record sent</Button>}{canFinance && refund.status === "Sent" && <Button size="sm" onClick={() => setRefundStatus(refund.id, "Settled")}>Record settled</Button>}</article>)}
          </div>

          <div className="form-grid"><Field label="Receivable / reconciliation note" className="field--full"><textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Collection note, discrepancy, customer promise, or reconciliation evidence" /></Field><div className="field--full"><Button size="sm" variant="secondary" onClick={submitNote}>Add note</Button></div></div>
          {notes.length > 0 && <div className="hcm-audit-list">{notes.map((entry) => <article key={entry.id}><span><ShieldCheck size={16} /></span><div><strong>{data.users.find((user) => user.id === entry.authorId)?.name ?? "User"}</strong><p>{entry.note}</p><small>{formatDate(entry.createdAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small></div></article>)}</div>}
        </Section>}
      </div>

      <Modal open={paymentOpen} title="Record customer payment" description="Record settlement and allocation. Momentum keeps the business record; the eventual processor supplies the external reference." onClose={() => setPaymentOpen(false)} footer={<><Button variant="ghost" onClick={() => setPaymentOpen(false)}>Cancel</Button><Button type="submit" form="payment-form">Record payment</Button></>}>
        <form id="payment-form" className="form-grid" onSubmit={submitPayment}><Field label="Amount"><input required type="number" min="0.01" step="0.01" max={balance} value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} /></Field><Field label="Method"><select value={paymentForm.method} onChange={(event) => setPaymentForm({ ...paymentForm, method: event.target.value as PaymentMethod })}><option>Card</option><option>ACH</option><option>Wire</option><option>Cash</option><option>Other</option></select></Field><Field label="Settlement state"><select value={paymentForm.status} onChange={(event) => setPaymentForm({ ...paymentForm, status: event.target.value as "Pending" | "Cleared" })}><option>Cleared</option><option>Pending</option></select></Field><Field label="Processor / bank reference"><input value={paymentForm.reference} onChange={(event) => setPaymentForm({ ...paymentForm, reference: event.target.value })} /></Field><Field label="Note" className="field--full"><textarea rows={3} value={paymentForm.note} onChange={(event) => setPaymentForm({ ...paymentForm, note: event.target.value })} /></Field></form>
      </Modal>
      <Modal open={creditOpen} title="Create credit memo" description="Credits require a reason and remain distinct from payments and refunds." onClose={() => setCreditOpen(false)} footer={<><Button variant="ghost" onClick={() => setCreditOpen(false)}>Cancel</Button><Button type="submit" form="credit-form">Create draft credit</Button></>}><form id="credit-form" className="form-grid" onSubmit={submitCredit}><Field label="Amount"><input required type="number" min="0.01" step="0.01" max={balance} value={creditForm.amount} onChange={(event) => setCreditForm({ ...creditForm, amount: event.target.value })} /></Field><Field label="Reason" className="field--full"><textarea required rows={3} value={creditForm.reason} onChange={(event) => setCreditForm({ ...creditForm, reason: event.target.value })} /></Field></form></Modal>
      <Modal open={refundOpen} title="Request refund" description="Refund approval and settlement stay separate so outgoing cash remains reconcilable." onClose={() => setRefundOpen(false)} footer={<><Button variant="ghost" onClick={() => setRefundOpen(false)}>Cancel</Button><Button type="submit" form="refund-form">Create refund request</Button></>}><form id="refund-form" className="form-grid" onSubmit={submitRefund}><Field label="Amount"><input required type="number" min="0.01" step="0.01" value={refundForm.amount} onChange={(event) => setRefundForm({ ...refundForm, amount: event.target.value })} /></Field><Field label="Reason" className="field--full"><textarea required rows={3} value={refundForm.reason} onChange={(event) => setRefundForm({ ...refundForm, reason: event.target.value })} /></Field></form></Modal>
    </div>
  );
}
