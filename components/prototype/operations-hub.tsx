"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowUpDown, ExternalLink, Search } from "lucide-react";
import { canVisitRoute, routeEntry, routeLabel } from "../../lib/navigation-route-registry";
import { navigateToRoute, useNavigationRoute } from "../../lib/navigation-store";
import { GOLDEN_EAGLE_SKUS, skuForProductName } from "../../lib/product-catalog";
import { orderFirstSettlementDate } from "../../lib/bonus-engine";
import { useWorkspace } from "../../lib/workspace-context";
import {useRuntimeMode} from "../../lib/runtime-mode";
import {momentumStorage} from "../../lib/persistence";
import { TerritoryPanel } from "../crm/territory-panel";
import { AdminEmployeeProfiles } from "../hcm/admin-employee-profiles";
import { EmployeeDirectory } from "../hcm/employee-directory";
import { PeopleExperience } from "./hr-payroll-experiences";
import {PayrollWorkflowExperience} from "./payroll-workflow-experience";
import {HrOnboardingExperience} from "./hr-onboarding-experience";
import {InvoicePrintCenter} from "../finance/invoice-print-center";
import {downloadCsv} from "../../lib/browser-export";
import {accountExportColumns,accountExportRows,contactExportColumns,contactExportRows,authorizedCustomerOrders,authorizedCustomerOrder,customerDeliveryColumns,customerDeliveryExportRows,filterCustomerDeliveries} from "../../lib/saturday-scoped-workflows";
import {invoiceBalance,computedInvoiceStatus} from "../../lib/commerce-engine";
import {projectCustomerFinance,customerPaymentColumns,customerStatementColumns} from "../../lib/customer-finance-registers";
import {useCommerce} from "../../lib/commerce-context";
import {MarketingWorkspaceExperience} from "./marketing-workspace-experience";
import {MarketingPage as LegacyMarketingPage} from "../pages/marketing";
import {HrPersonnelDirectory,HrPersonnelRecord} from "./hr-personnel-experience";
import {HrTimeOffExperience} from "./hr-time-off-experience";
import {HrNewHireExperience} from "./hr-new-hire-experience";
import {NewHireProvisioning} from "../hcm/new-hire-provisioning";
import {PayrollPage as LegacyPayrollPage} from "../pages/payroll";
import { AccountConsolidationReview } from "./account-consolidation-review";
import { OrdersDirectory, OrderDetail, InvoiceDirectory, InvoiceDetail, PaymentsDirectory, PaymentDetail } from "./commerce-experience";
import { InventoryDirectory, InventoryLotDetail, InventoryLedgerDirectory, InventoryAdjustmentDirectory } from "./inventory-experience";
import {PackagesDirectory,ShipmentsDirectory,ShipmentDetail,DeliveryOperationsDirectory} from "./fulfillment-experience";
import {OrderEditor,OrderApprovalDirectory} from "./order-actions";
import {ActionCenterExperience} from "./action-center-experience";
import {WorkspaceHome} from "./workspace-home";
import {SalesReturnsDirectory,SalesReturnDetail,CreditNotesDirectory,CreditNoteDetail} from "./returns-credits-experience";
import {WorkExceptionsExperience,CompletedWorkExperience} from "./work-review-experience";
import type { Order } from "../../lib/types";

function Empty({ children }: { children: ReactNode }) {
  return <div className="prototype-empty">{children}</div>;
}
function OpenLink({ to, children }: {to: string;children: ReactNode}) {
  return <button type="button" className="prototype-link" onClick={() => navigateToRoute(to)}>{children}<ExternalLink size={13}/></button>;
}
function Heading({title,description,back}:{title:string;description:string;back?:string}){
  return <header className="prototype-heading">
    {back&&<button type="button" className="prototype-back" onClick={()=>navigateToRoute(back)}><ArrowLeft size={15}/> Back to list</button>}
    <h1>{title}</h1><p>{description}</p>
  </header>;
}
function Tabs({items,current,base}:{items:{key:string;label:string}[];current:string;base:string}){
  return <nav className="prototype-tabs" aria-label="Record sections">{items.map(item=>
    <button key={item.key} type="button" aria-current={current===item.key?"page":undefined} className={current===item.key?"is-active":""} onClick={()=>navigateToRoute(base+(item.key==="overview"?"":"/"+item.key))}>{item.label}</button>
  )}</nav>;
}
const CUSTOMER_TABS=[{key:"overview",label:"Overview"},{key:"comments",label:"Comments"},{key:"transactions",label:"Transactions"},{key:"mails",label:"Mails"},{key:"statements",label:"Statements"},{key:"locations",label:"Locations"}];
const ITEM_TABS=[{key:"overview",label:"Overview"},{key:"transactions",label:"Transactions"},{key:"stock",label:"Stock Locations"},{key:"history",label:"History"}];
const safeTab=(value:string|undefined,allowed:{key:string}[])=>(allowed.some(tab=>tab.key===value)?value:"overview")??"overview";

