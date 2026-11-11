"use client";

import {useState} from "react";
import {useWorkspace} from "../../lib/workspace-context";
import {useCommerce} from "../../lib/commerce-context";
import {useFinance} from "../../lib/finance-context";
import {useRuntimeMode} from "../../lib/runtime-mode";
import {momentumStorage} from "../../lib/persistence";
import {canManageUser} from "../../lib/access";
import {financeOverviewSource} from "../../lib/finance-overview-source";
import {navigateToRoute} from "../../lib/navigation-store";
import {formatMoney} from "../ui";
import {FinancePage} from "../pages/finance-v2";

/** R28: one finance entry point with audited source projections and preserved
 * demo expense workflow. Never conflate recorded allocations with bank deposits.
 */
export function FinanceWorkspaceExperience(){
 const {currentUser,data,scope}=useWorkspace();
 const {commerce}=useCommerce();
 const {finance}=useFinance();
 const mode=useRuntimeMode();
 const demo=mode.isDemo&&momentumStorage.mode()==="local";
 const [tab,setTab]=useState<"overview"|"expenses"|"workflow">("overview");
 const [query,setQuery]=useState(""),[status,setStatus]=useState("all");
 if(!currentUser||currentUser.role==="Customer")
  return <div className="prototype-empty">Employee finance access required.</div>;
 const source=financeOverviewSource(data,commerce,scope.orders);
 const available=finance.expenses.filter(expense=>expense.requesterId===currentUser.id||
   currentUser.role==="Administrator"||
   currentUser.role==="Sales Manager"&&canManageUser(data,currentUser,expense.requesterId,false));
 const items=available.filter(expense=>(status==="all"||expense.status===status)&&
   [expense.merchant,expense.category,expense.businessPurpose,expense.id].join(" ").toLowerCase().includes(query.trim().toLowerCase()))
   .sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt)||a.id.localeCompare(b.id));
 const errorCount=source.invoiceReviewCount+source.refundReviewCount;
 return <div className="prototype-domain prototype-domain--finance">
  <header className="prototype-heading"><h1>Finance Overview</h1>
   <p>Receivables, recorded collections and expenses with the original financial controls intact. No label here certifies processor settlement or a bank deposit.</p>
  </header>
  <div className="prototype-domain-statbar">
   <article><small>Linked net collections</small>
     <strong>{source.netRecordedCollections===null?"Reconciliation required":formatMoney(source.netRecordedCollections)}</strong></article>
   <article><small>Open invoice receivables</small>
     <strong>{source.openReceivables===null?"Reconciliation required":formatMoney(source.openReceivables)}</strong></article>
   <article><small>Invoice review exceptions</small><strong>{source.invoiceReviewCount}</strong></article>
   <article><small>Refund review exceptions</small><strong>{source.refundReviewCount}</strong></article>
  </div>
  {errorCount>0&&<p role="alert" className="prototype-note">{errorCount} invoice/refund record exception(s) block reliable finance totals. Review the original source before relying on these amounts.</p>}
  <p className="prototype-note">Cash measures are derived only from the available scoped order, invoice, allocation, credit and refund evidence. They are not a complete historical bank reconciliation. Missing or unauthorized source records are not counted as zero.</p>
  <nav className="prototype-tabs" aria-label="Finance workstreams">
   <button type="button" className={tab==="overview"?"is-active":""} aria-current={tab==="overview"?"page":undefined} onClick={()=>setTab("overview")}>Overview & exceptions</button>
   <button type="button" className={tab==="expenses"?"is-active":""} aria-current={tab==="expenses"?"page":undefined} onClick={()=>setTab("expenses")}>Expense register</button>
   {demo&&<button type="button" className={tab==="workflow"?"is-active":""} aria-current={tab==="workflow"?"page":undefined} onClick={()=>setTab("workflow")}>Expense & reimbursement workflow</button>}
  </nav>
  {tab==="overview"&&<section className="prototype-panel"><h2>Trace a financial exception to its source</h2>
   <div className="prototype-controls">
    <button type="button" onClick={()=>navigateToRoute("/sales/orders")}>Sales orders</button>
    <button type="button" onClick={()=>navigateToRoute("/sales/invoices")}>Invoices</button>
    <button type="button" onClick={()=>navigateToRoute("/sales/payments")}>Payments received</button>
    <button type="button" onClick={()=>navigateToRoute("/sales/returns")}>Sales returns</button>
    <button type="button" onClick={()=>navigateToRoute("/sales/credit-notes")}>Credit notes</button>
    {currentUser.role==="Administrator"&&<button type="button" onClick={()=>navigateToRoute("/finance/accounting")}>Accounting ledger</button>}
   </div>
   <p>Open issued invoices in the invoice register, inspect their allocations and credit notes, and reconcile ambiguous refunds before treating them as cash. Financial settlement must be verified against the provider or bank separately.</p>
   {!demo&&<p className="prototype-note" role="status">Connected finance operations currently remain read-only. Claims of reimbursement payment and expense approvals require a trusted server transaction and verified settlement source.</p>}
  </section>}
  {tab==="expenses"&&<section className="prototype-panel"><h2>Recorded expense and reimbursement requests</h2>
   <div className="prototype-controls"><label>Search <input type="search" aria-label="Search finance expenses" value={query} onChange={event=>setQuery(event.target.value)}/></label>
    <label>Status <select value={status} onChange={event=>setStatus(event.target.value)}><option value="all">All recorded states</option>
    {[...new Set(available.map(e=>e.status))].sort().map(state=><option key={state} value={state}>{state}</option>)}</select></label>
   </div>
   <div className="prototype-table-scroll"><table className="prototype-table"><thead>
    <tr><th>Merchant</th><th>Requester</th><th>Purpose</th><th>Amount</th><th>Status</th><th>Recorded at</th></tr></thead>
    <tbody>{items.map(e=><tr key={e.id}><td>{e.merchant}</td><td>{data.users.find(u=>u.id===e.requesterId)?.name??"Unlinked employee"}</td>
     <td>{e.businessPurpose}</td><td>{formatMoney(e.amount)}</td><td>{e.status}</td><td>{e.submittedAt.slice(0,10)}</td></tr>)}</tbody></table></div>
   {!items.length&&<p className="prototype-note">No expense records match your scope and filters. No company-wide completeness claim is implied.</p>}
  </section>}
  {tab==="workflow"&&demo&&<FinancePage/>}
 </div>;
}
