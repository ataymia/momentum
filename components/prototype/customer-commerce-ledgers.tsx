"use client";

/**
 * Local demonstration only. Finance data must not enter a connected customer
 * session before a server-owned, authenticated account-scoped read is available.
 * Financial record access is checked through authenticated workspace scope.
 */
import {useMemo,useState} from "react";
import {ArrowUpDown,Search} from "lucide-react";
import {useWorkspace} from "../../lib/workspace-context";
import {useCommerce} from "../../lib/commerce-context";
import {useRuntimeMode} from "../../lib/runtime-mode";
import {momentumStorage} from "../../lib/persistence";
import {downloadCsv} from "../../lib/browser-export";
import {invoiceBalance,computedInvoiceStatus,invoicePaidAmount,invoicePendingAmount,invoiceCreditAmount,paymentSettlementDate} from "../../lib/commerce-engine";
import {navigateToRoute} from "../../lib/navigation-store";
import {CustomerConnectedFinance} from "./customer-connected-finance";

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n);
export function CustomerCommerceLedgers({section}:{section:"payments"|"statements"}){
  const {scope,currentUser}=useWorkspace();const {commerce}=useCommerce();const runtime=useRuntimeMode();
  const [query,setQuery]=useState(""),[locationId,setLocationId]=useState("all"),[from,setFrom]=useState(""),[through,setThrough]=useState(""),[sort,setSort]=useState("date"),[asc,setAsc]=useState(false);
  const customer=currentUser?.role==="Customer";
  const demoOnly=runtime.isDemo&&momentumStorage.mode()==="local";
  const permittedAccounts=useMemo(()=>new Set(scope.accounts.map(a=>a.id)),[scope.accounts]);
  const orderMap=useMemo(()=>new Map(scope.orders.filter(o=>!o.testOnly&&["Delivered","Paid"].includes(o.status)).map(o=>[o.id,o])),[scope.orders]);
  const verifiedInvoices=useMemo(()=>commerce.invoices.filter(i=>i.status!=="Void"&&!i.supersededByInvoiceId&&permittedAccounts.has(i.accountId)&&
    orderMap.get(i.orderId)?.accountId===i.accountId),[commerce.invoices,permittedAccounts,orderMap]);
  if(!customer)return <div className="prototype-empty">Customer access only.</div>;
  if(!demoOnly)return <CustomerConnectedFinance section={section}/>;
  const invoices=verifiedInvoices.filter(i=>locationId==="all"||i.accountId===locationId);
  const invoiceMap=new Map(invoices.map(i=>[i.id,i]));
  const payments=commerce.allocations.flatMap(a=>{
    const invoice=invoiceMap.get(a.invoiceId);
    if(!invoice)return[];
    const payment=commerce.payments.find(p=>p.id===a.paymentId&&p.accountId===invoice.accountId);
    if(!payment)return[];
    return [{id:a.id,invoice,payment,amount:a.amount}];
  });
  const needle=query.toLowerCase().trim();
  const dates=(d:string)=>d.slice(0,10);
  const sortRows=<T extends {date:string;invoice:string;amount:number;balance?:number;status:string}>(rows:T[])=>rows.sort((a,b)=>{
    const value=(r:T)=>sort==="invoice"?r.invoice:sort==="amount"?r.amount:sort==="balance"?r.balance??0:sort==="status"?r.status:r.date;
    const x=value(a),y=value(b),result=typeof x==="number"&&typeof y==="number"?x-y:String(x).localeCompare(String(y));
    return (asc?1:-1)*result;
  });
  const toggle=(column:string)=>{if(sort===column)setAsc(v=>!v);else{setSort(column);setAsc(true);}};
  const header=(column:string,label:string)=><button type="button" aria-label={"Sort by "+label} onClick={()=>toggle(column)}>{label}<ArrowUpDown size={14}/></button>;
  const commonFilter=(date:string,values:string[])=>date>= (from||"0000")&&date<=(through||"9999")&&values.join(" ").toLowerCase().includes(needle);
  const paymentRows=sortRows(payments.map(({id,invoice,payment,amount})=>({id,invoice:invoice.number,date:dates(payment.receivedAt),status:payment.status,method:payment.method,amount,
    settled:paymentSettlementDate(payment)??"",paymentId:payment.id,accountId:invoice.accountId}))
    .filter(r=>commonFilter(r.date,[r.invoice,r.method,r.status,r.paymentId])));
  const statementRows=sortRows(invoices.map(i=>({id:i.id,invoice:i.number,date:dates(i.issuedAt),status:computedInvoiceStatus(commerce,i),amount:i.total,
    cleared:invoicePaidAmount(commerce,i.id),pending:invoicePendingAmount(commerce,i.id),credits:invoiceCreditAmount(commerce,i.id),balance:invoiceBalance(commerce,i),
    due:i.dueDate??"",accountId:i.accountId}))
    .filter(r=>commonFilter(r.date,[r.invoice,r.status,r.due])));
  const rows=section==="payments"?paymentRows:statementRows;
  return <div><header className="prototype-heading"><h1>{section==="payments"?"My Payments":"My Statements"}</h1><p>Read-only local preview for your authorized business locations. Transactions are shown as recorded and are not a processor settlement confirmation.</p></header>
    <div className="prototype-metrics"><div><small>Visible records</small><strong>{rows.length}</strong></div><div><small>Visible business locations</small><strong>{scope.accounts.length}</strong></div></div>
    <section className="prototype-panel">
      <div className="prototype-commerce-filters">
        <label className="prototype-search"><Search size={16}/><input aria-label="Search customer finance records" value={query} placeholder="Search invoice, status or method" onChange={e=>setQuery(e.target.value)}/></label>
        <label>Location <select aria-label="Filter business location" value={locationId} onChange={e=>setLocationId(e.target.value)}><option value="all">All my locations</option>{scope.accounts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.location}</option>)}</select></label>
        <label>From <input type="date" aria-label="Start customer finance date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
        <label>Through <input type="date" aria-label="End customer finance date" value={through} onChange={e=>setThrough(e.target.value)}/></label>
      </div>
      <button type="button" disabled={!rows.length} onClick={()=>downloadCsv(section==="payments"?"momentum-customer-payments.csv":"momentum-customer-statement.csv",
        rows,section==="payments"?["invoice","date","status","method","amount","settled"]:["invoice","date","status","amount","cleared","pending","credits","balance","due"])}>Export visible {section==="payments"?"allocations":"statement"} (CSV)</button>
      {section==="payments"?<div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>
        <th>{header("invoice","Invoice")}</th><th>{header("date","Recorded")}</th><th>{header("amount","Allocated")}</th><th>Method</th><th>{header("status","Payment status")}</th><th>Settlement date</th>
      </tr></thead><tbody>{paymentRows.map(r=><tr key={r.id}><td>{r.invoice}</td><td>{r.date}</td><td>{money(r.amount)}</td><td>{r.method}</td><td>{r.status}</td><td>{r.settled||"Unverified"}</td></tr>)}</tbody></table></div>
      :<div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>
        <th>{header("invoice","Invoice")}</th><th>{header("date","Recorded")}</th><th>{header("amount","Amount")}</th><th>Cleared net</th><th>Credits</th><th>{header("balance","Unpaid")}</th><th>{header("status","Status")}</th>
      </tr></thead><tbody>{statementRows.map(r=><tr key={r.id}><td>{r.invoice}</td><td>{r.date}</td><td>{money(r.amount)}</td><td>{money(r.cleared)}</td><td>{money(r.credits)}</td><td>{money(r.balance??0)}</td><td>{r.status}</td></tr>)}</tbody></table></div>}
      {!rows.length&&<div className="prototype-empty">No verified records match these filters.</div>}
      <p className="prototype-note">Only records with linked delivered/paid orders and your authorized customer locations are included. A payment marked Cleared in the source ledger is not independently verified by a processor in this local prototype. The statement is a ledger preview, not an issued accounting document.</p>
      <button type="button" className="prototype-link" onClick={()=>navigateToRoute("/portal/invoices")}>Open my invoices</button>
    </section></div>;
}