type AccountsSortField="name"|"location"|"contactName"|"stage"|"postalCode"|"ownerId"|"nextActionDate";
function AccountsDirectory({leadMode=false}:{leadMode?:boolean}){
  const {scope,data}=useWorkspace();
  const [query,setQuery]=useState("");
  const [sort,setSort]=useState<AccountsSortField>("name");
  const [ascending,setAscending]=useState(true);
  const [repFilter,setRepFilter]=useState("all");
  const [stageFilter,setStageFilter]=useState("all");
  const [fromDate,setFromDate]=useState("");
  const [throughDate,setThroughDate]=useState("");
  const names=useMemo(()=>new Map(data.users.map(u=>[u.id,u.name])),[data.users]);
  const records=useMemo(()=>scope.accounts
    .filter(a=>!leadMode||["Prospect","Qualified","Sampled"].includes(a.stage))
    .filter(a=>repFilter==="all"||a.ownerId===repFilter)
    .filter(a=>stageFilter==="all"||a.stage===stageFilter)
    .filter(a=>(!fromDate||a.nextActionDate>=fromDate)&&(!throughDate||a.nextActionDate<=throughDate))
    .filter(a=>[a.name,a.location,a.contactName,a.postalCode,a.email,names.get(a.ownerId)].join(" ").toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a,b)=>{
      const value=(loc:typeof a)=>sort==="ownerId"?names.get(loc.ownerId)??"":String(loc[sort]??"");
      return (ascending?1:-1)*(value(a).localeCompare(value(b),undefined,{numeric:true})||a.id.localeCompare(b.id));
    }),[scope.accounts,leadMode,repFilter,stageFilter,fromDate,throughDate,query,sort,ascending,names]);
  const selectSort=(field:AccountsSortField)=>{if(sort===field)setAscending(v=>!v);else{setSort(field);setAscending(true);}};
  const header=(field:AccountsSortField,label:string)=><button type="button" aria-label={"Sort by "+label} aria-sort={sort===field?(ascending?"ascending":"descending"):undefined} onClick={()=>selectSort(field)}>{label} <ArrowUpDown size={14}/></button>;
  const repIds=[...new Set(scope.accounts.map(a=>a.ownerId).filter(Boolean))].sort((a,b)=>(names.get(a)??"").localeCompare(names.get(b)??""));
  const stages=[...new Set(scope.accounts.map(a=>a.stage))].sort();
  return <div><Heading title={leadMode?"Leads":"Accounts & Customers"} description="Searchable, filtered and sortable business locations. Open any record for its linked customer profile."/>
  <section className="prototype-panel">
    <div className="prototype-controls">
      <label className="prototype-search"><Search size={16}/><input aria-label="Search businesses" placeholder="Business, location, contact, ZIP, rep" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <label>Representative <select aria-label="Filter accounts by representative" value={repFilter} onChange={e=>setRepFilter(e.target.value)}>
        <option value="all">All visible representatives</option>{repIds.map(id=><option key={id} value={id}>{names.get(id)??id}</option>)}</select></label>
      <label>Stage <select aria-label="Filter account stage" value={stageFilter} onChange={e=>setStageFilter(e.target.value)}>
        <option value="all">All stages</option>{stages.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
      <label>Next action from <input type="date" aria-label="Next action from date" value={fromDate} onChange={e=>setFromDate(e.target.value)}/></label>
      <label>Through <input type="date" aria-label="Next action through date" value={throughDate} onChange={e=>setThroughDate(e.target.value)}/></label>
      <button type="button" disabled={!records.length} onClick={()=>downloadCsv(leadMode?"momentum-visible-leads.csv":"momentum-visible-accounts.csv",accountExportRows(records,names),accountExportColumns)}>Download filtered {leadMode?"leads":"accounts"} CSV</button>
    </div>
    <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>
      <th>{header("name","Business")}</th><th>{header("location","Location")}</th><th>{header("contactName","Contact")}</th><th>{header("stage","Stage")}</th><th>{header("postalCode","ZIP")}</th><th>{header("ownerId","Assigned rep")}</th><th>{header("nextActionDate","Next action")}</th>
    </tr></thead><tbody>{records.map(a=><tr key={a.id}>
      <td><OpenLink to={"/sales/customers/"+encodeURIComponent(a.id)}>{a.name}</OpenLink></td><td>{a.location}</td><td>{a.contactName||"Unrecorded"}</td><td>{a.stage}</td><td>{a.postalCode||"Unrecorded"}</td><td>{names.get(a.ownerId)??"Unassigned"}</td><td>{a.nextActionDate||"None"}</td>
    </tr>)}</tbody></table></div>{!records.length&&<Empty>No matching business records.</Empty>}
    <p className="prototype-note">{records.length} matching records. Sorting and filters affect your view only, not account ownership or history.</p>
  </section></div>;
}
function CustomerRecord({id,section}:{id:string;section:string}){
  const {scope,data}=useWorkspace();
  const loc=scope.accounts.find(a=>a.id===id);
  if(!loc)return <Empty>Customer not found or not accessible to your account.</Empty>;
  // Only group by explicitly stored parent ID; never use name matching as evidence of shared ownership.
  const parent=loc.customerId ? (data.customers??[]).find(c=>c.id===loc.customerId) : undefined;
  const locations=loc.customerId ? scope.accounts.filter(a=>a.customerId===loc.customerId) : [loc];
  const ids=new Set(locations.map(a=>a.id));
  const orders=scope.orders.filter(o=>ids.has(o.accountId)&&!o.testOnly).sort((a,b)=>b.placedAt.localeCompare(a.placedAt));
  const activities=scope.activities.filter(a=>a.accountId&&ids.has(a.accountId)).sort((a,b)=>b.at.localeCompare(a.at));
  const path="/sales/customers/"+encodeURIComponent(id),tab=safeTab(section,CUSTOMER_TABS);
  const label=parent?.name??loc.name;
  return <div><Heading title={label} description="Linked customer profile • read-only architecture prototype" back="/sales/customers"/>
    <Tabs base={path} items={CUSTOMER_TABS} current={tab}/>
    {tab==="overview"&&<div className="prototype-columns"><section className="prototype-panel"><h2>Contact & billing details</h2>
      <dl className="prototype-facts"><div><dt>Primary contact</dt><dd>{loc.contactName||"Not recorded"}</dd></div><div><dt>Email</dt><dd>{loc.email||"Not recorded"}</dd></div><div><dt>Phone</dt><dd>{loc.phone||"Not recorded"}</dd></div>
      <div><dt>Billing address / location</dt><dd>{loc.streetAddress??""} {loc.location} {loc.postalCode??""}</dd></div>
      <div><dt>Terms</dt><dd>{parent?.paymentTerms??"Not recorded"}</dd></div><div><dt>Account owner</dt><dd>{data.users.find(u=>u.id===loc.ownerId)?.name??"Unassigned"}</dd></div>
      </dl></section><section className="prototype-panel"><h2>Account activity</h2>
      <div className="prototype-tiles"><div><small>Accessible locations</small><strong>{locations.length}</strong></div><div><small>Sales orders on record</small><strong>{orders.length}</strong></div></div>
      <h3>Recent activity</h3>{activities.slice(0,8).map(a=><p className="prototype-activity" key={a.id}><strong>{a.title}</strong><span>{a.at.slice(0,10)} • {a.detail}</span></p>)}
      {activities.length===0&&<Empty>No recorded activity.</Empty>}</section></div>}
    {tab==="comments"&&<section className="prototype-panel"><h2>Comments and notes</h2><p className="prototype-note">Existing account notes are displayed below. A dedicated audited internal comment thread requires its own write permissions.</p>
      {locations.map(a=><div key={a.id} className="prototype-activity"><strong>{a.locationName??a.name}</strong><span>{a.notes||"No recorded notes"}</span></div>)}</section>}
    {tab==="transactions"&&<section className="prototype-panel"><h2>Sales transactions</h2><table className="prototype-table"><thead><tr><th>Order</th><th>Location</th><th>Date</th><th>Cases</th><th>State</th><th>Payment</th></tr></thead><tbody>{orders.map(o=><tr key={o.id}><td><OpenLink to={"/sales/orders/"+encodeURIComponent(o.id)}>{o.number}</OpenLink></td><td>{locations.find(a=>a.id===o.accountId)?.locationName??locations.find(a=>a.id===o.accountId)?.location??"Unknown"}</td><td>{o.placedAt}</td><td>{o.cases}</td><td>{o.status}</td><td>{o.paymentStatus}</td></tr>)}</tbody></table>{!orders.length&&<Empty>No recorded sales orders.</Empty>}</section>}
    {tab==="mails"&&<section className="prototype-panel"><h2>Customer mail history</h2><Empty>No verified customer-linked outbound or inbound email history is available in this prototype. Gmail remains the company inbox, and the event-mail system requires approved server integration before it can populate this tab.</Empty></section>}
    {tab==="statements"&&<section className="prototype-panel"><h2>Account statements</h2><Empty>Statements must be generated from reconciled invoices, payment allocations, credits, and opening balances in the accounting source. Order totals alone are not a valid customer statement, so no balance is estimated here.</Empty></section>}
    {tab==="locations"&&<section className="prototype-panel"><h2>Related locations</h2><p className="prototype-note">Only explicitly linked customer IDs are grouped. Same-name records are not merged automatically.</p>
      <table className="prototype-table"><thead><tr><th>Location</th><th>ZIP</th><th>Assigned representative</th><th>Account ID</th></tr></thead><tbody>{locations.map(a=><tr key={a.id}><td>{a.locationName??a.name}</td><td>{a.postalCode??"Unknown"}</td><td>{data.users.find(u=>u.id===a.ownerId)?.name??"Unassigned"}</td><td className="prototype-small">{a.id}</td></tr>)}</tbody></table></section>}
  </div>;
}
function matchingLines(order:Order,skuId:string){
  if(order.lines?.length)return order.lines.filter(l=>skuForProductName(l.product)?.id===skuId).map(l=>({cases:l.cases,product:l.product}));
  if(order.testSkuId===skuId||(!order.testSkuId&&order.product&&skuForProductName(order.product)?.id===skuId))return [{cases:order.cases,product:order.product??""}];
  return [];
}
function ProductDirectory(){
  const [query,setQuery]=useState(""); const [asc,setAsc]=useState(true);
  const skus=GOLDEN_EAGLE_SKUS.filter(s=>[s.shortName,s.description,s.id].join(" ").toLowerCase().includes(query.toLowerCase())).sort((a,b)=>(asc?1:-1)*a.shortName.localeCompare(b.shortName));
  return <div><Heading title="Items" description="Product master with connected records, stock locations and transaction history."/>
    <section className="prototype-panel"><div className="prototype-controls"><label className="prototype-search"><Search size={16}/><input aria-label="Search items" placeholder="Search item or SKU" value={query} onChange={e=>setQuery(e.target.value)}/></label><button type="button" onClick={()=>setAsc(!asc)}><ArrowUpDown size={15}/> Name {asc?"A–Z":"Z–A"}</button></div>
      <table className="prototype-table"><thead><tr><th>Item</th><th>SKU</th><th>Case pack</th><th>Status</th></tr></thead><tbody>{skus.map(s=><tr key={s.id}><td><OpenLink to={"/items/"+encodeURIComponent(s.id)}>{s.shortName}</OpenLink><small className="prototype-description">{s.description}</small></td><td>{s.id}</td><td>{s.casePack}</td><td>{s.active?"Active":"Inactive"}</td></tr>)}</tbody></table>
    </section></div>;
}
function ProductRecord({skuId,section}:{skuId:string;section:string}){
  const {scope}=useWorkspace();const sku=GOLDEN_EAGLE_SKUS.find(s=>s.id===skuId);
  if(!sku)return <Empty>Item not found, or it is unavailable.</Empty>;
  const matched=scope.orders.filter(o=>!o.testOnly&&!["Cancelled","Draft"].includes(o.status)).map(o=>({order:o,lines:matchingLines(o,sku.id)})).filter(x=>x.lines.length>0).sort((a,b)=>b.order.placedAt.localeCompare(a.order.placedAt));
  const lots=scope.inventory.filter(l=>skuForProductName(l.product)?.id===sku.id);
  const delivered=matched.filter(x=>["Delivered","Paid"].includes(x.order.status));
  const units=delivered.reduce((n,x)=>n+x.lines.reduce((m,l)=>m+l.cases,0),0);
  const base="/items/"+encodeURIComponent(sku.id),tab=safeTab(section,ITEM_TABS);
  return <div><Heading title={sku.shortName} description={sku.description} back="/items"/><Tabs items={ITEM_TABS} current={tab} base={base}/>
    {tab==="overview"&&<><div className="prototype-metrics"><div><small>Case pack</small><strong>{sku.casePack}</strong></div><div><small>Orders containing item</small><strong>{matched.length}</strong></div><div><small>Cases on delivered/paid orders</small><strong>{units}</strong></div></div>
      <section className="prototype-panel"><h2>Item master</h2><dl className="prototype-facts"><div><dt>SKU</dt><dd>{sku.id}</dd></div><div><dt>Case barcode</dt><dd>{sku.caseBarcode??"Pending verified barcode"}</dd></div><div><dt>Active</dt><dd>{sku.active?"Yes":"No"}</dd></div></dl><p className="prototype-note">Delivered-order counts are not proof of end-consumer sell-through. Historical PO metadata is not current inventory.</p></section></>}
    {tab==="transactions"&&<section className="prototype-panel"><h2>Orders containing this item</h2><table className="prototype-table"><thead><tr><th>Sales order</th><th>Where placed</th><th>Date</th><th>Cases</th><th>Order status</th></tr></thead><tbody>{matched.map(({order,lines})=><tr key={order.id}><td><OpenLink to={"/sales/orders/"+encodeURIComponent(order.id)}>{order.number}</OpenLink></td><td>{scope.accounts.find(a=>a.id===order.accountId)?.name??"Restricted location"}</td><td>{order.placedAt}</td><td>{lines.reduce((n,l)=>n+l.cases,0)}</td><td>{order.status}</td></tr>)}</tbody></table>{!matched.length&&<Empty>No linked item-level order lines found in your accessible records. Legacy orders without product identity are intentionally not attributed to a SKU.</Empty>}</section>}
    {tab==="stock"&&<section className="prototype-panel"><h2>Verified inventory lot records</h2><table className="prototype-table"><thead><tr><th>Warehouse / Bin</th><th>Lot</th><th>On hand</th><th>Available</th><th>Best by</th></tr></thead><tbody>{lots.map(l=><tr key={l.id}><td>{l.location}</td><td>{l.lotCode}</td><td>{l.onHand}</td><td>{l.available}</td><td>{l.bestBy}</td></tr>)}</tbody></table>{!lots.length&&<Empty>No accessible, SKU-matched inventory lot records. Historical supplier quantities do not populate inventory.</Empty>}</section>}
    {tab==="history"&&<section className="prototype-panel"><h2>Item activity</h2><p className="prototype-note">This prototype shows order and lot links, not a full audit history. The existing audit ledger should provide authoritative changes and actors in the completed experience.</p>
      {matched.slice(0,30).map(({order})=><p className="prototype-activity" key={order.id}><strong>{order.placedAt} • {order.number}</strong><span>{order.status} • {scope.accounts.find(a=>a.id===order.accountId)?.name??"Restricted location"}</span></p>)}
      {!matched.length&&<Empty>No linked order activity.</Empty>}</section>}
  </div>;
}
function CalendarPreview({meetingsOnly}:{meetingsOnly:boolean}){
  const {scope,data}=useWorkspace();
  const upcoming=scope.appointments.filter(a=>a.date>=new Date().toISOString().slice(0,10)).sort((a,b)=>a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime));
  return <div><Heading title={meetingsOnly?"Meetings":"Shared calendar"} description="Field appointments currently recorded by Momentum; staff meeting invitations are a separate planned workflow."/>
    <section className="prototype-panel"><h2>Upcoming authorized field appointments</h2><table className="prototype-table"><thead><tr><th>Date</th><th>Time</th><th>Type</th><th>Assigned to</th><th>Business</th></tr></thead><tbody>{upcoming.map(a=><tr key={a.id}><td>{a.date}</td><td>{a.startTime}</td><td>{a.type}</td><td>{data.users.find(u=>u.id===a.ownerId)?.name??"Unassigned"}</td><td>{scope.accounts.find(ac=>ac.id===a.accountId)?.name??"Restricted"}</td></tr>)}</tbody></table>{!upcoming.length&&<Empty>No upcoming field appointments visible to your role.</Empty>}</section>
    <section className="prototype-panel"><h2>Staff meetings: next phase</h2><p>Authorized organizers will schedule a meeting, select attendees, check conflicts, send invitations, add it to each attendee calendar, and display a reminder on Home. This is not an active scheduler yet.</p></section>
  </div>;
}
type IncentiveSortField="name"|"locations"|"cases"|"rep";
function IncentivePreview(){
  const {scope,data}=useWorkspace();
  const [query,setQuery]=useState("");
  const [repFilter,setRepFilter]=useState("all");
  const [sort,setSort]=useState<IncentiveSortField>("name");
  const [ascending,setAscending]=useState(true);
  const names=new Map(data.users.map(u=>[u.id,u.name]));
  const groups=new Map<string,{name:string;ids:Set<string>;reps:Set<string>}>();
  // Only explicitly shared parent IDs are grouped. Names alone are not merge authority.
  for(const loc of scope.accounts){
    const key=loc.customerId??loc.id;
    const group=groups.get(key)??{name:loc.name,ids:new Set<string>(),reps:new Set<string>()};
    group.ids.add(loc.id);if(loc.ownerId)group.reps.add(loc.ownerId);
    groups.set(key,group);
  }
  const entries=[...groups].map(([,g])=>{
    const orders=scope.orders.filter(o=>g.ids.has(o.accountId)&&!o.testOnly&&o.status!=="Cancelled").sort((a,b)=>a.placedAt.localeCompare(b.placedAt));
    const firstDate=orders[0]?.placedAt.slice(0,10);
    const start=firstDate?new Date(firstDate+"T12:00:00Z").getTime():0;
    const settled=orders.filter(o=>{
      const day=orderFirstSettlementDate(data,o);
      const ms=day?new Date(day+"T12:00:00Z").getTime():Infinity;
      return Boolean(day&&ms>=start&&ms<=start+90*86400000&&ms<=Date.now());
    });
    return {id:[...g.ids].sort().join(":"),name:g.name,locations:g.ids.size,cases:settled.reduce((n,o)=>n+o.cases,0),repIds:[...g.reps]};
  }).filter(e=>(repFilter==="all"||e.repIds.includes(repFilter))&&[e.name,...e.repIds.map(id=>names.get(id)??id)].join(" ").toLowerCase().includes(query.toLowerCase()))
    .sort((a,b)=>{
      const value=(e:typeof a)=>sort==="name"?e.name:sort==="rep"?e.repIds.map(id=>names.get(id)??id).join(", "):e[sort];
      const ax=value(a),bx=value(b),comp=typeof ax==="number"&&typeof bx==="number"?ax-bx:String(ax).localeCompare(String(bx),undefined,{numeric:true});
      return (ascending?1:-1)*(comp||a.id.localeCompare(b.id));
    });
  const reps=[...new Set(scope.accounts.map(a=>a.ownerId).filter(Boolean))].sort((a,b)=>(names.get(a)??"").localeCompare(names.get(b)??""));
  const header=(key:IncentiveSortField,label:string)=><button type="button" aria-label={"Sort by "+label} onClick={()=>{if(sort===key)setAscending(v=>!v);else{setSort(key);setAscending(true);}}}>{label}<ArrowUpDown size={14}/></button>;
  return <div><Heading title="Sales incentives" description="Continuous case-volume progress. Every eligible case increments the displayed value; no artificial 20-case milestone."/>
    <section className="prototype-panel">
      <p className="prototype-note">READ-ONLY PREVIEW: Case totals use the current modeled 90-day opening window and known settlement evidence. This is not a payroll approval, commission statement, or verified bonus award. Historical rep credit may differ from current assigned representatives.</p>
      <div className="prototype-controls">
        <label className="prototype-search"><Search size={16}/><input aria-label="Search business incentive progress" placeholder="Business or assigned representative" value={query} onChange={e=>setQuery(e.target.value)}/></label>
        <label>Current assigned rep <select aria-label="Filter incentive progress by representative" value={repFilter} onChange={e=>setRepFilter(e.target.value)}>
          <option value="all">All visible reps</option>{reps.map(id=><option key={id} value={id}>{names.get(id)??id}</option>)}
        </select></label>
      </div>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>
        <th>{header("name","Business")}</th><th>{header("rep","Assigned reps")}</th><th>{header("locations","Locations")}</th><th>{header("cases","Settled cases")}</th><th>Continuous progress</th>
      </tr></thead><tbody>{entries.map(e=><tr key={e.id}>
        <td>{e.name}</td><td>{e.repIds.map(id=>names.get(id)??"Unassigned").join(", ")||"Unassigned"}</td><td>{e.locations}</td><td>{e.cases}</td>
        <td><div role="progressbar" aria-label={"Case volume progress for "+e.name} aria-valuemin={0} aria-valuemax={40} aria-valuenow={Math.min(40,e.cases)} className="prototype-progress"><div style={{width:Math.min(100,(e.cases/40)*100)+"%"}}/></div><small>{e.cases} of 40 cases{e.cases>=40?" · 40-case threshold met":""}</small></td>
      </tr>)}</tbody></table></div>
      {!entries.length&&<Empty>No eligible visible businesses match your filters.</Empty>}
    </section></div>;
}
type ContactSortField="contactName"|"name"|"contactRole"|"email"|"phone"|"location"|"stage";
function ContactsDirectory(){
  const {scope}=useWorkspace();const [query,setQuery]=useState("");
  const [sort,setSort]=useState<ContactSortField>("contactName");
  const [ascending,setAscending]=useState(true);
  const [stageFilter,setStageFilter]=useState("all");
  const [roleFilter,setRoleFilter]=useState("all");
  const stages=[...new Set(scope.accounts.filter(a=>a.contactName).map(a=>a.stage))].sort();
  const roles=[...new Set(scope.accounts.filter(a=>a.contactName&&a.contactRole).map(a=>a.contactRole))].sort();
  const rows=useMemo(()=>scope.accounts.filter(a=>a.contactName&&(stageFilter==="all"||a.stage===stageFilter)&&(roleFilter==="all"||a.contactRole===roleFilter)&&[a.contactName,a.name,a.email,a.phone,a.contactRole,a.location,a.stage].join(" ").toLowerCase().includes(query.toLowerCase())).sort((a,b)=>{
    const value=(a:typeof b)=>String(a[sort]??"");
    return (ascending?1:-1)*(value(a).localeCompare(value(b),undefined,{numeric:true})||a.id.localeCompare(b.id));
  }),[scope.accounts,query,sort,ascending,stageFilter,roleFilter]);
  const header=(key:ContactSortField,label:string)=><button type="button" aria-label={"Sort by "+label} onClick={()=>{if(sort===key)setAscending(v=>!v);else{setSort(key);setAscending(true);}}}>{label}<ArrowUpDown size={14}/></button>;
  return <div><Heading title="Contacts" description="All recorded decision-makers linked to your accessible customer locations."/>
    <section className="prototype-panel">
      <div className="prototype-controls"><label className="prototype-search"><Search size={16}/><input aria-label="Search contacts" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Contact, business, email, phone, role"/></label><label>Stage <select aria-label="Filter contacts by stage" value={stageFilter} onChange={e=>setStageFilter(e.target.value)}><option value="all">All stages</option>{stages.map(v=><option key={v} value={v}>{v}</option>)}</select></label><label>Role <select aria-label="Filter contacts by role" value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}><option value="all">All roles</option>{roles.map(v=><option key={v} value={v}>{v}</option>)}</select></label><button type="button" disabled={!rows.length} onClick={()=>downloadCsv("momentum-visible-contacts.csv",contactExportRows(rows),contactExportColumns)}>Download filtered contacts CSV</button></div>
      <div className="prototype-table-scroll"><table className="prototype-table">
        <thead><tr><th>{header("contactName","Contact")}</th><th>{header("name","Business")}</th><th>{header("contactRole","Role")}</th><th>{header("email","Email")}</th><th>{header("phone","Phone")}</th><th>{header("location","Location")}</th><th>{header("stage","Stage")}</th></tr></thead>
        <tbody>{rows.map(a=><tr key={a.id}><td><OpenLink to={"/crm/contacts/"+encodeURIComponent(a.id)}>{a.contactName}</OpenLink></td><td><OpenLink to={"/sales/customers/"+encodeURIComponent(a.id)}>{a.name}</OpenLink></td><td>{a.contactRole||"Not recorded"}</td><td>{a.email||"Not recorded"}</td><td>{a.phone||"Not recorded"}</td><td>{a.location}</td><td>{a.stage}</td></tr>)}</tbody>
      </table></div>
      {!rows.length&&<Empty>No matching contacts.</Empty>}
      <p className="prototype-note">{rows.length} contact-location associations. Distinct standalone contact IDs and deduplication are planned.</p>
    </section></div>;
}

