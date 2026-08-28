"use client";

import { Check, CircleDollarSign, FileUp, Landmark, Receipt, RotateCcw, ShieldCheck, WalletCards } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Field, PageHeader, Section, StatusPill, formatDate, formatMoney } from "../ui";

type Expense = {
  id: string; requesterId: string; submittedAt: string; merchant: string; amount: number; category: string;
  businessPurpose: string; receiptName?: string; accountId?: string;
  status: "Submitted" | "Manager approved" | "Returned" | "Finance approved" | "Paid";
  managerDecisionAt?: string; financeDecisionAt?: string; paidAt?: string;
};
type AccountingRule = { id:string; event:string; debit:string; credit:string; status:"Configured"|"Needs policy" };
type FinanceState = { expenses: Expense[]; rules: AccountingRule[] };
const KEY = "momentum-finance-v2";
const seed: FinanceState = {
  expenses: [],
  rules: [
    { id:"ar-1", event:"Paid customer order", debit:"Cash / clearing account", credit:"Sales revenue", status:"Needs policy" },
    { id:"ar-2", event:"Inventory received", debit:"Inventory", credit:"Accounts payable / receiving clearing", status:"Needs policy" },
    { id:"ar-3", event:"Approved reimbursement", debit:"Expense category", credit:"Employee reimbursement payable", status:"Needs policy" },
    { id:"ar-4", event:"Payroll posted", debit:"Payroll expense / taxes", credit:"Payroll liabilities / cash", status:"Needs policy" },
  ],
};
const load = (): FinanceState => { if (typeof window === "undefined") return seed; try { return JSON.parse(window.localStorage.getItem(KEY) ?? JSON.stringify(seed)) as FinanceState; } catch { return seed; } };
const toneFor = (status: Expense["status"] | AccountingRule["status"]) => status === "Paid" || status === "Finance approved" || status === "Configured" ? "success" as const : status === "Returned" ? "danger" as const : status === "Needs policy" || status === "Submitted" ? "warning" as const : "info" as const;

