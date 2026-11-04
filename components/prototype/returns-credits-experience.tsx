"use client";

/** Evidence-linked commerce review. Returns, credits and refunds are distinct sources. */
import {useState} from "react";
import {ArrowLeft,ArrowUpDown,ExternalLink,Search} from "lucide-react";
import {canAccessPage} from "../../lib/access";
import {invoiceBalance,type CreditMemo,type Invoice} from "../../lib/commerce-engine";
import {useCommerce} from "../../lib/commerce-context";
import type {InventoryMovement} from "../../lib/inventory-ledger";
import {useInventoryLedger} from "../../lib/inventory-ledger-context";
import {navigateToRoute} from "../../lib/navigation-store";
import {useWorkspace} from "../../lib/workspace-context";
import type {Order} from "../../lib/types";

type Direction="asc"|"desc";
const dollars=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n);
const displayDate=(v?:string)=>v?.slice(0,10)||"Not recorded";
const sortValue=(a:string|number,b:string|number,dir:Direction)=>(typeof a==="number"&&typeof b==="number"?a-b:String(a).localeCompare(String(b),undefined,{numeric:true}))*(dir==="asc"?1:-1);
function useSort(initial:string){
  const [field,setField]=useState(initial),[dir,setDir]=useState<Direction>("desc");
  const select=(key:string)=>{if(field===key)setDir(v=>v==="asc"?"desc":"asc");else{setField(key);setDir("asc");}};
  return{field,dir,select};
}
function SortHead({name,keyName,sort}:{name:string;keyName:string;sort:ReturnType<typeof useSort>}){
  return <th aria-sort={sort.field===keyName?(sort.dir==="asc"?"ascending":"descending"):"none"}><button type="button" onClick={()=>sort.select(keyName)}>{name}<ArrowUpDown size={13}/></button></th>;
}
function Header({title,subtitle,back}:{title:string;subtitle:string;back?:string}){
  return <header className="prototype-heading">{back&&<button type="button" className="prototype-back" onClick={()=>navigateToRoute(back)}><ArrowLeft size={15}/> Back to list</button>}<h1>{title}</h1><p>{subtitle}</p></header>;
}
function Open({to,children}:{to:string;children:React.ReactNode}){
  return <button type="button" className="prototype-link" onClick={()=>navigateToRoute(to)}>{children}<ExternalLink size={13}/></button>;
}
function Empty({children}:{children:React.ReactNode}){return <div className="prototype-empty">{children}</div>}
function Facts({records}:{records:{name:string;value:React.ReactNode}[]}){
  return <dl className="prototype-facts">{records.map(item=><div key={item.name}><dt>{item.name}</dt><dd>{item.value}</dd></div>)}</dl>;
}
function useReturnRecords(){
  const {scope,currentUser}=useWorkspace();
  const {ledger}=useInventoryLedger();
  const orders=new Map(scope.orders.filter(o=>!o.testOnly).map(o=>[o.id,o]));
  const visibleLots=new Set(scope.inventory.map(l=>l.id));
  const inventoryAllowed=canAccessPage(currentUser,"inventory");
  const returns=ledger.movements.filter(m=>{
    if(m.type!=="Return")return false;
    if(m.relatedOrderId)return orders.has(m.relatedOrderId);
    return inventoryAllowed&&visibleLots.has(m.lotId);
  });
  return {returns,orders,scope,ledger,inventoryAllowed};
}
export function SalesReturnsDirectory(){
  const {returns,orders,scope}=useReturnRecords();
  const [search,setSearch]=useState(""),[from,setFrom]=useState(""),[through,setThrough]=useState(""),[linkedOnly,setLinkedOnly]=useState(false);
  const sort=useSort("at");
  const customers=new Map(scope.accounts.map(a=>[a.id,a.name]));
  const rows=returns.filter(m=>(!linkedOnly||Boolean(m.relatedOrderId))&&(!from||m.at.slice(0,10)>=from)&&(!through||m.at.slice(0,10)<=through))
    .filter(m=>[m.id,m.product,m.reason,orders.get(m.relatedOrderId??"")?.number,customers.get(orders.get(m.relatedOrderId??"")?.accountId??"")].join(" ").toLowerCase().includes(search.toLowerCase()))
    .sort((a,b)=>{
      const value=(m:InventoryMovement):string|number=>{
        switch(sort.field){case "order":return orders.get(m.relatedOrderId??"")?.number??"";case "product":return m.product;case "quantity":return m.quantity;case "customer":return customers.get(orders.get(m.relatedOrderId??"")?.accountId??"")??"";default:return m.at;}
      };
      return sortValue(value(a),value(b),sort.dir)||a.id.localeCompare(b.id);
    });
  const hdr=(key:string,name:string)=><SortHead key={key} name={name} keyName={key} sort={sort}/>;
  return <div><Header title="Sales Returns" subtitle="Physical return movements from the inventory custody ledger. No refund or credit is implied."/>
    <div className="prototype-metrics"><div><small>Visible return movements</small><strong>{rows.length}</strong></div><div><small>Cases on return movements</small><strong>{rows.reduce((n,m)=>n+m.quantity,0)}</strong></div><div><small>Unlinked movements</small><strong>{rows.filter(m=>!m.relatedOrderId).length}</strong></div></div>
    <section className="prototype-panel"><div className="prototype-commerce-filters">
      <label className="prototype-search"><Search size={16}/><input aria-label="Search return movements" placeholder="Order, product, reason or customer" value={search} onChange={e=>setSearch(e.target.value)}/></label>
      <label>From<input type="date" aria-label="Return starting date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
      <label>Through<input type="date" aria-label="Return ending date" value={through} onChange={e=>setThrough(e.target.value)}/></label>
      <label className="prototype-checkbox-field"><input type="checkbox" checked={linkedOnly} onChange={e=>setLinkedOnly(e.target.checked)}/> Linked to order only</label>
    </div>
    <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>
      {([["at","Recorded"],["order","Order"],["customer","Customer"],["product","Product"],["quantity","Cases"]] as const).map(([key,label])=>hdr(key,label))}<th>Recorded reason</th>
    </tr></thead><tbody>{rows.map(m=>{
      const o=orders.get(m.relatedOrderId??"");
      return <tr key={m.id}><td><Open to={"/sales/returns/"+encodeURIComponent(m.id)}>{displayDate(m.at)}</Open></td>
        <td>{o?<Open to={"/sales/orders/"+encodeURIComponent(o.id)}>{o.number}</Open>:"Unlinked"}</td>
        <td>{customers.get(o?.accountId??"")??"Not linked"}</td><td>{m.product}</td><td>{m.quantity}</td><td>{m.reason||"Not provided"}</td></tr>;
    })}</tbody></table></div>
    {!rows.length&&<Empty>No recorded return movements match these filters.</Empty>}
    <p className="prototype-note">Returns represent custody events, not a completed return merchandise authorization. Credits, accounting adjustments and refunds require their own authorized records and evidence.</p>
    </section>
  </div>;
}
export function SalesReturnDetail({id}:{id:string}){
  const {returns,orders,scope,ledger,inventoryAllowed}=useReturnRecords();
  const movement=returns.find(m=>m.id===id);
  if(!movement)return <Empty>Return movement not found or not authorized.</Empty>;
  const order=orders.get(movement.relatedOrderId??"");
  const account=scope.accounts.find(a=>a.id===order?.accountId);
  const lot=scope.inventory.find(l=>l.id===movement.lotId);
  const nodes=new Map(ledger.nodes.map(n=>[n.id,n.name]));
  return <div><Header title="Return movement" subtitle={"Recorded source event "+movement.id} back="/sales/returns"/>
    <div className="prototype-columns">
      <section className="prototype-panel"><h2>Custody evidence</h2><Facts records={[
        {name:"Recorded date",value:displayDate(movement.at)},
        {name:"Product",value:movement.product},{name:"Quantity",value:movement.quantity+" cases"},
        {name:"Reason",value:movement.reason||"Not recorded"},
        {name:"Lot",value:lot?.lotCode??"Lot not visible in this role"},
        {name:"From custody",value:inventoryAllowed?nodes.get(movement.fromNodeId??"")??"Not recorded":"Restricted"},
        {name:"To custody",value:inventoryAllowed?nodes.get(movement.toNodeId??"")??"Not recorded":"Restricted"},
        {name:"Recorded by",value:movement.actorId},
      ]}/></section>
      <section className="prototype-panel"><h2>Linked commercial record</h2><Facts records={[
        {name:"Sales order",value:order?<Open to={"/sales/orders/"+encodeURIComponent(order.id)}>{order.number}</Open>:"No linked order"},
        {name:"Customer",value:account?.name??"Not linked"},
        {name:"Order status",value:order?.status??"Not linked"},
        {name:"Payment status",value:order?.paymentStatus??"Not linked"},
      ]}/>
      <p className="prototype-note">A physical return does not constitute a payment reversal, issued credit, or completed refund. Review those separately in Finance.</p></section>
    </div>
  </div>;
}
function useCreditRecords(){
  const {scope}=useWorkspace();
  const {commerce}=useCommerce();
  const visibleAccounts=new Set(scope.accounts.map(a=>a.id));
  const invoices=new Map(commerce.invoices.filter(i=>visibleAccounts.has(i.accountId)).map(i=>[i.id,i]));
  const credits=commerce.credits.filter(c=>invoices.has(c.invoiceId));
  return {scope,commerce,invoices,credits};
}
export function CreditNotesDirectory(){
  const {scope,invoices,credits}=useCreditRecords();
  const [search,setSearch]=useState(""),[status,setStatus]=useState("all"),[from,setFrom]=useState(""),[through,setThrough]=useState("");
  const sort=useSort("createdAt");
  const customers=new Map(scope.accounts.map(a=>[a.id,a.name]));
  const rows=credits.filter(c=>(status==="all"||c.status===status)&&(!from||c.createdAt.slice(0,10)>=from)&&(!through||c.createdAt.slice(0,10)<=through))
    .filter(c=>[c.id,c.reason,c.status,invoices.get(c.invoiceId)?.number,customers.get(invoices.get(c.invoiceId)?.accountId??"")].join(" ").toLowerCase().includes(search.toLowerCase()))
    .sort((a,b)=>{
      const value=(c:CreditMemo):string|number=>{
        const invoice=invoices.get(c.invoiceId);
        switch(sort.field){case "invoice":return invoice?.number??"";case "customer":return customers.get(invoice?.accountId??"")??"";case "amount":return c.amount;case "status":return c.status;default:return c.createdAt;}
      };return sortValue(value(a),value(b),sort.dir)||a.id.localeCompare(b.id);
    });
  const hdr=(key:string,name:string)=><SortHead key={key} keyName={key} name={name} sort={sort}/>;
  return <div><Header title="Credit Notes" subtitle="Existing invoice credit records. Approval, application and cash refunds remain separate events."/>
    <div className="prototype-metrics"><div><small>Visible credit notes</small><strong>{rows.length}</strong></div><div><small>Applied credit amount</small><strong>{dollars(rows.filter(c=>c.status==="Applied").reduce((n,c)=>n+c.amount,0))}</strong></div><div><small>Not yet applied</small><strong>{rows.filter(c=>["Draft","Approved"].includes(c.status)).length}</strong></div></div>
    <section className="prototype-panel"><div className="prototype-commerce-filters">
      <label className="prototype-search"><Search size={16}/><input aria-label="Search credit notes" placeholder="Credit ID, invoice, customer, reason" value={search} onChange={e=>setSearch(e.target.value)}/></label>
      <label>Status<select aria-label="Credit note status" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option>{["Draft","Approved","Applied","Void"].map(s=><option key={s}>{s}</option>)}</select></label>
      <label>From<input type="date" aria-label="Credit starting date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
      <label>Through<input type="date" aria-label="Credit ending date" value={through} onChange={e=>setThrough(e.target.value)}/></label>
    </div>
    <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>
      {([["createdAt","Created"],["invoice","Invoice"],["customer","Customer"],["amount","Credit amount"],["status","Status"]] as const).map(([key,label])=>hdr(key,label))}<th>Reason</th>
    </tr></thead><tbody>{rows.map(c=>{
      const invoice=invoices.get(c.invoiceId);
      return <tr key={c.id}><td><Open to={"/sales/credit-notes/"+encodeURIComponent(c.id)}>{displayDate(c.createdAt)}</Open></td>
        <td>{invoice?<Open to={"/sales/invoices/"+encodeURIComponent(invoice.id)}>{invoice.number}</Open>:"Unlinked"}</td>
        <td>{customers.get(invoice?.accountId??"")??"Restricted"}</td><td>{dollars(c.amount)}</td><td>{c.status}</td><td>{c.reason}</td></tr>;
    })}</tbody></table></div>
    {!rows.length&&<Empty>No credit notes match these filters.</Empty>}
    <p className="prototype-note">Applied credits reduce the calculated invoice receivable; draft and approved credits do not. None of these records proves a cash refund was issued or settled.</p>
    </section>
  </div>;
}
export function CreditNoteDetail({id}:{id:string}){
  const {scope,commerce,invoices,credits}=useCreditRecords();
  const credit=credits.find(c=>c.id===id);
  if(!credit)return <Empty>Credit note not found or outside your authorization.</Empty>;
  const invoice=invoices.get(credit.invoiceId) as Invoice|undefined;
  const account=scope.accounts.find(a=>a.id===invoice?.accountId);
  const order=scope.orders.find(o=>o.id===invoice?.orderId) as Order|undefined;
  return <div><Header title="Credit note" subtitle={"Existing credit record "+credit.id} back="/sales/credit-notes"/>
    <div className="prototype-metrics"><div><small>Credit amount</small><strong>{dollars(credit.amount)}</strong></div><div><small>Current credit status</small><strong>{credit.status}</strong></div><div><small>Current invoice balance</small><strong>{invoice?dollars(invoiceBalance(commerce,invoice)):"Not available"}</strong></div></div>
    <div className="prototype-columns">
      <section className="prototype-panel"><h2>Credit evidence</h2><Facts records={[
        {name:"Reason",value:credit.reason},{name:"Created",value:displayDate(credit.createdAt)},
        {name:"Created by",value:credit.createdBy},
        {name:"Approved",value:displayDate(credit.approvedAt)},{name:"Approved by",value:credit.approvedBy??"Not recorded"},
        {name:"Applied",value:displayDate(credit.appliedAt)},{name:"Applied by",value:credit.appliedBy??"Not recorded"},
      ]}/></section>
      <section className="prototype-panel"><h2>Linked records</h2><Facts records={[
        {name:"Customer",value:account?.name??"Restricted"},
        {name:"Invoice",value:invoice?<Open to={"/sales/invoices/"+encodeURIComponent(invoice.id)}>{invoice.number}</Open>:"Not linked"},
        {name:"Order",value:order?<Open to={"/sales/orders/"+encodeURIComponent(order.id)}>{order.number}</Open>:"Not linked"},
        {name:"Cash refund",value:"Not inferred from this credit"},
      ]}/>
      <p className="prototype-note">Only authorized finance controls may approve and apply credits. Cash refunds require their own approval, payment reference and settlement evidence.</p></section>
    </div>
  </div>;
}