/** Contact records currently inherit the canonical location ID. Never invent an
 * independent person ID or infer that matching names are the same person. */
function ContactRecord({id}:{id:string}){
  const {scope,data}=useWorkspace();
  const account=scope.accounts.find(a=>a.id===id);
  const [orderQuery,setOrderQuery]=useState("");
  const [orderStatus,setOrderStatus]=useState("all");
  const [activityQuery,setActivityQuery]=useState("");
  const [activityFrom,setActivityFrom]=useState("");
  const [activityThrough,setActivityThrough]=useState("");
  if(!account||!account.contactName)return <div><Heading title="Contact unavailable" description="This contact is missing or outside your authorized workspace." back="/crm/contacts"/><Empty>No accessible contact record.</Empty></div>;
  const assigned=data.users.find(u=>u.id===account.ownerId);
  const allOrders=scope.orders.filter(o=>!o.testOnly&&o.accountId===account.id);
  const orderStatuses=[...new Set(allOrders.map(o=>o.status))].sort();
  const orders=allOrders.filter(o=>(orderStatus==="all"||o.status===orderStatus)&&
    [o.number,o.status].join(" ").toLowerCase().includes(orderQuery.trim().toLowerCase()))
    .sort((a,b)=>b.placedAt.localeCompare(a.placedAt)||a.id.localeCompare(b.id));
  const activities=scope.activities.filter(a=>a.accountId===account.id)
    .filter(a=>(!activityFrom||a.at.slice(0,10)>=activityFrom)&&(!activityThrough||a.at.slice(0,10)<=activityThrough))
    .filter(a=>[a.title,a.detail].join(" ").toLowerCase().includes(activityQuery.trim().toLowerCase()))
    .sort((a,b)=>b.at.localeCompare(a.at)||a.id.localeCompare(b.id));
  return <div><Heading title={account.contactName} description="Contact and linked business location" back="/crm/contacts"/>
    <section className="prototype-panel"><h2>Contact information</h2>
      <dl className="prototype-facts">
        <div><dt>Role</dt><dd>{account.contactRole||"Not recorded"}</dd></div>
        <div><dt>Email</dt><dd>{account.email||"Not recorded"}</dd></div>
        <div><dt>Phone</dt><dd>{account.phone||"Not recorded"}</dd></div>
        <div><dt>Business</dt><dd><OpenLink to={"/sales/customers/"+encodeURIComponent(account.id)}>{account.name}</OpenLink></dd></div>
        <div><dt>Location</dt><dd>{account.location}</dd></div>
        <div><dt>Assigned representative</dt><dd>{assigned?.name||"Unassigned"}</dd></div>
        <div><dt>Stage</dt><dd>{account.stage}</dd></div>
        <div><dt>Next action</dt><dd>{account.nextActionDate||"Not scheduled"}</dd></div>
      </dl>
      <p className="prototype-note">This is the contact associated with location record {account.id}. A separate contact identity and editing workflow have not yet been approved.</p>
    </section>
    <section className="prototype-panel"><h2>Related sales orders</h2>
      <div className="prototype-controls"><label className="prototype-search"><Search size={16}/><input aria-label="Search contact orders" value={orderQuery} onChange={e=>setOrderQuery(e.target.value)} placeholder="Order number or status"/></label><label>Order status <select aria-label="Filter contact orders by status" value={orderStatus} onChange={e=>setOrderStatus(e.target.value)}><option value="all">All statuses</option>{orderStatuses.map(status=><option key={status} value={status}>{status}</option>)}</select></label></div>
      {orders.length?<div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Order</th><th>Placed</th><th>Status</th><th>Cases</th></tr></thead><tbody>
        {orders.map(order=><tr key={order.id}><td><OpenLink to={"/sales/orders/"+encodeURIComponent(order.id)}>{order.number}</OpenLink></td><td>{order.placedAt.slice(0,10)}</td><td>{order.status}</td><td>{order.cases}</td></tr>)}
      </tbody></table></div>:<Empty>No related orders visible for this location.</Empty>}
    </section>
    <section className="prototype-panel"><h2>Recorded account activity</h2>
      <div className="prototype-controls"><label className="prototype-search"><Search size={16}/><input aria-label="Search contact activity" value={activityQuery} onChange={e=>setActivityQuery(e.target.value)} placeholder="Activity title or details"/></label><label>From <input type="date" aria-label="Contact activity from date" value={activityFrom} max={activityThrough||undefined} onChange={e=>setActivityFrom(e.target.value)}/></label><label>Through <input type="date" aria-label="Contact activity through date" value={activityThrough} min={activityFrom||undefined} onChange={e=>setActivityThrough(e.target.value)}/></label><button type="button" onClick={()=>{setActivityQuery("");setActivityFrom("");setActivityThrough("");}}>Clear activity filters</button></div>
      {activities.length?activities.map(activity=><div className="prototype-activity" key={activity.id}><strong>{activity.title}</strong><span>{activity.at.slice(0,10)} • {activity.detail}</span></div>):<Empty>No recorded activities for this location.</Empty>}
      <p className="prototype-note">Activities are sourced from this authorized location only. No new contact identity or activity is created.</p>
    </section>
  </div>;
}