export function FinancePage() {
  const { data, scope, currentUser } = useWorkspace();
  const [tab,setTab] = useState<"expenses"|"receivables"|"accounting">("expenses");
  const [state,setState] = useState<FinanceState>(load);
  const [merchant,setMerchant] = useState(""); const [amount,setAmount] = useState(""); const [category,setCategory] = useState("Office / warehouse supplies");
  const [purpose,setPurpose] = useState(""); const [receiptName,setReceiptName] = useState(""); const [accountId,setAccountId] = useState("");
  const admin = currentUser?.role === "Administrator";
  const manager = currentUser?.role === "Sales Manager";
  useEffect(() => { if (typeof window !== "undefined") window.localStorage.setItem(KEY,JSON.stringify(state)); },[state]);

  const canManagerReview = (expense: Expense) => {
    if (!currentUser) return false;
    if (admin) return true;
    if (!manager) return false;
    const requester = data.users.find((user) => user.id === expense.requesterId);
    return requester?.managerId === currentUser.id || requester?.team === currentUser.team;
  };
  const visibleExpenses = useMemo(() => admin || manager ? state.expenses.filter((expense) => expense.requesterId === currentUser?.id || canManagerReview(expense)) : state.expenses.filter((expense) => expense.requesterId === currentUser?.id), [admin, manager, currentUser?.id, state.expenses]);
  const openBalance = scope.orders.filter((order) => order.paymentStatus !== "Paid").reduce((sum,order) => sum + order.amount,0);
  const paidRevenue = scope.orders.filter((order) => order.paymentStatus === "Paid").reduce((sum,order) => sum + order.amount,0);

  const submitExpense = (event: FormEvent) => {
    event.preventDefault(); if (!currentUser || !merchant.trim() || !purpose.trim() || Number(amount) <= 0) return;
    const expense: Expense = { id:`exp-${Date.now()}`, requesterId:currentUser.id, submittedAt:new Date().toISOString(), merchant:merchant.trim(), amount:Number(amount), category, businessPurpose:purpose.trim(), receiptName:receiptName || undefined, accountId:accountId || undefined, status:"Submitted" };
    setState((current) => ({ ...current, expenses:[expense,...current.expenses] })); setMerchant(""); setAmount(""); setPurpose(""); setReceiptName(""); setAccountId("");
  };
  const decideManager = (id:string,status:"Manager approved"|"Returned") => setState((current) => ({ ...current, expenses:current.expenses.map((expense) => expense.id === id && canManagerReview(expense) && expense.status === "Submitted" ? { ...expense,status,managerDecisionAt:new Date().toISOString() } : expense) }));
  const decideFinance = (id:string,status:"Finance approved"|"Returned") => { if (!admin) return; setState((current) => ({ ...current, expenses:current.expenses.map((expense) => expense.id === id && expense.status === "Manager approved" ? { ...expense,status,financeDecisionAt:new Date().toISOString() } : expense) })); };
  const markPaid = (id:string) => { if (!admin) return; setState((current) => ({ ...current, expenses:current.expenses.map((expense) => expense.id === id && expense.status === "Finance approved" ? { ...expense,status:"Paid",paidAt:new Date().toISOString() } : expense) })); };

  return <div className="page page--finance">
    <PageHeader eyebrow="Financial operations" title="Finance & expenses" description="Keep reimbursements, receivables, accounting events, approvals, and payment evidence connected to the source business records." actions={<StatusPill tone="gold">In-house financial control</StatusPill>}/>
    <div className="company-rule-facts"><div><span>Paid sales in scope</span><strong>{formatMoney(paidRevenue)}</strong><small>Derived from paid order records</small></div><div><span>Open customer balance</span><strong>{formatMoney(openBalance)}</strong><small>Payment state remains separate from delivery</small></div><div><span>Submitted expenses</span><strong>{state.expenses.filter((item) => item.status === "Submitted").length}</strong><small>Awaiting business-purpose review</small></div><div><span>Reimbursement payable</span><strong>{formatMoney(state.expenses.filter((item) => item.status === "Finance approved").reduce((sum,item) => sum + item.amount,0))}</strong><small>Approved but not marked paid</small></div></div>
    <div className="company-tabs"><button className={tab === "expenses" ? "is-active" : ""} onClick={() => setTab("expenses")}>Expenses & reimbursements</button><button className={tab === "receivables" ? "is-active" : ""} onClick={() => setTab("receivables")}>Receivables</button>{admin && <button className={tab === "accounting" ? "is-active" : ""} onClick={() => setTab("accounting")}>Accounting engine</button>}</div>

    {tab === "expenses" && <div className="company-grid company-grid--requests"><Section title="Submit business expense" description="Receipts, business purpose, account linkage, and approvals stay on one reimbursement record"><form className="form-grid" onSubmit={submitExpense}><Field label="Merchant"><input required value={merchant} onChange={(event) => setMerchant(event.target.value)} placeholder="Vendor / store"/></Field><Field label="Amount"><input type="number" min="0.01" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)}/></Field><Field label="Category"><select value={category} onChange={(event) => setCategory(event.target.value)}><option>Office / warehouse supplies</option><option>Travel / mileage</option><option>Customer / retailer support</option><option>Marketing / event</option><option>Software / service</option><option>Other</option></select></Field><Field label="Linked account"><select value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">Not account-specific</option>{scope.accounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></Field><Field label="Receipt" className="field--full"><label className="receipt-upload"><FileUp size={17}/><span>{receiptName || "Choose receipt image or PDF"}</span><input type="file" accept="image/*,.pdf" onChange={(event) => setReceiptName(event.target.files?.[0]?.name ?? "")}/></label></Field><Field label="Business purpose" className="field--full"><textarea required rows={4} value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="Why this purchase was necessary for company business."/></Field><div className="form-callout"><Receipt size={17}/><p>The browser demo stores receipt metadata only. Production Firebase Storage will retain the actual receipt file with access rules and the reimbursement record ID.</p></div><Button type="submit" icon={<Receipt size={16}/>}>Submit expense</Button></form></Section><Section title="Reimbursement queue" description="Manager review validates the business purpose; finance approval validates policy/coding before payout"><div className="company-request-list">{visibleExpenses.map((expense) => { const requester = data.users.find((user) => user.id === expense.requesterId); const account = data.accounts.find((item) => item.id === expense.accountId); return <article key={expense.id}><div><small>{expense.category}</small><strong>{expense.merchant} · {formatMoney(expense.amount)}</strong><p>{requester?.name}{account ? ` · ${account.name}` : ""} · submitted {formatDate(expense.submittedAt,{month:"short",day:"numeric"})}</p><p>{expense.businessPurpose}</p>{expense.receiptName && <p>Receipt: {expense.receiptName}</p>}</div><StatusPill tone={toneFor(expense.status)}>{expense.status}</StatusPill>{expense.status === "Submitted" && canManagerReview(expense) && expense.requesterId !== currentUser?.id && <div className="request-actions"><Button size="sm" variant="secondary" icon={<RotateCcw size={14}/>} onClick={() => decideManager(expense.id,"Returned")}>Return</Button><Button size="sm" icon={<Check size={14}/>} onClick={() => decideManager(expense.id,"Manager approved")}>Manager approve</Button></div>}{admin && expense.status === "Manager approved" && <div className="request-actions"><Button size="sm" variant="secondary" onClick={() => decideFinance(expense.id,"Returned")}>Return</Button><Button size="sm" icon={<ShieldCheck size={14}/>} onClick={() => decideFinance(expense.id,"Finance approved")}>Finance approve</Button></div>}{admin && expense.status === "Finance approved" && <Button size="sm" variant="gold" icon={<WalletCards size={14}/>} onClick={() => markPaid(expense.id)}>Mark reimbursement paid</Button>}</article>; })}{visibleExpenses.length === 0 && <div className="review-empty"><p>No reimbursement records in your scope.</p></div>}</div></Section></div>}

    {tab === "receivables" && <Section title="Customer receivables" description="Invoices and payments will reconcile against the same order record; this view currently derives from demo payment states"><div className="finance-order-list"><div className="finance-order-row finance-order-row--head"><span>Order</span><span>Account</span><span>Amount</span><span>Delivery</span><span>Payment</span></div>{scope.orders.map((order) => { const account = scope.accounts.find((item) => item.id === order.accountId); return <div className="finance-order-row" key={order.id}><span><strong>{order.number}</strong></span><span>{account?.name}</span><span>{formatMoney(order.amount)}</span><span>{order.status}</span><span><StatusPill tone={order.paymentStatus === "Paid" ? "success" : "warning"}>{order.paymentStatus}</StatusPill></span></div>; })}</div></Section>}

    {tab === "accounting" && admin && <div className="company-grid company-grid--two"><Section title="Automatic accounting rules" description="Operational events should generate balanced records in the background instead of waiting for manual re-entry"><div className="accounting-rule-list">{state.rules.map((rule) => <article key={rule.id}><span><Landmark size={18}/></span><div><strong>{rule.event}</strong><p>Debit: {rule.debit}<br/>Credit: {rule.credit}</p></div><StatusPill tone={toneFor(rule.status)}>{rule.status}</StatusPill></article>)}</div></Section><Section title="Accounting control sequence" description="The production engine will be native Momentum logic backed by Firebase records"><div className="company-list">{[[CircleDollarSign,"Source transaction","Order, receipt, inventory movement, payroll, reimbursement, credit or adjustment"],[ShieldCheck,"Rule evaluation","Effective-dated accounting rule determines accounts, amount, dimensions and approval requirement"],[Landmark,"Journal record","System creates the balanced entry and preserves the source-record link"],[WalletCards,"Reconciliation","Payment / bank / processor settlement is matched before the event closes"]].map(([Icon,title,copy]) => { const I = Icon as typeof CircleDollarSign; return <div key={title as string}><span><I size={18}/></span><div><strong>{title as string}</strong><p>{copy as string}</p></div></div>; })}</div></Section></div>}
  </div>;
}
