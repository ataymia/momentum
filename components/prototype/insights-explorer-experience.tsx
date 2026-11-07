"use client";

import {useMemo,useState} from "react";
import {BarChart3,Download,Search,ShieldAlert} from "lucide-react";
import {useCommerce} from "../../lib/commerce-context";
import {collectedCashFacts,resolvedPaidOrderFacts} from "../../lib/commercial-source";
import {arizonaDateKey} from "../../lib/date-time";
import {useHcm} from "../../lib/hcm-context";
import {insightCashSummary} from "../../lib/insights-cash-summary";
import {ambiguousSettledRefundIds} from "../../lib/reporting-cash-reconciliation";
import {useInventoryLedger} from "../../lib/inventory-ledger-context";
import {nodeLotBalance,warehouseAvailable,warehouseNodeId} from "../../lib/inventory-ledger";
import {downloadCsv} from "../../lib/browser-export";
import {navigateToRoute} from "../../lib/navigation-store";
import {useWorkspace} from "../../lib/workspace-context";

type Focus="Commercial"|"Operations"|"People";
type Sort="date"|"category"|"name"|"amount"|"quantity";
type EvidenceRow={id:string;name:string;date:string;category:string;detail:string;amount:number|null;quantity:number|null;source:string;destination?:string};
const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n);
const ago=(key:string,days:number)=>{const date=new Date(key+"T00:00:00.000Z");date.setUTCDate(date.getUTCDate()-days);return date.toISOString().slice(0,10);};