/** A separate customer-facing surface with account-scoped records, not staff-wide ledgers. */
function CustomerPortalContent({section}:{section:string}){
  const {scope,currentUser}=useWorkspace();const {commerce}=useCommerce();const runtime=useRuntimeMode();
  const [invoiceQuery,setInvoiceQuery]=useState("");
  const [invoiceStatus,setInvoiceStatus]=useState("all");
  const [invoiceSort,setInvoiceSort]=useState<"issued-desc"|"issued-asc"|"due-asc"|"balance-desc">("issued-desc");
  const [deliveryQuery,setDeliveryQuery]=useState("");const [deliveryStatus,setDeliveryStatus]=useState("all");
  const [deliveryAccount,setDeliveryAccount]=useState("all");const [deliveryFrom,setDeliveryFrom]=useState("");
  const [deliveryThrough,setDeliveryThrough]=useState("");const [deliverySort,setDeliverySort]=useState<"newest"|"oldest"|"order"|"cases">("newest");
  if(currentUser?.role!=="Customer") return <Empty>Customer access only.</Empty>;
  const current=scope.accounts[0];
  const accountIds=new Set(scope.accounts.map(a=>a.id));
  const orders=authorizedCustomerOrders(scope.orders,accountIds);
  if(section==="invoices"&&(!runtime.isDemo||momentumStorage.mode()!=="local"))return <div><Heading title="My Invoices" description="Account-specific invoice access requires verification."/><section className="prototype-panel"><p>This customer invoice screen is enabled in the isolated demo only. Connected invoices need an account-scoped server read before release.</p></section></div>;
  if(section==="invoices"){
    // Only source-matched, fulfilled customer orders may expose printable
    // invoice documents. Scope comes from the authenticated customer's
    // account IDs, not untrusted URL or request parameters.
    const fulfilled=new Map(orders.filter(o=>
      accountIds.has(o.accountId)&&["Delivered","Paid"].includes(o.status))
      .map(o=>[o.id,o]));
    const ids=commerce.invoices.filter(invoice=>{
      const order=fulfilled.get(invoice.orderId);
      return invoice.status!=="Void"&&Boolean(order&&order.accountId===invoice.accountId&&
        accountIds.has(invoice.accountId));
    }).map(invoice=>invoice.id);
    const register=commerce.invoices.filter(invoice=>ids.includes(invoice.id)).map(invoice=>({
      invoiceNumber:invoice.number,orderNumber:fulfilled.get(invoice.orderId)?.number??"",
      recordedAt:invoice.issuedAt,dueDate:invoice.dueDate,terms:invoice.terms,
      total:invoice.total,balance:invoiceBalance(commerce,invoice),
      status:computedInvoiceStatus(commerce,invoice),
    }));
    const visibleInvoices=commerce.invoices.filter(invoice=>ids.includes(invoice.id)).filter(invoice=>{
      const query=invoiceQuery.trim().toLocaleLowerCase();
      const status=computedInvoiceStatus(commerce,invoice);
      return (invoiceStatus==="all"||status===invoiceStatus)&&(!query||
        invoice.number.toLocaleLowerCase().includes(query)||
        (fulfilled.get(invoice.orderId)?.number??"").toLocaleLowerCase().includes(query));
    }).sort((a,b)=>{
      if(invoiceSort==="balance-desc")return invoiceBalance(commerce,b)-invoiceBalance(commerce,a)||a.number.localeCompare(b.number);
      const aDate=invoiceSort==="due-asc"?(a.dueDate??"9999-12-31"):a.issuedAt;
      const bDate=invoiceSort==="due-asc"?(b.dueDate??"9999-12-31"):b.issuedAt;
      return (invoiceSort==="issued-desc"?bDate.localeCompare(aDate):aDate.localeCompare(bDate))||a.number.localeCompare(b.number);
    });
    const visibleIds=visibleInvoices.map(invoice=>invoice.id);
    const visibleRegister=register.filter(row=>visibleInvoices.some(invoice=>invoice.number===row.invoiceNumber));
    const invoiceStatuses=[...new Set(commerce.invoices.filter(invoice=>ids.includes(invoice.id)).map(invoice=>computedInvoiceStatus(commerce,invoice)))].sort();
    return <div><Heading title="My Invoices" description="Recorded documents for delivered orders linked to your authorized business account."/>
      <section className="prototype-panel">
       <p className="prototype-note">Only invoices tied to your authorized customer locations and orders recorded Delivered or Paid are shown. A recorded invoice is not proof of a separately emailed invoice or settled payment.</p>
       <div className="prototype-controls"><label className="prototype-search"><Search size={16}/><input aria-label="Search my invoices" value={invoiceQuery} onChange={event=>setInvoiceQuery(event.target.value)} placeholder="Invoice or order number"/></label><label>Status <select aria-label="Filter invoice status" value={invoiceStatus} onChange={event=>setInvoiceStatus(event.target.value)}><option value="all">All statuses</option>{invoiceStatuses.map(status=><option key={status} value={status}>{status}</option>)}</select></label><label>Sort <select aria-label="Sort my invoices" value={invoiceSort} onChange={event=>setInvoiceSort(event.target.value)}><option value="issued-desc">Newest issued</option><option value="issued-asc">Oldest issued</option><option value="due-asc">Due date</option><option value="balance-desc">Highest balance</option></select></label></div>
       <button type="button" disabled={!visibleRegister.length} onClick={()=>
         downloadCsv("momentum-my-invoices.csv",visibleRegister,
          ["invoiceNumber","orderNumber","recordedAt","dueDate","terms","total","balance","status"])}>
          Download my invoice register (CSV)
       </button>
       <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Invoice</th><th>Order</th><th>Issued</th><th>Due</th><th>Status</th><th>Balance</th></tr></thead><tbody>{visibleInvoices.map(invoice=><tr key={invoice.id}><td><OpenLink to={"/portal/invoices/"+encodeURIComponent(invoice.id)}>{invoice.number}</OpenLink></td><td><OpenLink to={"/portal/orders/"+encodeURIComponent(invoice.orderId)}>{fulfilled.get(invoice.orderId)?.number??"Order"}</OpenLink></td><td>{invoice.issuedAt.slice(0,10)}</td><td>{invoice.dueDate?.slice(0,10)??"Not recorded"}</td><td>{computedInvoiceStatus(commerce,invoice)}</td><td>{invoiceBalance(commerce,invoice).toFixed(2)}</td></tr>)}</tbody></table></div>
       <InvoicePrintCenter allowedInvoiceIds={visibleIds} allowedOrderIds={[...new Set(visibleInvoices.map(invoice=>invoice.orderId))]}
         title="My printable invoices" description="Open an invoice or print one or all authorized documents. Your browser also supports Save as PDF."/>
       {!ids.length&&<Empty>No customer invoices currently meet the delivery and account verification criteria.</Empty>}
       {ids.length&&!visibleIds.length&&<Empty>No invoices match the selected search or status filter.</Empty>}
      </section></div>;
  }
  if(section==="products"){
    return <div><Heading title="Products" description="Browse the Golden Eagle wholesale catalog."/>
      <section className="prototype-panel"><div className="prototype-product-grid">{GOLDEN_EAGLE_SKUS.filter(s=>s.active).map(item=>
        <div key={item.id} className="prototype-product-card"><strong>{item.shortName}</strong><p>{item.description}</p><small>{item.casePack} cans per case</small></div>)}</div>
      <p className="prototype-note">A verified customer price book, availability check and live checkout will be connected before ordering from this catalog is enabled. To create an order, use My Orders.</p>
      <OpenLink to="/portal/orders">My Orders</OpenLink></section></div>;
  }
  if(section==="account"){
    return <div><Heading title="My Account" description="Details available to your authenticated customer identity."/>
      <section className="prototype-panel"><h2>Account information</h2>{current?
      <dl className="prototype-facts"><div><dt>Business name</dt><dd>{current.name}</dd></div><div><dt>Contact name</dt><dd>{current.contactName||"Not recorded"}</dd></div>
      <div><dt>Contact email</dt><dd>{current.email||"Not recorded"}</dd></div><div><dt>Phone</dt><dd>{current.phone||"Not recorded"}</dd></div>
      <div><dt>Location</dt><dd>{current.streetAddress??""} {current.location}</dd></div></dl>:<Empty>No authorized business account is linked.</Empty>}
      <p className="prototype-note">Any future self-service edits must verify account ownership and protect tax, payment terms and legal identity fields.</p></section></div>;
  }
  if(section==="deliveries"){
    const filtered=filterCustomerDeliveries(orders,{query:deliveryQuery,status:deliveryStatus,accountId:deliveryAccount,fromDate:deliveryFrom,throughDate:deliveryThrough,sort:deliverySort});
    const statuses=[...new Set(orders.map(o=>o.status))].sort();
    return <div><Heading title="My Deliveries" description="Account-scoped fulfillment history, with downloadable registers and individual order details."/>
      <section className="prototype-panel">
        <div className="prototype-controls">
          <label className="prototype-search"><Search size={16}/><input aria-label="Search my deliveries" value={deliveryQuery} onChange={e=>setDeliveryQuery(e.target.value)} placeholder="Order number or status"/></label>
          <label>Fulfillment <select aria-label="Filter my delivery status" value={deliveryStatus} onChange={e=>setDeliveryStatus(e.target.value)}><option value="all">All statuses</option>{statuses.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
          <label>Location <select aria-label="Filter my delivery location" value={deliveryAccount} onChange={e=>setDeliveryAccount(e.target.value)}><option value="all">All my locations</option>{scope.accounts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.location}</option>)}</select></label>
          <label>From <input aria-label="Deliveries from date" type="date" value={deliveryFrom} max={deliveryThrough||undefined} onChange={e=>setDeliveryFrom(e.target.value)}/></label>
          <label>Through <input aria-label="Deliveries through date" type="date" value={deliveryThrough} min={deliveryFrom||undefined} onChange={e=>setDeliveryThrough(e.target.value)}/></label>
          <label>Sort <select aria-label="Sort my deliveries" value={deliverySort} onChange={e=>setDeliverySort(e.target.value as "newest"|"oldest"|"order"|"cases")}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="order">Order number</option><option value="cases">Most cases</option></select></label>
          <button type="button" onClick={()=>{setDeliveryQuery("");setDeliveryStatus("all");setDeliveryAccount("all");setDeliveryFrom("");setDeliveryThrough("");setDeliverySort("newest");}}>Clear filters</button>
          <button type="button" disabled={!filtered.length} onClick={()=>downloadCsv("momentum-my-deliveries.csv",customerDeliveryExportRows(filtered),customerDeliveryColumns)}>Download filtered deliveries CSV</button>
        </div>
        <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Order</th><th>Placed</th><th>Fulfillment</th><th>Cases</th><th>Payment state</th></tr></thead><tbody>{filtered.map(o=>
          <tr key={o.id}><td><OpenLink to={"/portal/deliveries/"+encodeURIComponent(o.id)}>{o.number}</OpenLink></td><td>{o.placedAt.slice(0,10)}</td><td>{o.status}</td><td>{o.cases}</td><td>{o.paymentStatus}</td></tr>)}</tbody></table></div>
        {!filtered.length&&<Empty>No matching deliveries for your authorized accounts.</Empty>}
        <p className="prototype-note">These are recorded order states, not verified driver GPS, ETA, proof of delivery, or cleared funds. Downloads contain only accessible account orders.</p>
      </section></div>;
  }
  if(section==="payments"||section==="statements"){
    if(!runtime.isDemo||momentumStorage.mode()!=="local")return <div><Heading title={section==="payments"?"My Payments":"Account Statements"} description="Customer account financial records. Verified account access is required for connected data."/><section className="prototype-panel"><Empty>Authenticated server-scoped financial records are not available yet. No payment or balance information is shown.</Empty></section></div>;
    const locationNames=new Map(scope.accounts.map(a=>[a.id,a.name]));
    const finance=projectCustomerFinance(commerce,orders,accountIds,locationNames);
    if(section==="payments")return <div><Heading title="My Payments" description="Customer account financial records. Verified account access is required for connected data."/><section className="prototype-panel">
      <div className="prototype-controls"><button type="button" disabled={!finance.payments.length} onClick={()=>downloadCsv("momentum-my-payments.csv",finance.payments,customerPaymentColumns)}>Download payments CSV</button></div>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Date</th><th>Location</th><th>Reference</th><th>Method</th><th>Status</th><th>Amount</th></tr></thead><tbody>{finance.payments.map((p,i)=><tr key={p.reference+"-"+i}><td>{p.date}</td><td>{p.location}</td><td>{p.reference}</td><td>{p.method}</td><td>{p.status}</td><td>{p.amount.toFixed(2)}</td></tr>)}</tbody></table></div>
      {!finance.payments.length&&<Empty>No cleared, allocated payments for your delivered orders.</Empty>}
      <p className="prototype-note">Local demonstration only. Payment requests and checkout remain disabled.</p>
    </section></div>;
    return <div><Heading title="Account Statements" description="Customer account financial records. Verified account access is required for connected data."/><section className="prototype-panel">
      <div className="prototype-controls"><button type="button" disabled={!finance.statement.length} onClick={()=>downloadCsv("momentum-my-statement.csv",finance.statement,customerStatementColumns)}>Download statement CSV</button></div>
      <div className="prototype-metrics"><div><small>Recorded open invoice balance</small><strong>{finance.openBalance.toFixed(2)}</strong></div></div>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Date</th><th>Location</th><th>Reference</th><th>Type</th><th>Status</th><th>Debit</th><th>Credit</th></tr></thead><tbody>{finance.statement.map((row,i)=><tr key={row.reference+"-"+row.type+"-"+i}><td>{row.date}</td><td>{row.location}</td><td>{row.reference}</td><td>{row.type}</td><td>{row.status}</td><td>{row.debit.toFixed(2)}</td><td>{row.credit.toFixed(2)}</td></tr>)}</tbody></table></div>
      {!finance.statement.length&&<Empty>No qualifying issued invoices or reconciled activity for your delivered orders.</Empty>}
      <p className="prototype-note">Local demonstration only. This register is not a bank statement or verified production settlement.</p>
    </section></div>;
  }
  const descriptions:Record<string,{title:string,body:string}>={
    invoices:{title:"My Invoices",body:"Invoice balances and PDFs will be sourced from issued, delivery-verified invoices. The review prototype does not invent financial balances."},
    payments:{title:"Payments",body:"Hosted invoice payment links and secure customer-portal payments will appear after payment-provider approval, webhook verification and reconciliation. No payment processor is active in this view."},
    statements:{title:"Account Statements",body:"Statements will combine issued invoices, cleared payments, credits and refunds from the accounting ledger. No statement is fabricated from sales orders."},
    documents:{title:"My Documents",body:"Signed documents, verified tax forms and shared account files will be shown only to authorized customer contacts after document access policy is finished."},
  };
  const v=descriptions[section];
  if(!v)return <Empty>Customer portal page not found.</Empty>;
  return <div><Heading title={v.title} description="Customer self-service • prototype"/><section className="prototype-panel"><h2>{v.title}</h2><Empty>{v.body}</Empty></section></div>;
}

