"use client";

import Image from "next/image";
import { CheckSquare2, FileText, Printer, Square } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { computedInvoiceStatus, invoiceBalance, invoiceCreditAmount, invoicePaidAmount } from "../../lib/commerce-engine";
import { useCommerce } from "../../lib/commerce-context";
import { customerForLocation, locationLabel } from "../../lib/crm-hierarchy";
import { orderLinesFor } from "../../lib/order-lines";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Modal, Section, StatusPill, formatDate, formatMoney } from "../ui";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const company = {
  name: "Momentum Distribution Inc.",
  street: "8550 N 91st Ave. Ste #5",
  cityStateZip: "Peoria, AZ 85345",
  phone: "602-500-6811",
  attention: "Florim Ymeri",
  primaryEmail: "momentumdistributioninc@gmail.com",
  salesEmail: "sales@momentumdci.com",
  zelleEmail: "momentumdistributioninc@gmail.com",
};

const bank = {
  name: process.env.NEXT_PUBLIC_INVOICE_BANK_NAME?.trim() || "",
  account: process.env.NEXT_PUBLIC_INVOICE_BANK_ACCOUNT?.trim() || "",
  routing: process.env.NEXT_PUBLIC_INVOICE_BANK_ROUTING?.trim() || "",
};
const hasBankInstructions = Boolean(bank.name && bank.account && bank.routing);

type Copies = 1 | 2;
type PrintJob = { ids: string[]; copies: Copies } | null;

function addressFor(location: { streetAddress?: string; city?: string; state?: string; postalCode?: string; location?: string }) {
  const locality = [location.city, location.state].filter(Boolean).join(", ");
  const cityLine = [locality, location.postalCode].filter(Boolean).join(" ");
  return [location.streetAddress, cityLine || location.location].filter(Boolean).join(", ");
}

function dueLabel(terms: string, dueDate?: string) {
  if (terms === "COD") return "Due upon delivery";
  if (terms === "Prepaid") return "Due before delivery";
  if (dueDate) return `Due ${dueDate}`;
  return "Due according to approved terms";
}

