"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowUpDown, ExternalLink, Search } from "lucide-react";
import { canVisitRoute, routeEntry, routeLabel } from "../../lib/navigation-route-registry";
import { navigateToRoute, useNavigationRoute } from "../../lib/navigation-store";
import { GOLDEN_EAGLE_SKUS, skuForProductName } from "../../lib/product-catalog";
import { orderFirstSettlementDate } from "../../lib/bonus-engine";
import { useWorkspace } from "../../lib/workspace-context";
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

function AccountsDirectory({leadMode=false}:{leadMode?:boolean}){
  const {scope}=useWorkspace();const [query,setQuery]=useState("");const [asc,setAsc]=useState(true);
  const records=useMemo(()=>scope.accounts.filter(a=>!leadMode||["Prospect","Qualified","Sampled"].includes(a.stage)).filter(a=>
    [a.name,a.location,a.contactName,a.postalCode,a.email].join(" ").toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a,b)=>(asc?1:-1)*(a.name.localeCompare(b.name)||a.location.localeCompare(b.location))),[scope.accounts,leadMode,query,asc]);
  return <div><Heading title={leadMode?"Leads":"Customers"} description="Searchable, addressable business records with existing role-based visibility."/>
  <section className="prototype-panel">
    <div className="prototype-controls"><label className="prototype-search"><Search size={16}/><input aria-label="Search businesses" placeholder="Search business, location, contact, ZIP" value={query} onChange={e=>setQuery(e.target.value)}/></label>
    <button type="button" onClick={()=>setAsc(!asc)}><ArrowUpDown size={15}/> Business {asc?"A–Z":"Z–A"}</button></div>
    <table className="prototype-table"><thead><tr><th><button onClick={()=>setAsc(!asc)}>Business <ArrowUpDown size={14}/></button></th><th>Location</th><th>Contact</th><th>Stage</th></tr></thead><tbody>{records.map(a=><tr key={a.id}>
      <td><OpenLink to={"/sales/customers/"+encodeURIComponent(a.id)}>{a.name}</OpenLink></td><td>{a.location}</td><td>{a.contactName||"Unrecorded"}</td><td>{a.stage}</td>
    </tr>)}</tbody></table>{!records.length&&<Empty>No matching records.</Empty>}
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
function OrderRecord({id}:{id:string}){
  const {scope}=useWorkspace(); const o=scope.orders.find(v=>v.id===id);
  if(!o)return <Empty>Order not found or not accessible.</Empty>;
  const account=scope.accounts.find(a=>a.id===o.accountId);
  return <div><Heading title={"Sales order "+o.number} back="/sales/orders" description="Read-only source-linked order summary"/>
    <div className="prototype-metrics"><div><small>Cases</small><strong>{o.cases}</strong></div><div><small>Order status</small><strong>{o.status}</strong></div><div><small>Payment status</small><strong>{o.paymentStatus}</strong></div></div>
    <section className="prototype-panel"><h2>Associated account</h2>{account?<OpenLink to={"/sales/customers/"+encodeURIComponent(account.id)}>{account.name} • {account.location}</OpenLink>:<Empty>Account access not available.</Empty>}
    <h2>Product lines</h2><table className="prototype-table"><thead><tr><th>Item</th><th>Cases</th><th>Price/case</th></tr></thead><tbody>{(o.lines??(o.product?[{id:o.id,product:o.product,cases:o.cases,pricePerCase:o.pricePerCase}]:[])).map(line=><tr key={line.id}><td>{line.product}</td><td>{line.cases}</td><td>{line.pricePerCase.toFixed(2)}</td></tr>)}</tbody></table></section>
  </div>;
}
function CalendarPreview({meetingsOnly}:{meetingsOnly:boolean}){
  const {scope,data}=useWorkspace();
  const upcoming=scope.appointments.filter(a=>a.date>=new Date().toISOString().slice(0,10)).sort((a,b)=>a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime));
  return <div><Heading title={meetingsOnly?"Meetings":"Shared calendar"} description="Field appointments currently recorded by Momentum; staff meeting invitations are a separate planned workflow."/>
    <section className="prototype-panel"><h2>Upcoming authorized field appointments</h2><table className="prototype-table"><thead><tr><th>Date</th><th>Time</th><th>Type</th><th>Assigned to</th><th>Business</th></tr></thead><tbody>{upcoming.map(a=><tr key={a.id}><td>{a.date}</td><td>{a.startTime}</td><td>{a.type}</td><td>{data.users.find(u=>u.id===a.ownerId)?.name??"Unassigned"}</td><td>{scope.accounts.find(ac=>ac.id===a.accountId)?.name??"Restricted"}</td></tr>)}</tbody></table>{!upcoming.length&&<Empty>No upcoming field appointments visible to your role.</Empty>}</section>
    <section className="prototype-panel"><h2>Staff meetings: next phase</h2><p>Authorized organizers will schedule a meeting, select attendees, check conflicts, send invitations, add it to each attendee's calendar, and display a reminder on Home. This is not an active scheduler yet.</p></section>
  </div>;
}
function IncentivePreview(){
  const {scope,data}=useWorkspace();
  const groups=new Map<string,{name:string;ids:Set<string>}>();
  for(const loc of scope.accounts){const key=loc.customerId??loc.id;const group=groups.get(key)??{name:loc.name,ids:new Set<string>()};group.ids.add(loc.id);groups.set(key,group);}
  const entries=[...groups].map(([id,g])=>{
    const orders=scope.orders.filter(o=>g.ids.has(o.accountId)&&!o.testOnly&&o.status!=="Cancelled").sort((a,b)=>a.placedAt.localeCompare(b.placedAt));
    const first=orders[0];const firstDate=first?.placedAt.slice(0,10);
    const start=firstDate ? new Date(firstDate+"T12:00:00Z").getTime():0;const end=start+90*86400000;
    const settled=orders.filter(o=>{const day=orderFirstSettlementDate(data,o);const ms=day?new Date(day+"T12:00:00Z").getTime():Infinity;return Boolean(day&&ms>=start&&ms<=end&&ms<=Date.now());});
    return {id,name:g.name,locations:g.ids.size,cases:settled.reduce((n,o)=>n+o.cases,0)};
  }).sort((a,b)=>a.name.localeCompare(b.name));
  return <div><Heading title="Sales incentives" description="One read-only progress row per stored parent customer; 20 cases is a marker, not a new bonus."/>
    <section className="prototype-panel"><p className="prototype-note">PREVIEW ONLY: This does not post earnings. Accounts with unverified parentage, historical compensation, timing and attribution must be reconciled before using any new calculation for payroll.</p>
    <table className="prototype-table"><thead><tr><th>Business</th><th>Locations</th><th>Settled cases, opening 90 days</th><th>Milestone progress</th></tr></thead><tbody>{entries.map(e=><tr key={e.id}><td>{e.name}</td><td>{e.locations}</td><td>{e.cases}</td><td><div className="prototype-progress"><div style={{width:Math.min(100,(e.cases/40)*100)+"%"}}/></div><small>10 {e.cases>=10?"✓":"○"} · 20 {e.cases>=20?"✓":"○"} · 40 {e.cases>=40?"✓":"○"}</small></td></tr>)}</tbody></table></section></div>;
}
function ContactsDirectory(){
  const {scope}=useWorkspace();const [q,setQ]=useState("");const rows=scope.accounts.filter(a=>a.contactName&&[a.contactName,a.name,a.email].join(" ").toLowerCase().includes(q.toLowerCase()));
  return <div><Heading title="Contacts" description="Existing decision-makers linked to visible customer locations."/><section className="prototype-panel"><label className="prototype-search"><Search size={16}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search contacts" aria-label="Search contacts"/></label>
    <table className="prototype-table"><thead><tr><th>Contact</th><th>Business</th><th>Role</th><th>Email</th></tr></thead><tbody>{rows.map(a=><tr key={a.id}><td>{a.contactName}</td><td><OpenLink to={"/sales/customers/"+encodeURIComponent(a.id)}>{a.name}</OpenLink></td><td>{a.contactRole}</td><td>{a.email||"Not recorded"}</td></tr>)}</tbody></table></section></div>;
}
export function PrototypeOperationsHub(){
  const path=useNavigationRoute();const {currentUser}=useWorkspace();
  if(!canVisitRoute(currentUser,path))return <Empty>You don't have permission to view this module.</Empty>;
  const segments=path.split("/").filter(Boolean);
  if(segments[0]==="sales"&&segments[1]==="customers"&&segments[2])return <CustomerRecord id={decodeURIComponent(segments[2])} section={segments[3]??"overview"}/>;
  if(segments[0]==="items"&&segments[1])return <ProductRecord skuId={decodeURIComponent(segments[1])} section={segments[2]??"overview"}/>;
  if(segments[0]==="sales"&&segments[1]==="orders"&&segments[2])return <OrderRecord id={decodeURIComponent(segments[2])}/>;
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