/** Customer invoice detail is deliberately demo-only until server-scoped invoice reads exist. */
function CustomerInvoiceRecord({id}:{id:string}){
  const {scope,currentUser}=useWorkspace();
  const {commerce}=useCommerce();
  const runtime=useRuntimeMode();
  if(currentUser?.role!=="Customer")return <Empty>Customer access only.</Empty>;
  if(!runtime.isDemo||momentumStorage.mode()!=="local")return <Empty>Customer invoice details require an authenticated account-scoped server read. No connected financial records are exposed.</Empty>;
  const accountIds=new Set(scope.accounts.map(a=>a.id));
  const orders=authorizedCustomerOrders(scope.orders,accountIds);
  const invoice=commerce.invoices.find(i=>i.id===id&&i.status!=="Void"&&accountIds.has(i.accountId));
  const order=invoice&&orders.find(o=>o.id===invoice.orderId&&o.accountId===invoice.accountId&&["Delivered","Paid"].includes(o.status));
  if(!invoice||!order)return <Empty>Invoice not found or not authorized for your business account.</Empty>;
  const balance=invoiceBalance(commerce,invoice);
  return <div><Heading title={"Invoice "+invoice.number} description="Issued invoice for an authorized delivered order" back="/portal/invoices"/>
    <div className="prototype-metrics"><div><small>Invoice state</small><strong>{computedInvoiceStatus(commerce,invoice)}</strong></div><div><small>Recorded total</small><strong>{invoice.total.toFixed(2)}</strong></div><div><small>Recorded balance</small><strong>{balance.toFixed(2)}</strong></div></div>
    <section className="prototype-panel"><h2>Invoice information</h2><dl className="prototype-facts">
      <div><dt>Issued</dt><dd>{invoice.issuedAt.slice(0,10)}</dd></div>
      <div><dt>Due</dt><dd>{invoice.dueDate?.slice(0,10)??"Not recorded"}</dd></div>
      <div><dt>Terms</dt><dd>{invoice.terms||"Not recorded"}</dd></div>
      <div><dt>Order</dt><dd><OpenLink to={"/portal/orders/"+encodeURIComponent(order.id)}>{order.number}</OpenLink></dd></div>
    </dl><InvoicePrintCenter allowedInvoiceIds={[invoice.id]} allowedOrderIds={[order.id]} title="Invoice document" description="Print or save the authorized invoice as PDF."/>
    <p className="prototype-note">Local demonstration only. An issued invoice and its recorded balance do not prove payment settlement. Online payment is not enabled.</p></section>
  </div>;
}