export function InsightsExplorerExperience(){
 const {currentUser,scope,data}=useWorkspace(),{commerce}=useCommerce(),{hcm}=useHcm(),{ledger}=useInventoryLedger();
 const today=arizonaDateKey();
 const [from,setFrom]=useState(()=>ago(today,89)),[through,setThrough]=useState(today);
 const [selection,setSelection]=useState<Focus>("Commercial");
 const [query,setQuery]=useState(""),[category,setCategory]=useState("all");
 const [sort,setSort]=useState<Sort>("date"),[descending,setDescending]=useState(true);
 const role=currentUser?.role;
 const allowed:Focus[]=[
  ...(["Administrator","Sales Manager","Sales Representative","Operations"].includes(role??"")?["Commercial" as const]:[]),
  ...(["Administrator","Operations","Warehouse","Delivery Driver"].includes(role??"")?["Operations" as const]:[]),
  ...(role==="Administrator"?["People" as const]:[])
 ];
 const focus=allowed.includes(selection)?selection:allowed[0];
 const visibleOrders=useMemo(()=>new Set(scope.orders.filter(o=>!o.testOnly).map(o=>o.id)),[scope.orders]);
 const accounts=new Map(scope.accounts.map(a=>[a.id,a.name]));
 const orderNames=new Map(scope.orders.map(o=>[o.id,o.number]));
 const unresolvedRefundIds=useMemo(()=>ambiguousSettledRefundIds(commerce,visibleOrders,from,through),[commerce,visibleOrders,from,through]);
 const unresolvedRefundSet=new Set(unresolvedRefundIds);
 const refundAllocationBlocked=unresolvedRefundIds.length>0;
 const cash=useMemo(()=>collectedCashFacts(data,commerce).filter(f=>visibleOrders.has(f.orderId)&&!unresolvedRefundSet.has(f.id)),[data,commerce,visibleOrders,unresolvedRefundIds]);
 const paid=useMemo(()=>resolvedPaidOrderFacts(data,commerce).filter(f=>visibleOrders.has(f.orderId)),[data,commerce,visibleOrders]);
 const summary=useMemo(()=>insightCashSummary(cash,paid,from,through),[cash,paid,from,through]);
 const invalid=from>through;
 const lots=scope.inventory.map(lot=>({lot,onHand:Math.max(0,nodeLotBalance(ledger,warehouseNodeId,lot.id)),available:lot.status==="Quality hold"?0:warehouseAvailable(ledger,lot.id)}));
 const staffName=(id:string)=>data.users.find(u=>u.id===id)?.name??"Employee";
 const commercialRows:EvidenceRow[]=cash.filter(f=>!invalid&&f.settledAt>=from&&f.settledAt<=through).map(f=>({
  id:f.kind+"-"+f.id,name:accounts.get(f.accountId)??"Restricted customer",date:f.settledAt,
  category:f.kind,detail:"Order "+(orderNames.get(f.orderId)??f.orderId),amount:f.amount,quantity:null,
  source:"Commerce cash ledger",destination:"/sales/orders/"+encodeURIComponent(f.orderId)
 }));
 const operationalRows:EvidenceRow[]=lots.map(({lot,onHand,available})=>({
   id:"lot-"+lot.id,name:lot.product,date:lot.receivedAt,category:lot.status,
   detail:"Lot "+lot.lotCode+" · "+lot.location+" · warehouse available "+available+" cs · best by "+lot.bestBy,
   amount:null,quantity:onHand,source:"Warehouse custody ledger",destination:"/inventory/ledger"
 }));
 const peopleRows:EvidenceRow[]=role==="Administrator"?hcm.employees.map(e=>({
   id:"employee-"+e.userId,name:staffName(e.userId),date:e.hireDate??"",
   category:e.status,detail:e.jobTitle+" · "+e.department+" · "+e.classification,
   amount:null,quantity:null,source:"Human Resources employee register",
   destination:"/admin/employee-profiles/"+encodeURIComponent(e.userId)
 })):[];
 const rawRows=focus==="Commercial"?commercialRows:focus==="Operations"?operationalRows:peopleRows;
 const categories=[...new Set(rawRows.map(r=>r.category))].sort();
 const rows=rawRows.filter(r=>(category==="all"||r.category===category)&&
  [r.id,r.name,r.date,r.category,r.detail,r.source].join(" ").toLowerCase().includes(query.trim().toLowerCase()))
  .sort((a,b)=>{
   const left=a[sort],right=b[sort];
   const cmp=typeof left==="number"&&typeof right==="number"?left-right:String(left??"").localeCompare(String(right??""));
   return (descending?-1:1)*cmp||a.id.localeCompare(b.id);
  });
 const exportRows=()=>downloadCsv("momentum-authorized-insights.csv",rows.map(r=>({
  id:r.id,record:r.name,recordDate:r.date,category:r.category,detail:r.detail,
  signedCash:r.amount??"",casesOrUnits:r.quantity??"",source:r.source
 })),["id","record","recordDate","category","detail","signedCash","casesOrUnits","source"]);
 const maxMonthly=Math.max(1,...summary.months.map(row=>Math.abs(row.net)));
 const rules=focus==="Commercial"?[
  ["Net collected cash","Sum cleared payment allocations less settled refunds, within selected settled dates; test orders excluded.","Commerce allocations, payments and settled refunds","After bank clearing and refund settlement","Finance","Refund links spanning invoices can affect order attribution","Reconcile source payments and negative balances"],
  ["Marked paid orders / cases","Distinct marked-paid order IDs and their actual case quantities; legacy paid states may lack bank settlement evidence.","Invoices and order payment status","After recording payment state","Sales / Finance","Unverified legacy status can overstate paid volume","Reconcile to cleared cash before compensation"],
  ["Reordered accounts","Unique account IDs with at least a second marked-paid order dated within the period; earlier history is retained.","Paid-order history, scoped to accessible orders","After purchase and source sync","Sales leadership","Duplicate locations or order status can distort retention","Audit customer consolidation and reorder source"]
 ]:focus==="Operations"?[
  ["Warehouse stock","Positive custody-ledger lot balances at the warehouse node, by authorized inventory lot.","Warehouse custody ledger","After stock movement is recorded","Operations","Late adjustments and hold states can distort quantities","Reconcile physical count and holds before promising product"],
  ["Warehouse availability","Custody-lot balance less active reservations and quality holds.","Warehouse ledger and reservation records","After reservation update","Operations","Unposted transfers or holds can oversell product","Investigate negative or missing lots"]
 ]:[
  ["Employee status","Count of current HR employee records by status. This is not verified payroll headcount.","HR employment records","After authorized HR update","HR / Administration","Duplicate, unverified or stale personnel records","Review classification and offboarding evidence"],
  ["Training / leave evidence","Statuses stored in HR source workflows, not payroll-adjusted liability or statutory compliance proof.","HR leave and training ledgers","After case or review update","HR / Administration","Incomplete evidence can falsely signal readiness","Open personnel and compliance controls"]
 ];
 if(!currentUser||!allowed.length)return <div className="prototype-empty">No Insights Explorer permission is available for this role.</div>;
 return <div className="prototype-domain">
  <header className="prototype-heading"><h1><BarChart3 size={19}/> Insights Explorer</h1>
   <p>Recorded commercial, operational and workforce evidence with defined formulas and source drill-downs. This screen never invents a target or treats a demo record as a live sale.</p></header>
  <section className="prototype-panel">
   <div className="prototype-controls">{allowed.map(item=><button key={item} type="button" aria-pressed={focus===item} onClick={()=>{setSelection(item);setCategory("all");}}>{item}</button>)}</div>
   {focus==="Commercial"?<div className="prototype-controls">
    <label>Settled from <input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
    <label>Through <input type="date" value={through} onChange={e=>setThrough(e.target.value)}/></label>
    {invalid&&<p role="alert">The end date must not precede the start date.</p>}
   </div>:<p className="prototype-note">Current source snapshot. The dates in the table are record dates, not a historical inventory or HR snapshot. Date filters apply to commercial cash only.</p>}
   {focus==="Commercial"?<>
    <div className="prototype-domain-statbar">
     <article><small>Cleared collections</small><strong>{invalid?"Invalid period":money(summary.collections)}</strong></article>
     <article><small>Settled refunds</small><strong>{invalid?"Invalid period":refundAllocationBlocked?"Needs allocation":money(summary.refunds)}</strong></article>
     <article><small>Net collected cash</small><strong>{invalid?"Invalid period":refundAllocationBlocked?"Needs reconciliation":money(summary.net)}</strong></article>
     <article><small>Marked-paid cases</small><strong>{invalid?"Invalid period":summary.markedPaidCases}</strong></article>
     <article><small>Accounts with a reorder</small><strong>{invalid?"Invalid period":summary.reorderAccounts}</strong></article>
    </div>
    {refundAllocationBlocked&&<p role="alert" className="prototype-note">{unresolvedRefundIds.length} settled refund(s) span multiple orders. Net cash and monthly charts are withheld until the source payment is reconciled.</p>}
    {!cash.length&&!refundAllocationBlocked&&<p className="prototype-note" role="status">No eligible cleared cash source facts were located. This is a missing-evidence state, not a verified zero-revenue claim.</p>}
    <h2>Collections by recorded settlement month</h2>
    {!refundAllocationBlocked&&summary.months.length?summary.months.map(m=><div className="prototype-work-list" key={m.month}><strong>{m.month} · net {money(m.net)}</strong><progress aria-label={"Absolute net cash activity for "+m.month} max={maxMonthly} value={Math.abs(m.net)}/><span>Collections {money(m.collections)} · refunds {money(m.refunds)}{m.net<0?" · negative net":""}</span></div>):
    <p className="prototype-note">No cash transactions with eligible dates in this period.</p>}
    <p className="prototype-note"><ShieldAlert size={14}/> Marked-paid counts may include legacy order statuses. Only cleared allocations and attributable settled refunds enter cash summaries. Ambiguous refunds are excluded from detail exports and block net results.</p>
   </>:focus==="Operations"?<div className="prototype-domain-statbar">
    <article><small>Authorized inventory lots</small><strong>{lots.length}</strong></article>
    <article><small>Warehouse on-hand cases</small><strong>{lots.reduce((n,r)=>n+r.onHand,0)}</strong></article>
    <article><small>Warehouse available cases</small><strong>{lots.reduce((n,r)=>n+r.available,0)}</strong></article>
    <article><small>Quality hold lots</small><strong>{lots.filter(r=>r.lot.status==="Quality hold").length}</strong></article>
   </div>:<div className="prototype-domain-statbar">
    <article><small>Recorded active employees</small><strong>{hcm.employees.filter(e=>e.status==="Active").length}</strong></article>
    <article><small>Submitted leave requests</small><strong>{hcm.leaveRequests.filter(e=>e.status==="Submitted").length}</strong></article>
    <article><small>Missing HR documents</small><strong>{hcm.documents.filter(e=>e.status==="Missing").length}</strong></article>
    <article><small>Incomplete training assignments</small><strong>{hcm.training.filter(e=>e.status!=="Complete").length}</strong></article>
   </div>}
  </section>
  <section className="prototype-panel"><h2>Source record drill-down</h2>
    <div className="prototype-controls">
      <label className="prototype-search"><Search size={15}/><input aria-label="Search report evidence" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Account, source, category or record"/></label>
      <label>Category <select aria-label="Report category" value={category} onChange={e=>setCategory(e.target.value)}><option value="all">All</option>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
      <label>Sort <select aria-label="Sort report rows" value={sort} onChange={e=>setSort(e.target.value as Sort)}>{(["date","category","name","amount","quantity"] as Sort[]).map(v=><option key={v} value={v}>{v}</option>)}</select></label>
      <button type="button" onClick={()=>setDescending(v=>!v)}>{descending?"Descending":"Ascending"}</button>
      <button type="button" disabled={!rows.length} onClick={exportRows}><Download size={15}/> Export visible evidence</button>
    </div>
    <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Record</th><th>Source date</th><th>Category</th><th>Evidence</th><th>Amount</th><th>Cases</th><th>Source</th></tr></thead><tbody>
      {rows.map(row=><tr key={row.id}><td>{row.destination?<button type="button" className="prototype-link" onClick={()=>navigateToRoute(row.destination!)}>{row.name}</button>:row.name}</td>
       <td>{row.date||"Not supplied"}</td><td>{row.category}</td><td>{row.detail}</td>
       <td>{row.amount===null?"—":money(row.amount)}</td><td>{row.quantity??"—"}</td><td>{row.source}</td></tr>)}
    </tbody></table></div>
    {!rows.length&&<p className="prototype-note">No matching permitted records. No source facts have been fabricated to fill the report.</p>}
  </section>
  <section className="prototype-panel"><h2>Metric governance & action rules</h2>
   <p className="prototype-note">Frequency: reviewed weekly and at monthly close. Data is refreshed from the existing client source after successful synchronization; the dashboard does not certify server freshness.</p>
   {rules.map(rule=><article key={rule[0]} className="prototype-insight-rule"><strong>{rule[0]}</strong><p>Definition: {rule[1]}</p><p>Source: {rule[2]} · Lag: {rule[3]} · Owner: {rule[4]}</p><p>Gaming/data risk: {rule[5]} · Action: {rule[6]}</p></article>)}
   <p className="prototype-note">Auditing method: reconcile the exported row IDs against original source records and cleared bank/provider evidence. Targets, bonuses, sell-through and container economics require separately approved definitions.</p>
  </section>
 </div>;
}
