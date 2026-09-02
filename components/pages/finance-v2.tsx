"use client";

import { Check, FileUp, Receipt, RotateCcw, WalletCards } from "lucide-react";
import { FormEvent, useState } from "react";
import { invoiceBalance, openReceivables } from "../../lib/commerce-engine";
import { useCommerce } from "../../lib/commerce-context";
import { useFinance } from "../../lib/finance-context";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Field, PageHeader, Section, StatusPill, formatDate, formatMoney } from "../ui";

const toneFor = (status: string) => status === "Paid" || status === "Finance approved" ? "success" as const : status === "Returned" ? "danger" as const : status === "Submitted" ? "warning" as const : "info" as const;

export function FinancePage() {
  const { data, scope, currentUser } = useWorkspace();
  const { commerce } = useCommerce();
  const { finance, submitExpense, managerDecision, financeDecision, markExpensePaid } = useFinance();
  const [tab, setTab] = useState<"expenses" | "receivables">("expenses");
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Office / warehouse supplies");
  const [purpose, setPurpose] = useState("");
  const [receiptName, setReceiptName] = useState("");
  const [accountId, setAccountId] = useState("");
  const admin = currentUser?.role === "Administrator";
  const manager = currentUser?.role === "Sales Manager";

  const canReview = (requesterId: string) => {
    if (!currentUser || requesterId === currentUser.id) return false;
    if (admin) return true;
    if (!manager) return false;
    const requester = data.users.find((user) => user.id === requesterId);
    return requester?.managerId === currentUser.id || requester?.team === currentUser.team;
  };
  const visibleExpenses = finance.expenses.filter((expense) => expense.requesterId === currentUser?.id || admin || canReview(expense.requesterId));
  const scopeOrderIds = new Set(scope.orders.map((order) => order.id));
  const receivables = openReceivables(commerce).filter((item) => scopeOrderIds.has(item.invoice.orderId));
  const arTotal = receivables.reduce((sum, item) => sum + item.balance, 0);
  const clearedRevenue = commerce.payments.filter((payment) => payment.status === "Cleared" && commerce.allocations.some((allocation) => allocation.paymentId === payment.id && commerce.invoices.some((invoice) => invoice.id === allocation.invoiceId && scopeOrderIds.has(invoice.orderId)))).reduce((sum, payment) => sum + payment.amount, 0);
  const payable = finance.expenses.filter((expense) => expense.status === "Finance approved").reduce((sum, expense) => sum + expense.amount, 0);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const id = submitExpense({ merchant, amount: Number(amount), category, businessPurpose: purpose, receiptName: receiptName || undefined, accountId: accountId || undefined });
    if (!id) return;
    setMerchant("");
    setAmount("");
    setPurpose("");
    setReceiptName("");
    setAccountId("");
  };

  return <div className="page page--finance">
    <PageHeader eyebrow="Financial operations" title="Finance & accounting" description="Manage employee expenses and customer receivables from source records. Accounting entries are handled by the native ledger below." actions={<StatusPill tone="gold">Native finance controls</StatusPill>} />
    <div className="company-rule-facts"><div><span>Cleared customer cash</span><strong>{formatMoney(clearedRevenue)}</strong><small>Cleared payment records in scope</small></div><div><span>Open receivables</span><strong>{formatMoney(arTotal)}</strong><small>{receivables.length} open invoice{receivables.length === 1 ? "" : "s"}</small></div><div><span>Submitted expenses</span><strong>{finance.expenses.filter((item) => item.status === "Submitted").length}</strong><small>Awaiting manager review</small></div><div><span>Reimbursement payable</span><strong>{formatMoney(payable)}</strong><small>Finance-approved, not paid</small></div></div>
    <div className="company-tabs"><button className={tab === "expenses" ? "is-active" : ""} onClick={() => setTab("expenses")}>Expenses & reimbursements</button><button className={tab === "receivables" ? "is-active" : ""} onClick={() => setTab("receivables")}>Receivables</button></div>

    {tab === "expenses" && <div className="company-grid company-grid--requests"><Section title="Submit business expense" description="Receipt metadata, business purpose, account linkage, and approval history stay on one reimbursement record"><form className="form-grid" onSubmit={submit}><Field label="Merchant"><input required value={merchant} onChange={(event) => setMerchant(event.target.value)} /></Field><Field label="Amount"><input type="number" min="0.01" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} /></Field><Field label="Category"><select value={category} onChange={(event) => setCategory(event.target.value)}><option>Office / warehouse supplies</option><option>Travel / mileage</option><option>Customer / retailer support</option><option>Marketing / event</option><option>Software / service</option><option>Other</option></select></Field><Field label="Linked location"><select value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">Not location-specific</option>{scope.accounts.map((account) => <option value={account.id} key={account.id}>{account.locationName ?? account.name}</option>)}</select></Field><Field label="Receipt" className="field--full"><label className="receipt-upload"><FileUp size={17} /><span>{receiptName || "Choose receipt image or PDF"}</span><input type="file" accept="image/*,.pdf" onChange={(event) => setReceiptName(event.target.files?.[0]?.name ?? "")} /></label></Field><Field label="Business purpose" className="field--full"><textarea required rows={4} value={purpose} onChange={(event) => setPurpose(event.target.value)} /></Field><div className="form-callout"><Receipt size={17} /><p>The demo stores receipt metadata only. Firebase Storage will retain the actual file under the reimbursement record with role-based access.</p></div><Button type="submit" icon={<Receipt size={16} />}>Submit expense</Button></form></Section><Section title={admin || manager ? "Reimbursement queue" : "My reimbursements"} description="Requester cannot approve their own expense. Manager approval and finance approval are separate control points"><div className="company-request-list">{visibleExpenses.map((expense) => { const requester = data.users.find((user) => user.id === expense.requesterId); const account = data.accounts.find((item) => item.id === expense.accountId); return <article key={expense.id}><div><small>{expense.category} · {formatDate(expense.submittedAt,{month:"short",day:"numeric"})}</small><strong>{expense.merchant} · {formatMoney(expense.amount)}</strong><p>{requester?.name}{account ? ` · ${account.locationName ?? account.name}` : ""}</p><p>{expense.businessPurpose}</p>{expense.receiptName && <p>Receipt: {expense.receiptName}</p>}{expense.returnReason && <p>Returned: {expense.returnReason}</p>}</div><StatusPill tone={toneFor(expense.status)}>{expense.status}</StatusPill>{expense.status === "Submitted" && canReview(expense.requesterId) && <div className="request-actions"><Button size="sm" variant="secondary" icon={<RotateCcw size={14} />} onClick={() => { const reason=window.prompt("Why is this expense being returned?"); if(reason) managerDecision(expense.id,"Returned",reason); }}>Return</Button><Button size="sm" icon={<Check size={14} />} onClick={() => managerDecision(expense.id,"Manager approved")}>Manager approve</Button></div>}{admin && expense.status === "Manager approved" && <div className="request-actions"><Button size="sm" variant="secondary" onClick={() => { const reason=window.prompt("Why is Finance returning this expense?"); if(reason) financeDecision(expense.id,"Returned",reason); }}>Return</Button><Button size="sm" icon={<Check size={14} />} onClick={() => financeDecision(expense.id,"Finance approved")}>Finance approve</Button></div>}{admin && expense.status === "Finance approved" && <Button size="sm" variant="gold" icon={<WalletCards size={14} />} onClick={() => markExpensePaid(expense.id)}>Mark reimbursement paid</Button>}</article>; })}{visibleExpenses.length === 0 && <div className="review-empty"><p>No reimbursement records in your scope.</p></div>}</div></Section></div>}

    {tab === "receivables" && <Section title="Customer receivables" description="Invoice balance is calculated from invoice, cleared payment allocations, and applied credits"><div className="finance-order-list"><div className="finance-order-row finance-order-row--head"><span>Invoice</span><span>Location</span><span>Original</span><span>Balance</span><span>Status</span></div>{commerce.invoices.filter((invoice) => scopeOrderIds.has(invoice.orderId)).map((invoice) => { const location=data.accounts.find((item)=>item.id===invoice.accountId); const balance=invoiceBalance(commerce,invoice); return <div className="finance-order-row" key={invoice.id}><span><strong>{invoice.number}</strong></span><span>{location?.locationName ?? location?.name}</span><span>{formatMoney(invoice.total)}</span><span>{formatMoney(balance)}</span><span><StatusPill tone={balance <= 0 ? "success" : "warning"}>{balance <= 0 ? "Settled" : invoice.terms}</StatusPill></span></div>; })}</div></Section>}
  </div>;
}