export function InvoicePrintCenter() {
  const { data, scope } = useWorkspace();
  const { commerce } = useCommerce();
  const orderIds = useMemo(() => new Set(scope.orders.map((order) => order.id)), [scope.orders]);
  const invoices = useMemo(() => commerce.invoices.filter((invoice) => orderIds.has(invoice.orderId)).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)), [commerce.invoices, orderIds]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [copies, setCopies] = useState<Copies>(2);
  const [printJob, setPrintJob] = useState<PrintJob>(null);
  const [printNotice, setPrintNotice] = useState("");

  const selectedSet = new Set(selectedIds);
  const allSelected = invoices.length > 0 && invoices.every((invoice) => selectedSet.has(invoice.id));

  useEffect(() => {
    const clearPrintJob = () => setPrintJob(null);
    window.addEventListener("afterprint", clearPrintJob);
    return () => window.removeEventListener("afterprint", clearPrintJob);
  }, []);

  const toggleInvoice = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const toggleAll = () => setSelectedIds(allSelected ? [] : invoices.map((invoice) => invoice.id));

  const startPrint = (ids: string[]) => {
    const unique = [...new Set(ids)].filter((id) => invoices.some((invoice) => invoice.id === id));
    if (!unique.length) {
      setPrintNotice("Select at least one invoice to print.");
      return;
    }
    if (typeof window.print !== "function") {
      setPrintNotice("This browser does not expose a print dialog. Open the invoice preview in a browser that supports printing.");
      return;
    }

    // Keep the browser print call inside the user's click gesture and synchronously mount the print sheets.
    // The old delayed setTimeout could lose user activation and made Print appear dead on some browsers.
    flushSync(() => setPrintJob({ ids: unique, copies }));
    setPrintNotice(`${unique.length} invoice${unique.length === 1 ? "" : "s"} prepared · ${copies} cop${copies === 1 ? "y" : "ies"} each.`);
    window.print();
  };

  const invoiceSheet = (invoiceId: string, copyIndex = 0) => {
    const invoice = commerce.invoices.find((item) => item.id === invoiceId);
    if (!invoice) return null;
    const order = data.orders.find((item) => item.id === invoice.orderId);
    const location = data.accounts.find((item) => item.id === invoice.accountId);
    const customer = location ? customerForLocation(data, location) : undefined;
    const lines = order ? orderLinesFor(order) : [];
    const paid = invoicePaidAmount(commerce, invoice.id);
    const credits = invoiceCreditAmount(commerce, invoice.id);
    const balance = invoiceBalance(commerce, invoice);
    const status = computedInvoiceStatus(commerce, invoice);
    const apName = customer?.accountsPayableContactName || customer?.billingContactName;
    const apEmail = customer?.accountsPayableEmail || customer?.billingEmail;
    const apPhone = customer?.accountsPayablePhone || customer?.billingPhone;
    const apExtension = customer?.accountsPayableExtension?.trim();
    const billToAddress = location ? addressFor(location) : "";

    return <article className="invoice-sheet" key={`${invoice.id}-${copyIndex}`}>
      <Image priority className="invoice-sheet__watermark" src={`${basePath}/momentum-golden-eagle.webp`} width={430} height={430} alt="" aria-hidden="true" />
      <header className="invoice-sheet__header">
        <div className="invoice-sheet__issuer">
          <div className="invoice-sheet__mark">M</div>
          <div><strong>{company.name}</strong><span>Golden Eagle distribution</span><span>{company.street}</span><span>{company.cityStateZip}</span></div>
        </div>
        <div className="invoice-sheet__title"><h1>INVOICE</h1><strong>{invoice.number}</strong></div>
      </header>

      <section className="invoice-sheet__legacy-grid">
        <div><small>FROM</small><strong>{company.name}</strong><span>{company.street}</span><span>{company.cityStateZip}</span><span>{company.phone} · {company.attention}</span><span>{company.salesEmail}</span></div>
        <div><small>BILL TO</small><strong>{customer?.name ?? location?.name ?? "Customer"}</strong>{billToAddress && <span>{billToAddress}</span>}{apName && <span>A/P: {apName}</span>}{apPhone && <span>{apPhone}{apExtension ? ` ext. ${apExtension}` : ""}</span>}{apEmail && <span>{apEmail}</span>}{customer?.az5000Number && <span>AZ-5000: {customer.az5000Number}</span>}</div>
        <div><small>SHIP TO</small><strong>{location ? locationLabel(location) : "Customer location"}</strong>{location && <span>{addressFor(location)}</span>}{location?.contactName && <span>{location.contactName}{location.contactRole ? ` · ${location.contactRole}` : ""}</span>}{location?.phone && <span>{location.phone}</span>}</div>
        <div className="invoice-sheet__document-meta"><span>INVOICE #</span><strong>{invoice.number}</strong><span>INVOICE DATE</span><strong>{formatDate(invoice.issuedAt, { month: "2-digit", day: "2-digit", year: "numeric" })}</strong><span>ORDER #</span><strong>{order?.number ?? invoice.orderId}</strong></div>
      </section>

      <section className="invoice-sheet__meta">
        <div><span>Terms</span><strong>{invoice.terms}</strong></div>
        <div><span>Due</span><strong>{dueLabel(invoice.terms, invoice.dueDate)}</strong></div>
        <div><span>Status</span><strong>{status}</strong></div>
        <div><span>Cases</span><strong>{lines.reduce((sum, line) => sum + line.cases, 0)}</strong></div>
      </section>

      <table className="invoice-sheet__table">
        <thead><tr><th>Qty</th><th>Description</th><th>Unit price</th><th>Amount</th></tr></thead>
        <tbody>{lines.map((line) => <tr key={line.id}><td>{line.cases}</td><td>{line.product}</td><td>{formatMoney(line.pricePerCase)}</td><td>{formatMoney(line.amount)}</td></tr>)}</tbody>
      </table>

      <section className="invoice-sheet__totals">
        <div><span>Subtotal</span><strong>{formatMoney(invoice.total)}</strong></div>
        {paid > 0 && <div><span>Payments received</span><strong>-{formatMoney(paid)}</strong></div>}
        {credits > 0 && <div><span>Credits applied</span><strong>-{formatMoney(credits)}</strong></div>}
        <div className="invoice-sheet__balance"><span>TOTAL / BALANCE DUE</span><strong>{formatMoney(balance)}</strong></div>
      </section>

      <section className="invoice-sheet__terms">
        <h2>Terms & conditions</h2>
        <p><strong>{invoice.terms}</strong> · {dueLabel(invoice.terms, invoice.dueDate)}.</p>
        <p>Zelle: {company.zelleEmail}</p>
        {hasBankInstructions ? <p>{bank.name}: Account No. {bank.account}; Routing No. {bank.routing}</p> : <p>Bank transfer / wire: obtain the current remittance instructions from an authorized Momentum representative.</p>}
        <p>Reference invoice {invoice.number} with every payment. Sales / order support: {company.salesEmail}. Receivables / documentation: {company.primaryEmail}.</p>
        {invoice.terms === "COD" && <p>COD orders are payable at delivery. The delivery representative may collect payment and document the method/reference below.</p>}
        {customer?.paymentTerms === "Net 30" && <p>Net terms apply only where Momentum has approved the customer account for credit.</p>}
      </section>

      <section className="invoice-sheet__receipt">
        <div><span>Customer signature</span><i /></div><div><span>Printed name</span><i /></div><div><span>Date / time</span><i /></div>
        <div><span>Payment received</span><i /></div><div><span>Method</span><i /></div><div><span>Reference / check no.</span><i /></div>
      </section>

      <footer className="invoice-sheet__footer"><span>{company.name} · {company.phone}</span><span>{company.street}, {company.cityStateZip}</span><span>Copy {copyIndex + 1}</span></footer>
    </article>;
  };

  const preview = previewId ? invoiceSheet(previewId, 0) : null;
  const printSheets = printJob ? printJob.ids.flatMap((id) => Array.from({ length: printJob.copies }, (_, copyIndex) => invoiceSheet(id, copyIndex))) : [];
  const printPortal = typeof document !== "undefined" && printSheets.length ? createPortal(<div className="invoice-print-root" aria-hidden="true">{printSheets}</div>, document.body) : null;

  return <>
    <Section title="Customer invoices" description="Print a single invoice or select multiple invoices for a delivery run. Browser print also supports Save as PDF.">
      <div className="invoice-print-toolbar">
        <Button type="button" size="sm" variant="secondary" icon={allSelected ? <CheckSquare2 size={15}/> : <Square size={15}/>} onClick={toggleAll}>{allSelected ? "Clear all" : "Select all"}</Button>
        <label className="invoice-copy-select"><span>Copies per invoice</span><select value={copies} onChange={(event) => setCopies(Number(event.target.value) as Copies)}><option value={1}>1 copy</option><option value={2}>2 copies</option></select></label>
        <Button type="button" size="sm" icon={<Printer size={15}/>} disabled={!selectedIds.length} onClick={() => startPrint(selectedIds)}>Print selected ({selectedIds.length})</Button>
      </div>
      {printNotice && <p className="form-notice invoice-print-notice" role="status">{printNotice}</p>}

      <div className="finance-order-list invoice-register"><div className="finance-order-row finance-order-row--head invoice-register__row"><span>Select</span><span>Invoice</span><span>Location</span><span>Total</span><span>Balance</span><span>Status</span><span>Actions</span></div>{invoices.map((invoice) => {
        const location = data.accounts.find((item) => item.id === invoice.accountId);
        const balance = invoiceBalance(commerce, invoice);
        const status = computedInvoiceStatus(commerce, invoice);
        const checked = selectedSet.has(invoice.id);
        return <div className="finance-order-row invoice-register__row" key={invoice.id}><span><button type="button" className="invoice-check" aria-label={`${checked ? "Deselect" : "Select"} ${invoice.number}`} aria-pressed={checked} onClick={() => toggleInvoice(invoice.id)}>{checked ? <CheckSquare2 size={18}/> : <Square size={18}/>}</button></span><span><strong>{invoice.number}</strong></span><span>{location?.locationName ?? location?.name}</span><span>{formatMoney(invoice.total)}</span><span>{formatMoney(balance)}</span><span><StatusPill tone={status === "Paid" ? "success" : status === "Void" ? "danger" : "warning"}>{status}</StatusPill></span><span className="invoice-row-actions"><Button type="button" size="sm" variant="secondary" icon={<FileText size={14}/>} onClick={() => setPreviewId(invoice.id)}>View</Button><Button type="button" size="sm" icon={<Printer size={14}/>} onClick={() => startPrint([invoice.id])}>Print</Button></span></div>;
      })}{invoices.length === 0 && <div className="review-empty"><FileText size={24}/><h3>No invoices in scope</h3><p>Approved or fulfillment-stage orders create invoice records automatically.</p></div>}</div>
    </Section>

    <Modal open={Boolean(previewId)} title={previewId ? commerce.invoices.find((invoice) => invoice.id === previewId)?.number ?? "Invoice" : "Invoice"} description="Print-ready invoice preview" onClose={() => setPreviewId(null)} wide footer={<><Button type="button" variant="ghost" onClick={() => setPreviewId(null)}>Close</Button>{previewId && <Button type="button" icon={<Printer size={15}/>} onClick={() => startPrint([previewId])}>Print / Save PDF</Button>}</>}><div className="invoice-preview-shell">{preview}</div></Modal>

    {printPortal}
  </>;
}
