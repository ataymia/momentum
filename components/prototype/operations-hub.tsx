"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowUpDown, ExternalLink, Search } from "lucide-react";
import { canVisitRoute, routeEntry, routeLabel } from "../../lib/navigation-route-registry";
import { navigateToRoute, useNavigationRoute } from "../../lib/navigation-store";
import { GOLDEN_EAGLE_SKUS, skuForProductName } from "../../lib/product-catalog";
import { orderFirstSettlementDate } from "../../lib/bonus-engine";
import { useWorkspace } from "../../lib/workspace-context";
import { TerritoryPanel } from "../crm/territory-panel";
import { AdminEmployeeProfiles } from "../hcm/admin-employee-profiles";
import { EmployeeDirectory } from "../hcm/employee-directory";
import { PeopleExperience, PayrollExperience } from "./hr-payroll-experiences";
import { AccountConsolidationReview } from "./account-consolidation-review";
import { OrdersDirectory, OrderDetail, InvoiceDirectory, InvoiceDetail, PaymentsDirectory, PaymentDetail } from "./commerce-experience";
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
  const rows=useMemo(()=>scope.accounts.filter(a=>a.contactName&&[a.contactName,a.name,a.email,a.phone,a.contactRole,a.location,a.stage].join(" ").toLowerCase().includes(query.toLowerCase())).sort((a,b)=>{
    const value=(a:typeof b)=>String(a[sort]??"");
    return (ascending?1:-1)*(value(a).localeCompare(value(b),undefined,{numeric:true})||a.id.localeCompare(b.id));
  }),[scope.accounts,query,sort,ascending]);
  const header=(key:ContactSortField,label:string)=><button type="button" aria-label={"Sort by "+label} onClick={()=>{if(sort===key)setAscending(v=>!v);else{setSort(key);setAscending(true);}}}>{label}<ArrowUpDown size={14}/></button>;
  return <div><Heading title="Contacts" description="All recorded decision-makers linked to your accessible customer locations."/>
    <section className="prototype-panel">
      <div className="prototype-controls"><label className="prototype-search"><Search size={16}/><input aria-label="Search contacts" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Contact, business, email, phone, role"/></label></div>
      <div className="prototype-table-scroll"><table className="prototype-table">
        <thead><tr><th>{header("contactName","Contact")}</th><th>{header("name","Business")}</th><th>{header("contactRole","Role")}</th><th>{header("email","Email")}</th><th>{header("phone","Phone")}</th><th>{header("location","Location")}</th><th>{header("stage","Stage")}</th></tr></thead>
        <tbody>{rows.map(a=><tr key={a.id}><td>{a.contactName}</td><td><OpenLink to={"/sales/customers/"+encodeURIComponent(a.id)}>{a.name}</OpenLink></td><td>{a.contactRole||"Not recorded"}</td><td>{a.email||"Not recorded"}</td><td>{a.phone||"Not recorded"}</td><td>{a.location}</td><td>{a.stage}</td></tr>)}</tbody>
      </table></div>
      {!rows.length&&<Empty>No matching contacts.</Empty>}
      <p className="prototype-note">{rows.length} contact-location associations. Distinct standalone contact IDs and deduplication are planned.</p>
    </section></div>;
}

/** A separate customer-facing surface with account-scoped records, not staff-wide ledgers. */
function CustomerPortalContent({section}:{section:string}){
  const {scope,currentUser}=useWorkspace();
  if(currentUser?.role!=="Customer") return <Empty>Customer access only.</Empty>;
  const current=scope.accounts[0];
  const orders=scope.orders.filter(o=>!o.testOnly).sort((a,b)=>b.placedAt.localeCompare(a.placedAt));
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
    return <div><Heading title="My Deliveries" description="Order progress from your account's approved records."/>
      <section className="prototype-panel"><table className="prototype-table"><thead><tr><th>Order</th><th>Placed</th><th>Status</th><th>Cases</th></tr></thead><tbody>{orders.map(o=>
      <tr key={o.id}><td><OpenLink to={"/sales/orders/"+encodeURIComponent(o.id)}>{o.number}</OpenLink></td><td>{o.placedAt}</td><td>{o.status}</td><td>{o.cases}</td></tr>)}</tbody></table>
      {!orders.length&&<Empty>No recorded orders.</Empty>}<p className="prototype-note">Live driver ETA and shipment tracking are not connected yet. This displays existing order statuses only.</p></section></div>;
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
function TerritoryMapPreview(){
  return <div><Heading title="Territories & Map" description="Existing ZIP assignments and geographic controls retained."/>
    <section className="prototype-panel"><h2>Territory management</h2><TerritoryPanel/>
    <p className="prototype-note">Map overlay, geocoded ZIP boundaries and routing require verified mapping data/provider. Do not mistake a ZIP listing for a plotted geographic boundary.</p>
    <OpenLink to="/crm/account-map">Account map</OpenLink></section></div>;
}

export function PrototypeOperationsHub(){
  const path=useNavigationRoute();const {currentUser}=useWorkspace();
  if(!canVisitRoute(currentUser,path))return <Empty>You do not have permission to view this module.</Empty>;
  const segments=path.split("/").filter(Boolean);
  if(segments[0]==="portal"&&segments[1])return <CustomerPortalContent section={segments[1]}/>;
  if(path==="/people")return <PeopleExperience/>;
  if(path==="/people/payroll")return <PayrollExperience/>;
  if(path==="/admin/accounts")return <AccountConsolidationReview/>;
  if(path==="/admin/employee-profiles")return <div><Heading title="Employee Profiles" description="Preserved administrator-only employee record controls."/><AdminEmployeeProfiles/></div>;
  if(path==="/admin/employees")return <div><Heading title="Employee Directory" description="Administrator view of active staff."/><EmployeeDirectory/></div>;
  if(path==="/crm/territory-map")return <TerritoryMapPreview/>;
  if(segments[0]==="sales"&&segments[1]==="customers"&&segments[2])return <CustomerRecord id={decodeURIComponent(segments[2])} section={segments[3]??"overview"}/>;
  if(segments[0]==="items"&&segments[1])return <ProductRecord skuId={decodeURIComponent(segments[1])} section={segments[2]??"overview"}/>;
  if(segments[0]==="sales"&&segments[1]==="orders"&&segments[2])return <OrderDetail id={decodeURIComponent(segments[2])}/>;
  if(segments[0]==="sales"&&segments[1]==="invoices"&&segments[2])return <InvoiceDetail id={decodeURIComponent(segments[2])}/>;
  if(segments[0]==="sales"&&segments[1]==="payments"&&segments[2])return <PaymentDetail id={decodeURIComponent(segments[2])}/>;
  if(path==="/sales/orders")return <OrdersDirectory/>;
  if(path==="/sales/invoices")return <InvoiceDirectory/>;
  if(path==="/sales/payments")return <PaymentsDirectory/>;
  if(path==="/items")return <ProductDirectory/>;
  if(path==="/sales/customers")return <AccountsDirectory/>;
  if(path==="/crm/leads")return <AccountsDirectory leadMode/>;
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
