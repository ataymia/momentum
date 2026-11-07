"use client";

/** Action Center is a read-only source-linked work queue, never a second task ledger. */
import {useState} from "react";
import {ExternalLink,Search} from "lucide-react";
import {buildActionNotices,type ActionNotice,type ActionUrgency} from "../../lib/action-center-policy-v2";
import {useAccounting} from "../../lib/accounting-context";
import {useDelivery} from "../../lib/delivery-context";
import {useFinance} from "../../lib/finance-context";
import {useHcm} from "../../lib/hcm-context";
import {useInventoryLedger} from "../../lib/inventory-ledger-context";
import {useMarketing} from "../../lib/marketing-context";
import {usePerformance} from "../../lib/performance-context";
import {useWorkspace} from "../../lib/workspace-context";
import {MeetingActionQueue} from "./workspace-meetings-experience";
import {navigateToRoute} from "../../lib/navigation-store";
import {canVisitRoute,routeForPage} from "../../lib/navigation-route-registry";

const urgencyOrder:Record<ActionUrgency,number>={Blocking:0,Due:1,Review:2,Watch:3};
const dateLabel=(raw?:string)=>raw&&Number.isFinite(Date.parse(raw))?
  new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric"}).format(new Date(raw)):"Date not recorded";

export function ActionCenterExperience(){
  const {data,scope,currentUser}=useWorkspace();
  const {hcm}=useHcm();
  const {performance}=usePerformance();
  const {state:delivery}=useDelivery();
  const {finance}=useFinance();
  const {state:marketing}=useMarketing();
  const {accounting,events}=useAccounting();
  const {ledger}=useInventoryLedger();
  const [query,setQuery]=useState("");
  const [category,setCategory]=useState("all");
  const [urgency,setUrgency]=useState("all");
  const [sort,setSort]=useState<"urgency"|"newest"|"oldest"|"category">("urgency");
  const actions=currentUser&&currentUser.role!=="Customer"?
    buildActionNotices({data,scope,currentUser,hcm,performance,finance,marketing,accounting,accountingEvents:events,ledger,delivery}):[];
  if(!currentUser||currentUser.role==="Customer")return <div className="prototype-empty">This employee workspace is not available to this account.</div>;
  const rows=[...actions].filter(item=>category==="all"||item.category===category)
    .filter(item=>urgency==="all"||item.urgency===urgency)
    .filter(item=>[item.title,item.detail,item.category,item.urgency].join(" ").toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a,b)=>{
      if(sort==="category")return a.category.localeCompare(b.category)||a.title.localeCompare(b.title);
      if(sort==="urgency")return urgencyOrder[a.urgency]-urgencyOrder[b.urgency]||a.title.localeCompare(b.title);
      const order=(a.occurredAt??"").localeCompare(b.occurredAt??"");
      return (sort==="newest"?-1:1)*order||a.title.localeCompare(b.title);
    });
  const linkFor=(item:ActionNotice):string|undefined=>{
    if(!item.page)return;
    if(item.category==="Approvals"&&item.id.startsWith("approval:"))return "/work/approvals";
    if(item.page==="orders"&&item.focus&&scope.orders.some(o=>o.id===item.focus))return "/sales/orders/"+encodeURIComponent(item.focus);
    if(item.page==="accounts"&&item.focus&&scope.accounts.some(a=>a.id===item.focus))return "/sales/customers/"+encodeURIComponent(item.focus);
    return routeForPage(item.page);
  };
  const go=(item:ActionNotice)=>{
    const target=linkFor(item);
    if(!target)return;
    if(typeof window!=="undefined"){
      if(item.focus)window.sessionStorage.setItem("momentum-focus-record",item.focus);
      if(item.peopleTab)window.sessionStorage.setItem("momentum-people-tab",item.peopleTab);
      if(item.weeklyWeekStart)window.sessionStorage.setItem("momentum-weekly-report-week",item.weeklyWeekStart);
    }
    navigateToRoute(target);
  };
  const categories=[...new Set(actions.map(item=>item.category))].sort();
  return <div className="prototype-domain">
    <header className="prototype-heading"><h1>Action Center</h1><p>Open work requiring follow-up. Each entry comes from an existing approval, assignment, or operational source record.</p></header>
    <div className="prototype-page-actionbar">
      {canVisitRoute(currentUser,"/work/exceptions")&&<button type="button" className="prototype-primary-action" onClick={()=>navigateToRoute("/work/exceptions")}>Review exceptions & risks</button>}
      {canVisitRoute(currentUser,"/work/approvals")&&<button type="button" onClick={()=>navigateToRoute("/work/approvals")}>Open approval queue</button>}
      <span className="prototype-note">Action Center summarizes outstanding work; decisions happen in the authorized source workflow.</span>
    </div>
    <div className="prototype-domain-statbar">
      <article><small>Open action notices</small><strong>{actions.length}</strong></article>
      <article><small>Blocking</small><strong>{actions.filter(item=>item.urgency==="Blocking").length}</strong></article>
      <article><small>Due</small><strong>{actions.filter(item=>item.urgency==="Due").length}</strong></article>
      <article><small>Review</small><strong>{actions.filter(item=>item.urgency==="Review").length}</strong></article>
    </div>
    <MeetingActionQueue/>
    <section className="prototype-panel">
      <div className="prototype-commerce-filters">
        <label className="prototype-search"><Search size={16}/><input aria-label="Search action center" placeholder="Search assigned work, category or details" value={query} onChange={e=>setQuery(e.target.value)}/></label>
        <label>Category<select aria-label="Filter action category" value={category} onChange={e=>setCategory(e.target.value)}><option value="all">All categories</option>{categories.map(x=><option key={x}>{x}</option>)}</select></label>
        <label>Urgency<select aria-label="Filter action urgency" value={urgency} onChange={e=>setUrgency(e.target.value)}><option value="all">All priorities</option>{(["Blocking","Due","Review","Watch"] as const).map(x=><option key={x}>{x}</option>)}</select></label>
        <label>Order<select aria-label="Sort action center" value={sort} onChange={e=>setSort(e.target.value as typeof sort)}><option value="urgency">Urgency first</option><option value="newest">Newest dated</option><option value="oldest">Oldest dated</option><option value="category">Category A–Z</option></select></label>
      </div>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>
        <th>Action</th><th>Category</th><th>Urgency</th><th>Date recorded</th><th>Open source</th>
      </tr></thead><tbody>{rows.map(item=><tr key={item.id}>
        <td><strong>{item.title}</strong><small className="prototype-description">{item.detail}</small></td>
        <td>{item.category}</td><td><span className="prototype-status">{item.urgency}</span></td><td>{dateLabel(item.occurredAt)}</td>
        <td>{linkFor(item)?<button type="button" className="prototype-link" onClick={()=>go(item)}>Open<ExternalLink size={13}/></button>:<span className="prototype-note">No linked module</span>}</td>
      </tr>)}</tbody></table></div>
      {!rows.length&&<div className="prototype-empty">No open actions match these filters.</div>}
      <p className="prototype-note">This list is not a notification inbox. Clearing a bell alert does not close the associated approval or task. Complete it in its authoritative workflow. Undated notices are marked as such rather than assigned the current time.</p>
    </section>
  </div>;
}