/** Customer-only detail: no staff approvals, audit history or private rep fields. */
function CustomerOrderRecord({id,section}:{id:string;section:"orders"|"deliveries"}){
  const {scope,currentUser}=useWorkspace();
  if(currentUser?.role!=="Customer")return <Empty>Customer access only.</Empty>;
  const accountIds=new Set(scope.accounts.map(a=>a.id));
  const order=authorizedCustomerOrder(scope.orders,accountIds,id);
  if(!order)return <Empty>Order not found or not authorized for your business account.</Empty>;
  const account=scope.accounts.find(a=>a.id===order.accountId);
  const lines=order.lines??(order.product?[{id:order.id,product:order.product,cases:order.cases}]:[]);
  return <div><Heading title={"Order "+order.number} description="My account order and delivery status" back={section==="orders"?"/portal/orders":"/portal/deliveries"}/>
    <div className="prototype-metrics"><div><small>Fulfillment</small><strong>{order.status}</strong></div><div><small>Cases</small><strong>{order.cases}</strong></div><div><small>Payment state</small><strong>{order.paymentStatus}</strong></div></div>
    <section className="prototype-panel"><h2>Order information</h2><dl className="prototype-facts">
      <div><dt>Business location</dt><dd>{account?.name??"Authorized account"} · {account?.location??""}</dd></div>
      <div><dt>Placed</dt><dd>{order.placedAt.slice(0,10)}</dd></div>
      <div><dt>Current order status</dt><dd>{order.status}</dd></div>
      <div><dt>Payment state</dt><dd>{order.paymentStatus}</dd></div>
    </dl>
    <OpenLink to="/portal/invoices">View invoices for my account</OpenLink>
        <button type="button" onClick={()=>downloadCsv("momentum-my-delivery-"+order.number+".csv",customerDeliveryExportRows([order]),customerDeliveryColumns)}>Download this order status (CSV)</button>
    <p className="prototype-note">Recorded order status is not live GPS, an estimated arrival, a signed proof of delivery, or payment settlement evidence.</p></section>
    <section className="prototype-panel"><h2>Ordered products</h2><div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Product</th><th>Cases</th></tr></thead><tbody>{lines.map(line=><tr key={line.id}><td>{line.product}</td><td>{line.cases}</td></tr>)}</tbody></table></div>
    {!lines.length&&<Empty>No verified product breakdown is available for this order.</Empty>}</section>
  </div>;
}

