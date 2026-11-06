"use client";

import {useMemo,useState} from "react";
import {Download,Search,TrendingUp,TriangleAlert} from "lucide-react";
import {useCommerce} from "../../lib/commerce-context";
import {collectedCashFacts} from "../../lib/commercial-source";
import {arizonaDateKey} from "../../lib/date-time";
import {downloadCsv} from "../../lib/browser-export";
import {navigateToRoute} from "../../lib/navigation-store";
import {useWorkspace} from "../../lib/workspace-context";

const currency=(value:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(value);
type SortField="settledAt"|"amount"|"customer";
const dateBack=(key:string,days:number)=>{const d=new Date(key+"T00:00:00.000Z");d.setUTCDate(d.getUTCDate()-days);return d.toISOString().slice(0,10);};

/** Scenario planning uses only cleared, source-linked cash events. It is not a booked-revenue forecast. */
export function ForecastsExperience(){
 const {scope,data,currentUser}=useWorkspace();
 const {commerce}=useCommerce();
 const [days,setDays]=useState<30|60|90>(90);
 const [query,setQuery]=useState("");
 const [sort,setSort]=useState<SortField>("settledAt");
 const [descending,setDescending]=useState(true);
 const today=arizonaDateKey(),from=dateBack(today,days-1);
 const permittedOrders=useMemo(()=>new Set(scope.orders.filter(o=>!o.testOnly).map(o=>o.id)),[scope.orders]);
 const accounts=useMemo(()=>new Map(scope.accounts.map(a=>[a.id,a.name])),[scope.accounts]);
 const facts=useMemo(()=>collectedCashFacts(data,commerce).filter(f=>
   permittedOrders.has(f.orderId)&&f.settledAt>=from&&f.settledAt<=today&&Number.isFinite(f.amount)
 ),[data,commerce,permittedOrders,from,today]);
 const total=facts.reduce((n,f)=>n+f.amount,0);
 const collections=facts.filter(f=>f.kind==="Collection").reduce((n,f)=>n+f.amount,0);
 const refunds=-facts.filter(f=>f.kind==="Refund").reduce((n,f)=>n+f.amount,0);
 const evidence=facts.length>0;
 const monthlyBasis=evidence?total*30/days:null;
 const scenarios=[{label:"Conservative",factor:0.75},{label:"Current run rate",factor:1},{label:"Growth case",factor:1.25}];
 const records=facts.filter(f=>[accounts.get(f.accountId),f.orderId,f.kind,f.settledAt].join(" ").toLowerCase().includes(query.trim().toLowerCase())).sort((a,b)=>{
   const left=sort==="customer"?accounts.get(a.accountId)??"":sort==="amount"?a.amount:a.settledAt;
   const right=sort==="customer"?accounts.get(b.accountId)??"":sort==="amount"?b.amount:b.settledAt;
   const cmp=typeof left==="number"&&typeof right==="number"?left-right:String(left).localeCompare(String(right));
   return (descending?-1:1)*cmp||a.id.localeCompare(b.id);
 });
 const exportVisible=()=>downloadCsv("momentum-cash-forecast-evidence.csv",records.map(f=>({
   transactionId:f.id,orderId:f.orderId,account:accounts.get(f.accountId)??"Restricted",date:f.settledAt,
   category:f.kind,netAmount:f.amount
 })),["transactionId","orderId","account","date","category","netAmount"]);
 if(!currentUser)return <div className="prototype-empty">Sign in to view forecasts.</div>;
 return <div className="prototype-domain">
  <header className="prototype-heading"><h1>Forecasts & scenarios</h1><p>Historical collections, documented assumptions, and drill-down to the actual order evidence visible to your role.</p></header>
  <section className="prototype-panel">
   <div className="prototype-controls">
    <label>Historical window <select aria-label="Historical cash lookback" value={days} onChange={e=>setDays(Number(e.target.value) as 30|60|90)}><option value={30}>30 days</option><option value={60}>60 days</option><option value={90}>90 days</option></select></label>
    <span className="prototype-note">Evidence: {from} through {today}</span>
   </div>
   <div className="prototype-domain-statbar">
    <article><small>Cleared collections</small><strong>{currency(collections)}</strong></article>
    <article><small>Settled refunds</small><strong>{currency(refunds)}</strong></article>
    <article><small>Net historical cash</small><strong>{currency(total)}</strong></article>
    <article><small>Source transactions</small><strong>{facts.length}</strong></article>
   </div>
  </section>
  <section className="prototype-panel"><h2><TrendingUp size={18}/> Next 30-day scenarios</h2>
   <p className="prototype-note">Formula: (net historical collections ÷ {days} calendar days) × 30 × scenario factor. Factors of 75%, 100%, and 125% are illustrative planning assumptions, not approved company targets.</p>
   <div className="prototype-domain-statbar">{scenarios.map(item=><article key={item.label}><small>{item.label} · {Math.round(item.factor*100)}%</small>
    <strong>{monthlyBasis===null?"Insufficient evidence":currency(Math.max(0,monthlyBasis*item.factor))}</strong></article>)}</div>
   {!evidence&&<p className="prototype-note" role="status">No eligible settled cash transactions were found. A zero forecast would misrepresent missing evidence, so no numeric scenario is presented.</p>}
   {evidence&&total<0&&<p className="prototype-note"><TriangleAlert size={15}/> Refunds exceed collections in this lookback. Scenarios are floored at zero, but the negative net remains visible above.</p>}
   <p className="prototype-note">These scenarios do not include open deals, uncollected invoices, seasonality, expected new accounts, inventory limits, or a verified container goal. They are not a promise of future revenue.</p>
  </section>
  <section className="prototype-panel"><h2>Transaction-level evidence</h2>
   <div className="prototype-controls">
    <label className="prototype-search"><Search size={15}/><input aria-label="Search forecast evidence" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Account, order, date, collection or refund"/></label>
    <label>Sort <select aria-label="Sort cash evidence" value={sort} onChange={e=>setSort(e.target.value as SortField)}><option value="settledAt">Settlement date</option><option value="amount">Net amount</option><option value="customer">Customer</option></select></label>
    <button type="button" onClick={()=>setDescending(d=>!d)}>{descending?"Newest / high first":"Oldest / low first"}</button>
    <button type="button" disabled={!records.length} onClick={exportVisible}><Download size={15}/> Export visible evidence</button>
   </div>
   <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Settled</th><th>Account</th><th>Source order</th><th>Event</th><th>Net cash</th></tr></thead>
    <tbody>{records.map(f=><tr key={f.id}><td>{f.settledAt}</td><td>{accounts.get(f.accountId)??"Restricted"}</td><td><button type="button" className="prototype-link" onClick={()=>navigateToRoute("/sales/orders/"+encodeURIComponent(f.orderId))}>{f.orderId}</button></td><td>{f.kind}</td><td>{currency(f.amount)}</td></tr>)}</tbody></table></div>
   {!records.length&&<p className="prototype-note">No eligible matching evidence for this lookback and permission scope.</p>}
  </section>
 </div>;
}
