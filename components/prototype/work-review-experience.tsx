"use client";

/** Work evidence views only. No task closes, approvals or inventory writes. */
import {useState} from "react";
import {AlertTriangle,ArrowRight,CalendarCheck2,ClipboardCheck,Search,ShieldAlert} from "lucide-react";
import {canAccessPage} from "../../lib/access";
import {buildActionNotices,type ActionNotice} from "../../lib/action-center-policy-v2";
import {orderDeliveryQuantity} from "../../lib/inventory-ledger";
import {useAccounting} from "../../lib/accounting-context";
import {useDelivery} from "../../lib/delivery-context";
import {useFinance} from "../../lib/finance-context";
import {useHcm} from "../../lib/hcm-context";
import {useInventoryLedger} from "../../lib/inventory-ledger-context";
import {useMarketing} from "../../lib/marketing-context";
import {usePerformance} from "../../lib/performance-context";
import {canVisitRoute,routeForPage} from "../../lib/navigation-route-registry";
import {navigateToRoute} from "../../lib/navigation-store";
import {useWorkspace} from "../../lib/workspace-context";
import type {WorkspaceUser} from "../../lib/types";

type WorkRow={id:string;title:string;detail:string;category:string;state:string;date?:string;target?:string;focus?:string;peopleTab?:string};
const date=(raw?:string)=>raw?.slice(0,10)||"Date not recorded";
function Title({heading,description}:{heading:string;description:string}){
  return <header className="prototype-heading"><h1>{heading}</h1><p>{description}</p></header>;
}
function Empty({children}:{children:React.ReactNode}){return <div className="prototype-empty">{children}</div>}
function LinkRow({item,user}:{item:WorkRow;user:WorkspaceUser}){
  const allowed=item.target&&canVisitRoute(user,item.target);
  const open=()=>{
    if(!item.target||!allowed)return;
    if(typeof window!=="undefined"){
      if(item.focus)window.sessionStorage.setItem("momentum-focus-record",item.focus);
      if(item.peopleTab)window.sessionStorage.setItem("momentum-people-tab",item.peopleTab);
    }
    navigateToRoute(item.target);
  };
  return <tr><td><strong>{item.title}</strong><small className="prototype-description">{item.detail}</small></td>
    <td>{item.category}</td><td>{item.state}</td><td>{date(item.date)}</td>
    <td>{allowed?<button type="button" className="prototype-link" onClick={open}>Open source<ArrowRight size={13}/></button>:"Not linked"}</td></tr>;
}
function NoticeTarget({notice,accountIds,orderIds}:{notice:ActionNotice;accountIds:Set<string>;orderIds:Set<string>}){
  if(!notice.page)return null;
  if(notice.category==="Approvals")return "/work/approvals";
  if(notice.page==="orders"&&notice.focus&&orderIds.has(notice.focus))return "/sales/orders/"+encodeURIComponent(notice.focus);
  if(notice.page==="accounts"&&notice.focus&&accountIds.has(notice.focus))return "/sales/customers/"+encodeURIComponent(notice.focus);
  return routeForPage(notice.page);
}
export function WorkExceptionsExperience(){
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
  const [criticalOnly,setCriticalOnly]=useState(false);
  if(!currentUser||currentUser.role==="Customer")return <Empty>This employee work queue is not available.</Empty>;
  const actions=buildActionNotices({data,scope,currentUser,hcm,performance,finance,marketing,accounting,accountingEvents:events,ledger,delivery})
    .filter(a=>a.urgency==="Blocking"||a.urgency==="Due");
  const accountIds=new Set(scope.accounts.map(a=>a.id));
  const orderIds=new Set(scope.orders.map(o=>o.id));
  const rows:WorkRow[]=actions.map(a=>({
    id:a.id,title:a.title,detail:a.detail,category:a.category,
    state:a.urgency==="Blocking"?"Blocking":"Due",date:a.occurredAt,
    target:NoticeTarget({notice:a,accountIds,orderIds})??undefined,focus:a.focus,peopleTab:a.peopleTab,
  }));
  if(canAccessPage(currentUser,"inventory"))for(const lot of scope.inventory.filter(l=>l.status==="Quality hold"))
    rows.push({id:"quality-hold:"+lot.id,title:"Quality hold: "+lot.lotCode,
      detail:lot.product+" · "+(lot.holdReason||"Reason not recorded"),
      category:"Inventory",state:"Hold",date:lot.receivedAt,target:"/inventory/lots/"+encodeURIComponent(lot.id)});
  if(["Administrator","Operations","Warehouse"].includes(currentUser.role))
    for(const task of delivery.tasks.filter(t=>t.status==="Delivered")){
      const order=scope.orders.find(o=>o.id===task.orderId);
      if(!order)continue;
      const posted=orderDeliveryQuantity(ledger,order.id);
      if(posted>=order.cases)continue;
      rows.push({id:"delivery-posting:"+task.id,title:"Delivery posting mismatch: "+order.number,
        detail:posted+" of "+order.cases+" ordered cases have recorded delivery postings",
        category:"Delivery",state:"Blocking",date:task.deliveredAt,
        target:"/inventory/shipments/"+encodeURIComponent(order.id)});
    }
  const categories=[...new Set(rows.map(r=>r.category))].sort();
  const filtered=rows.filter(r=>(category==="all"||r.category===category)&&(!criticalOnly||r.state==="Blocking"))
    .filter(r=>[r.title,r.detail,r.category,r.state].join(" ").toLowerCase().includes(query.toLowerCase()))
    .sort((a,b)=>{
      const priority=(r:WorkRow)=>r.state==="Blocking"?0:r.state==="Hold"?1:2;
      return priority(a)-priority(b)||(a.date??"").localeCompare(b.date??"")||a.id.localeCompare(b.id);
    });
  return <div><Title heading="Exceptions & risks" description="Blocking work, due items, held stock and recorded delivery mismatches. Every issue comes from a source record."/>
    <div className="prototype-domain-statbar"><article><ShieldAlert size={18}/><small>Blocking</small><strong>{rows.filter(x=>x.state==="Blocking").length}</strong></article>
      <article><CalendarCheck2 size={18}/><small>Due</small><strong>{rows.filter(x=>x.state==="Due").length}</strong></article>
      <article><AlertTriangle size={18}/><small>Inventory holds</small><strong>{rows.filter(x=>x.state==="Hold").length}</strong></article></div>
    <section className="prototype-panel"><div className="prototype-commerce-filters">
      <label className="prototype-search"><Search size={15}/><input aria-label="Search exceptions" placeholder="Search issue, record, category" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <label>Category<select aria-label="Filter exception category" value={category} onChange={e=>setCategory(e.target.value)}><option value="all">All categories</option>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
      <label className="prototype-checkbox-field"><input type="checkbox" checked={criticalOnly} onChange={e=>setCriticalOnly(e.target.checked)}/> Blocking only</label>
    </div>
    <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Issue</th><th>Source</th><th>Urgency</th><th>Recorded</th><th>Investigate</th></tr></thead><tbody>
      {filtered.map(item=><LinkRow key={item.id} item={item} user={currentUser}/>)}
    </tbody></table></div>
    {!filtered.length&&<Empty>No matching issues are currently visible.</Empty>}
    <p className="prototype-note">This list does not invent missing incidents or close tasks. Resolve issues in their original authorized workflows. A held lot is not automatically lost stock; a delivery mismatch needs custody investigation.</p>
    </section></div>;
}
export function CompletedWorkExperience(){
  const {scope,currentUser}=useWorkspace();
  const {state:delivery}=useDelivery();
  const {ledger}=useInventoryLedger();
  const [query,setQuery]=useState("");
  const [category,setCategory]=useState("all");
  const [newest,setNewest]=useState(true);
  if(!currentUser||currentUser.role==="Customer")return <Empty>This employee history view is not available.</Empty>;
  const rows:WorkRow[]=scope.approvals.filter(a=>a.status==="Approved"||a.status==="Returned").map(a=>({
    id:"approval:"+a.id,title:a.title,detail:a.detail,category:"Approval review",
    state:a.status==="Approved"?"Approved":"Returned for correction",
    date:a.decidedAt,target:"/work/approvals",focus:a.recordId,
  }));
  if(canAccessPage(currentUser,"orders")){
    const orders=new Map(scope.orders.filter(o=>!o.testOnly).map(o=>[o.id,o]));
    for(const task of delivery.tasks.filter(t=>t.status==="Delivered"&&Boolean(t.signature))){
      const order=orders.get(task.orderId);
      if(!order)continue;
      const recipientEvidence=Boolean(task.signature?.strokes.length&&task.signature?.signedAt&&task.history.some(e=>e.type==="Delivered"&&e.actorId===task.signature?.capturedBy));
      const posted=orderDeliveryQuantity(ledger,order.id);
      if(!recipientEvidence||posted<order.cases)continue;
      rows.push({id:"delivery:"+task.id,title:"Delivery evidence: "+order.number,
        detail:order.cases+" cases posted and recipient signature recorded",
        category:"Delivery",state:"Evidence recorded",date:task.deliveredAt,
        target:"/inventory/shipments/"+encodeURIComponent(order.id)});
    }
  }
  const categories=[...new Set(rows.map(x=>x.category))].sort();
  const filtered=rows.filter(r=>(category==="all"||r.category===category)&&[r.title,r.detail,r.state].join(" ").toLowerCase().includes(query.toLowerCase()))
    .sort((a,b)=>(newest?-1:1)*(a.date??"").localeCompare(b.date??"")||a.id.localeCompare(b.id));
  return <div><Title heading="Reviewed & completed work" description="Recorded approval decisions and proof-linked deliveries. A returned request is a review outcome, not completed customer work."/>
    <div className="prototype-domain-statbar"><article><ClipboardCheck size={18}/><small>Approved reviews</small><strong>{rows.filter(r=>r.state==="Approved").length}</strong></article>
      <article><CalendarCheck2 size={18}/><small>Returned for correction</small><strong>{rows.filter(r=>r.state==="Returned for correction").length}</strong></article>
      <article><ShieldAlert size={18}/><small>Deliveries with recorded proof</small><strong>{rows.filter(r=>r.category==="Delivery").length}</strong></article></div>
    <section className="prototype-panel"><div className="prototype-commerce-filters">
      <label className="prototype-search"><Search size={15}/><input aria-label="Search reviewed work" placeholder="Search reviews, orders or outcomes" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <label>Record type<select aria-label="Filter reviewed work" value={category} onChange={e=>setCategory(e.target.value)}><option value="all">All recorded outcomes</option>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
      <label>Decision date<select aria-label="Sort reviewed work date" value={newest?"newest":"oldest"} onChange={e=>setNewest(e.target.value==="newest")}><option value="newest">Newest recorded</option><option value="oldest">Oldest recorded</option></select></label>
    </div>
    <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Recorded outcome</th><th>Category</th><th>Status</th><th>Date</th><th>Open</th></tr></thead><tbody>
      {filtered.map(item=><LinkRow key={item.id} item={item} user={currentUser}/>)}
    </tbody></table></div>
    {!filtered.length&&<Empty>No matching decision or delivery evidence records.</Empty>}
    <p className="prototype-note">These are recorded workflow outcomes, not a payroll or performance scorecard. Delivery proof still requires authoritative server verification before external representation; payment settlement is always separate.</p>
    </section></div>;
}