function TerritoryMapPreview(){
  return <div><Heading title="Territories & Map" description="Existing ZIP assignments and geographic controls retained."/>
    <section className="prototype-panel"><h2>Territory management</h2><TerritoryPanel/>
    <p className="prototype-note">Map overlay, geocoded ZIP boundaries and routing require verified mapping data/provider. Do not mistake a ZIP listing for a plotted geographic boundary.</p>
    <OpenLink to="/crm/account-map">Account map</OpenLink></section></div>;
}

export function PrototypeOperationsHub(){
  const path=useNavigationRoute();const {currentUser}=useWorkspace();
  const runtime=useRuntimeMode();const writeEnabled=runtime.isDemo&&momentumStorage.mode()==="local";
  if(!canVisitRoute(currentUser,path))return <Empty>You do not have permission to view this module.</Empty>;
  const segments=path.split("/").filter(Boolean);
  if(path==="/")return <WorkspaceHome/>;
  if(segments[0]==="portal"&&segments[1]==="invoices"&&segments.length===3)return <CustomerInvoiceRecord id={decodeURIComponent(segments[2])}/>;
  if(segments[0]==="portal"&&["orders","deliveries"].includes(segments[1])&&segments.length===3)return <CustomerOrderRecord id={decodeURIComponent(segments[2])} section={segments[1] as "orders"|"deliveries"}/>;
  if(segments[0]==="portal"&&segments[1])return <CustomerPortalContent section={segments[1]}/>;
  if(path==="/people")return <PeopleExperience/>;
  if(path==="/marketing")return <MarketingWorkspaceExperience/>;
  if(path==="/marketing/workflow")return currentUser?.role==="Administrator"&&writeEnabled?<LegacyMarketingPage/>:<Empty>Marketing write administration is available in isolated local demo only. The redesign provides source-linked read and export access.</Empty>;
  if(path==="/people/payroll")return <PayrollWorkflowExperience/>;
  if(path==="/people/payroll/workflow")return writeEnabled?<LegacyPayrollPage/>:<Empty>Read-only redesign prototype. Payroll processing is available only in isolated local demo mode until production controls are approved.</Empty>;
  if(path==="/people/onboarding/workflow")return writeEnabled?<NewHireProvisioning view="queue"/>:<Empty>Read-only redesign prototype. Full onboarding administration is available only in isolated local demo mode until authorized release.</Empty>;
  if(path==="/people/new-hire")return <HrNewHireExperience/>;
  if(path==="/people/onboarding")return <HrOnboardingExperience/>;
  if(path==="/people/leave")return <HrTimeOffExperience/>;
  if(path==="/admin/accounts")return <AccountConsolidationReview/>;
  if(path==="/admin/employee-profiles")return <HrPersonnelDirectory/>;
  if(path==="/admin/employee-profiles/workflow")return writeEnabled?<div><Heading title="Secure personnel editor" description="Existing audited editing controls retained during redesign." back="/admin/employee-profiles"/><AdminEmployeeProfiles/></div>:<Empty>Read-only redesign prototype. Personnel editing is disabled against connected records.</Empty>;
  if(segments[0]==="admin"&&segments[1]==="employee-profiles"&&segments[2])return <HrPersonnelRecord id={decodeURIComponent(segments[2])} section={segments[3]}/>
  if(path==="/admin/employees")return <div><Heading title="Employee Directory" description="Administrator view of active staff."/><EmployeeDirectory/></div>;
  if(path==="/crm/territory-map")return <TerritoryMapPreview/>;
  if(segments[0]==="sales"&&segments[1]==="customers"&&segments[2])return <CustomerRecord id={decodeURIComponent(segments[2])} section={segments[3]??"overview"}/>;
  if(segments[0]==="items"&&segments[1])return <ProductRecord skuId={decodeURIComponent(segments[1])} section={segments[2]??"overview"}/>;
  if(path==="/work/approvals")return <OrderApprovalDirectory/>;
  if(path==="/work/actions")return <ActionCenterExperience/>;
  if(path==="/work/exceptions")return <WorkExceptionsExperience/>;
  if(path==="/work/completed")return <CompletedWorkExperience/>;
  if(path==="/sales/orders/new")return <OrderEditor/>;
  if(segments[0]==="sales"&&segments[1]==="orders"&&segments[2]&&segments[3]==="edit")return <OrderEditor orderId={decodeURIComponent(segments[2])}/>;
  if(segments[0]==="sales"&&segments[1]==="orders"&&segments[2])return currentUser?.role==="Customer"?<CustomerOrderRecord id={decodeURIComponent(segments[2])} section="orders"/>:<OrderDetail id={decodeURIComponent(segments[2])}/>;
  if(segments[0]==="sales"&&segments[1]==="invoices"&&segments[2])return <InvoiceDetail id={decodeURIComponent(segments[2])}/>;
  if(segments[0]==="sales"&&segments[1]==="payments"&&segments[2])return <PaymentDetail id={decodeURIComponent(segments[2])}/>;
  if(segments[0]==="inventory"&&segments[1]==="lots"&&segments[2])return <InventoryLotDetail id={decodeURIComponent(segments[2])}/>;
  if(segments[0]==="inventory"&&segments[1]==="shipments"&&segments[2])return <ShipmentDetail orderId={decodeURIComponent(segments[2])}/>;
  if(path==="/inventory/packages")return <PackagesDirectory/>;
  if(path==="/inventory/shipments")return <ShipmentsDirectory/>;
  if(path==="/operations/deliveries")return <DeliveryOperationsDirectory/>;
  if(path==="/inventory")return <InventoryDirectory/>;
  if(path==="/inventory/ledger")return <InventoryLedgerDirectory/>;
  if(path==="/inventory/adjustments")return <InventoryAdjustmentDirectory/>;
  if(segments[0]==="sales"&&segments[1]==="returns"&&segments[2])return <SalesReturnDetail id={decodeURIComponent(segments[2])}/>;
  if(segments[0]==="sales"&&segments[1]==="credit-notes"&&segments[2])return <CreditNoteDetail id={decodeURIComponent(segments[2])}/>;
  if(path==="/sales/returns")return <SalesReturnsDirectory/>;
  if(path==="/sales/credit-notes")return <CreditNotesDirectory/>;
  if(path==="/sales/orders")return <OrdersDirectory/>;
  if(path==="/sales/invoices")return <InvoiceDirectory/>;
  if(path==="/sales/payments")return <PaymentsDirectory/>;
  if(path==="/items")return <ProductDirectory/>;
  if(path==="/sales/customers")return <AccountsDirectory/>;
  if(path==="/crm/leads")return <AccountsDirectory leadMode/>;
  if(segments[0]==="crm"&&segments[1]==="contacts"&&segments[2])return <ContactRecord id={decodeURIComponent(segments[2])}/>;
  if(path==="/crm/contacts")return <ContactsDirectory/>;
  if(path==="/calendar"||path==="/calendar/meetings")return <CalendarPreview meetingsOnly={path.endsWith("/meetings")}/>;
  if(path==="/crm/incentives")return <IncentivePreview/>;
  const item=routeEntry(path);
  return <div><Heading title={routeLabel(path)} description="Planned module • navigation prototype only"/><section className="prototype-panel">
    <h2>{item?.label??"Module"} workflow</h2>
    <p>This section is mapped in the navigation but has not been implemented as a live workflow. It will be connected to the existing Momentum record and permission model after operations sign-off.</p>
    <p className="prototype-note">No orders, payments, emails, payroll records or inventory are created from this screen.</p>
  </section></div>;
}
