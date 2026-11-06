"use client";

/**
 * Independent commerce directories and records for the prototype.
 * Commerce financial directories remain read-only. Order submission and
 * approvals are prototyped separately with local-only demo mutation guards.
 * No payment, invoice issuance or email is triggered from this file.
 */
import {useMemo,useState} from "react";
import {ArrowLeft,ArrowUpDown,ExternalLink,Search} from "lucide-react";
import {useWorkspace} from "../../lib/workspace-context";
import {useInventoryLedger} from "../../lib/inventory-ledger-context";
import {buildOrderCommerceEvidence} from "../../lib/order-commerce-evidence";
import {InvoicePrintCenter} from "../finance/invoice-print-center";
import {downloadCsv} from "../../lib/browser-export";
import {useCommerce} from "../../lib/commerce-context";
import {
  arAgingBucket,computedInvoiceStatus,invoiceBalance,invoicePaidAmount,
  invoicePendingAmount,invoiceCreditAmount,paymentSettlementDate,
  type Invoice,type Payment,
} from "../../lib/commerce-engine";
import {canAccessPage,canCreateOrder} from "../../lib/access";
import {OrderApprovalSummary} from "./order-actions";
import {navigateToRoute} from "../../lib/navigation-store";
import type {Order} from "../../lib/types";

const money=(amount:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(amount);
const showDate=(raw:string|undefined)=>raw?.slice(0,10)||"Not recorded";
const statusLabel=(value:string)=>value||"Not recorded";
type SortDirection="asc"|"desc";
const compare=(a:string|number,b:string|number,dir:SortDirection)=>{
  const order=typeof a==="number"&&typeof b==="number"?a-b:String(a).localeCompare(String(b),undefined,{numeric:true});
  return (dir==="asc"?1:-1)*order;
};
function Header({name,selected,direction,onClick}:{name:string;selected:boolean;direction:SortDirection;onClick:()=>void}){
  return <th aria-sort={selected?(direction==="asc"?"ascending":"descending"):"none"}><button type="button" onClick={onClick}>{name}<ArrowUpDown size={14}/></button></th>;
}
function Title({title,detail,back}:{title:string;detail:string;back?:string}){
  return <header className="prototype-heading">{back&&<button type="button" className="prototype-back" onClick={()=>navigateToRoute(back)}><ArrowLeft size={15}/> Back to directory</button>}<h1>{title}</h1><p>{detail}</p></header>;
}
function Link({url,children}:{url:string;children:React.ReactNode}){
  return <button type="button" className="prototype-link" onClick={()=>navigateToRoute(url)}>{children}<ExternalLink size={13}/></button>;
}
function Fact({label,value}:{label:string;value:React.ReactNode}){
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}
function Empty({text}:{text:string}){return <div className="prototype-empty">{text}</div>}
function Status({value}:{value:string}){
  return <span className={"prototype-status prototype-status--"+value.toLowerCase().replace(/[^a-z0-9]+/g,"-")}>{value}</span>;
}
function useSort(initial:string,initialDirection:SortDirection="desc"){
  const [field,setField]=useState(initial),[direction,setDirection]=useState<SortDirection>(initialDirection);
  const select=(key:string)=>{
    if(key===field)setDirection(old=>old==="asc"?"desc":"asc");
    else {setField(key);setDirection("asc");}
  };
  return {field,direction,select};
}
function Filters({query,setQuery,status,setStatus,statusOptions,from,setFrom,to,setTo,searchLabel,repOptions,rep,setRep}:{
  query:string;setQuery:(v:string)=>void;status:string;setStatus:(v:string)=>void;
  statusOptions:readonly string[];from:string;setFrom:(v:string)=>void;to:string;setTo:(v:string)=>void;
  searchLabel:string;repOptions?:{id:string;name:string}[];rep?:string;setRep?:(v:string)=>void;
}){
  return <div className="prototype-commerce-filters">
    <label className="prototype-search"><Search size={16}/><input aria-label={searchLabel} value={query} onChange={event=>setQuery(event.target.value)} placeholder={searchLabel}/></label>
    <label>Status<select aria-label="Filter status" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option>{statusOptions.map(v=><option key={v}>{v}</option>)}</select></label>
    {repOptions&&setRep&&<label>Representative<select aria-label="Filter by representative" value={rep??"all"} onChange={e=>setRep(e.target.value)}><option value="all">All visible reps</option>{repOptions.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label>}
    <label>From<input aria-label="Starting date" type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
    <label>Through<input aria-label="Ending date" type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
  </div>;
}
function CatalogSummary({data}:{data:{label:string;value:React.ReactNode}[]}){
  return <div className="prototype-metrics">{data.map(item=><div key={item.label}><small>{item.label}</small><strong>{item.value}</strong></div>)}</div>;
}

export function OrdersDirectory(){
  const {scope,data,currentUser}=useWorkspace();
  const [query,setQuery]=useState(""),[status,setStatus]=useState("all"),[from,setFrom]=useState(""),[to,setTo]=useState(""),[rep,setRep]=useState("all");
  const sorter=useSort("placedAt");
  const accountById=useMemo(()=>new Map(scope.accounts.map(a=>[a.id,a])),[scope.accounts]);
  const userById=useMemo(()=>new Map(data.users.map(u=>[u.id,u.name])),[data.users]);
  const rows=useMemo(()=>scope.orders.filter(o=>!o.testOnly)
    .filter(o=>status==="all"||o.status===status)
    .filter(o=>rep==="all"||o.ownerId===rep||o.creditedRepId===rep)
    .filter(o=>(!from||o.placedAt.slice(0,10)>=from)&&(!to||o.placedAt.slice(0,10)<=to))
    .filter(o=>[o.number,o.status,accountById.get(o.accountId)?.name,accountById.get(o.accountId)?.location,userById.get(o.ownerId),o.creditedRepId?userById.get(o.creditedRepId):"",o.paymentStatus].join(" ").toLowerCase().includes(query.toLowerCase()))
    .sort((a,b)=>{
      const value=(order:Order):string|number=>{
        const account=accountById.get(order.accountId);
        switch(sorter.field){
          case "number":return order.number;
          case "account":return account?.name??"";
          case "rep":return userById.get(order.creditedRepId??order.ownerId)??"";
          case "status":return order.status;
          case "payment":return order.paymentStatus;
          case "cases":return order.cases;
          case "amount":return order.amount;
          default:return order.placedAt;
        }
      };
      return compare(value(a),value(b),sorter.direction)||a.id.localeCompare(b.id);
    }),[scope.orders,status,rep,from,to,query,accountById,userById,sorter.field,sorter.direction]);
  const options=[...new Set(scope.orders.filter(o=>!o.testOnly).map(o=>o.status))].sort();
  const repIds=[...new Set(scope.orders.flatMap(o=>[o.ownerId,o.creditedRepId].filter((id):id is string=>Boolean(id))))];
  return <div><Title title="Sales Orders" detail="Dedicated order register with customer, owner, volume and fulfillment status. Each order has its own URL."/>
    {currentUser?.role!=="Customer"&&canCreateOrder(currentUser)&&<div className="prototype-page-actionbar"><button type="button" className="prototype-primary-action" onClick={()=>navigateToRoute("/sales/orders/new")}>Create sales order</button><span className="prototype-note">New order review and submission are available in local demo only until production acceptance.</span></div>}
    <CatalogSummary data={[{label:"Visible orders",value:rows.length},{label:"Cases in filtered orders",value:rows.reduce((n,o)=>n+o.cases,0)},{label:"Non-cancelled order value",value:money(rows.filter(o=>o.status!=="Cancelled").reduce((n,o)=>n+o.amount,0))}]}/>
    <section className="prototype-panel"><Filters query={query} setQuery={setQuery} status={status} setStatus={setStatus} statusOptions={options} from={from} setFrom={setFrom} to={to} setTo={setTo} searchLabel="Search orders, accounts, rep" repOptions={repIds.map(id=>({id,name:userById.get(id)??id})).sort((a,b)=>a.name.localeCompare(b.name))} rep={rep} setRep={setRep}/>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>
      {([["number","Order"],["account","Customer"],["placedAt","Placed"],["rep","Sales rep"],["cases","Cases"],["amount","Order amount"],["status","Fulfillment"],["payment","Payment"]] as const).map(([key,label])=><Header key={key} name={label} selected={sorter.field===key} direction={sorter.direction} onClick={()=>sorter.select(key)}/>)}
      </tr></thead><tbody>{rows.map(o=><tr key={o.id}>
        <td><Link url={"/sales/orders/"+encodeURIComponent(o.id)}>{o.number}</Link></td>
        <td>{accountById.get(o.accountId)?.name??"Account inaccessible"}</td>
        <td>{showDate(o.placedAt)}</td><td>{userById.get(o.creditedRepId??o.ownerId)??"Unknown"}</td>
        <td>{o.cases}</td><td>{money(o.amount)}</td><td><Status value={o.status}/></td><td>{o.paymentStatus}</td>
      </tr>)}</tbody></table></div>
      {!rows.length&&<Empty text="No orders match your filters."/>}
      <p className="prototype-note">Order value represents submitted transactions, not collected revenue. Cancelled and test-only orders are excluded from the total.</p>
      {currentUser?.role!=="Customer"&&<div className="prototype-legacy-actions"><button type="button" onClick={()=>navigateToRoute("/sales/orders/workflow")}>Existing order operations</button><small>Temporary access to fulfillment, exception controls and rep self-delivery while those interfaces are redesigned. The separate new order editor is in the prototype.</small></div>}
    </section>
  </div>;
}

export function OrderDetail({id}:{id:string}){
  const {scope,data,currentUser}=useWorkspace();const {commerce}=useCommerce();const {ledger}=useInventoryLedger();
  const o=scope.orders.find(item=>item.id===id&&!item.testOnly);
  if(!o)return <Empty text="Order not found or not authorized."/>;
  const account=scope.accounts.find(a=>a.id===o.accountId);
  const customerName=account?.name??"Account inaccessible";
  const evidence=buildOrderCommerceEvidence(o,commerce,ledger);
  const invoice=evidence.activeInvoice;
  const approval=scope.approvals.find(a=>a.recordId===o.id&&["Order","Low stock sale"].includes(a.type));
  const lines=o.lines??(o.product?[{id:o.id,product:o.product,cases:o.cases,pricePerCase:o.pricePerCase,amount:o.amount}]:[]);
  const owner=data.users.find(u=>u.id===o.ownerId);
  const rep=data.users.find(u=>u.id===o.creditedRepId);
  const canEdit=Boolean(currentUser?.id&&["Draft","Awaiting approval","Approved"].includes(o.status)&&
    (currentUser.role==="Administrator"||(["Sales Representative","Sales Manager"].includes(currentUser.role)&&o.ownerId===currentUser.id)));
  return <div><Title title={"Order "+o.number} detail={"Customer: "+customerName} back="/sales/orders"/>
    <CatalogSummary data={[{label:"Order status",value:o.status},{label:"Cases",value:o.cases},{label:"Order value",value:money(o.amount)}]}/>
    <div className="prototype-page-actionbar">
      {canEdit&&<button type="button" className="prototype-primary-action" onClick={()=>navigateToRoute("/sales/orders/"+encodeURIComponent(o.id)+"/edit")}>{o.status==="Draft"?"Correct and resubmit":"Edit order"}</button>}
      <OrderApprovalSummary order={o}/>
    </div>
    <div className="prototype-columns">
      <section className="prototype-panel"><h2>Order details</h2><dl className="prototype-facts">
        <Fact label="Customer" value={account?<Link url={"/sales/customers/"+encodeURIComponent(account.id)}>{account.name} · {account.location}</Link>:"Not available"}/>
        <Fact label="Placed" value={showDate(o.placedAt)}/><Fact label="Created by" value={owner?.name??"Unknown"}/>
        <Fact label="Credited sales rep" value={rep?.name??"Not assigned"}/><Fact label="Price basis" value={o.priceBasis}/>
        <Fact label="Approval" value={approval?approval.status:"Not linked"}/><Fact label="Payment" value={o.paymentStatus}/>
        <Fact label="Invoice" value={invoice&&canAccessPage(currentUser,"orderCash")?<Link url={"/sales/invoices/"+encodeURIComponent(invoice.id)}>{invoice.number}</Link>:"Not available"}/>
      </dl></section>
      <section className="prototype-panel"><h2>Fulfillment & custody</h2>
        <dl className="prototype-facts">
          <Fact label="Current order state" value={o.status}/>
          <Fact label="Warehouse reservations" value={evidence.activeReservations+" cases"}/>
          <Fact label="Customer custody deliveries" value={evidence.deliveredToCustomerCases+" cases recorded"}/>
          <Fact label="Returns from customer custody" value={evidence.returnedFromCustomerCases+" cases recorded"}/>
        </dl>
        {o.cancelledAt&&<p className="prototype-note">Cancelled {showDate(o.cancelledAt)}. {o.cancellationReason??""}</p>}
        {canAccessPage(currentUser,"inventory")&&<><h3>Recorded custody movements</h3>
          {evidence.custodyEvents.map(m=><div className="prototype-work-list" key={m.id}><div><strong>{m.type} · {m.quantity} cases</strong><small className="prototype-description">{showDate(m.at)} · {m.product}</small></div><small>{m.reason||"No reason recorded"}</small></div>)}
          {!evidence.custodyEvents.length&&<Empty text="No order-linked inventory movements have been recorded."/>}
        </>}
        <p className="prototype-note">These counts only reflect order-linked custody events, not a verified recipient signature or full proof of delivery. Unrecorded movements are not inferred from current status.</p>
        {currentUser?.role!=="Customer"&&<button type="button" className="prototype-link" onClick={()=>{
          if(typeof window!=="undefined")window.sessionStorage.setItem("momentum-focus-record",o.id);
          navigateToRoute("/sales/orders/workflow");
        }}>Open existing fulfillment controls<ExternalLink size={13}/></button>}
      </section>
    </div>
    <section className="prototype-panel"><h2>Financial reconciliation</h2>
      <div className="prototype-metrics">
        <div><small>Order face amount</small><strong>{money(o.amount)}</strong></div>
        <div><small>Invoice balance</small><strong>{evidence.receivableBalance===null?"Not reconciled":money(evidence.receivableBalance)}</strong></div>
        <div><small>Cleared allocations net of refunds</small><strong>{evidence.clearedAmount===null?"Not reconciled":money(evidence.clearedAmount)}</strong></div>
        <div><small>Invoice ledger status</small><strong>{evidence.invoiceStatus}</strong></div>
      </div>
      <dl className="prototype-facts">
        <Fact label="Recorded order payment state" value={o.paymentStatus}/>
        <Fact label="Pending invoice allocations" value={evidence.pendingAmount===null?"Not verified":money(evidence.pendingAmount)}/>
        <Fact label="Applied credits" value={evidence.appliedCredits===null?"Not verified":money(evidence.appliedCredits)}/>
      </dl>
      {canAccessPage(currentUser,"orderCash")&&evidence.paymentRecords.map(({payment,allocatedAmount})=>
        <div className="prototype-work-list" key={payment.id}>
          <div><Link url={"/sales/payments/"+encodeURIComponent(payment.id)}>{payment.method} · {payment.status}</Link><small className="prototype-description">Recorded {showDate(payment.receivedAt)} · Settled {showDate(payment.settledAt)}</small></div>
          <strong>{money(allocatedAmount)}</strong>
        </div>
      )}
      {evidence.warnings.map((message,index)=><p key={index} role="status" className="prototype-note">{message}</p>)}
      <p className="prototype-note">An order marked Paid or Delivered does not itself prove that a processor settled funds or the customer signed delivery. Finance must resolve discrepancies in source records; this view never posts transactions.</p>
    </section>
    <section className="prototype-panel"><h2>Item lines</h2><div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Product</th><th>Cases</th><th>Unit price</th><th>Line amount</th></tr></thead><tbody>
      {lines.map(line=><tr key={line.id}><td>{line.product}</td><td>{line.cases}</td><td>{money(line.pricePerCase)}</td><td>{money(line.amount)}</td></tr>)}
    </tbody></table></div></section>
  </div>;
}

export function InvoiceDirectory(){
  const {scope}=useWorkspace();const {commerce}=useCommerce();
  const [query,setQuery]=useState(""),[status,setStatus]=useState("all"),[from,setFrom]=useState(""),[to,setTo]=useState("");
  const [showPrint,setShowPrint]=useState(false);
  const sort=useSort("issuedAt");
  const allowedAccounts=new Set(scope.accounts.map(a=>a.id));
  const accountById=new Map(scope.accounts.map(a=>[a.id,a]));
  const rows=commerce.invoices.filter(i=>allowedAccounts.has(i.accountId))
    .map(invoice=>{
      const order=scope.orders.find(o=>o.id===invoice.orderId);
      const deliveryConfirmed=Boolean(order&&["Delivered","Paid"].includes(order.status));
      return {invoice,order,deliveryConfirmed,customer:accountById.get(invoice.accountId)?.name??"Restricted",balance:invoiceBalance(commerce,invoice),status:computedInvoiceStatus(commerce,invoice)};
    }).filter(x=>status==="all"||x.status===status)
    .filter(x=>(!from||x.invoice.issuedAt.slice(0,10)>=from)&&(!to||x.invoice.issuedAt.slice(0,10)<=to))
    .filter(x=>[x.invoice.number,x.customer,x.order?.number,x.status,x.invoice.terms].join(" ").toLowerCase().includes(query.toLowerCase()))
    .sort((a,b)=>{
      const value=(x:typeof a):string|number=>{
        switch(sort.field){case "number":return x.invoice.number;case "customer":return x.customer;case "order":return x.order?.number??"";case "total":return x.invoice.total;case "balance":return x.balance;case "status":return x.status;case "dueDate":return x.invoice.dueDate??"";default:return x.invoice.issuedAt;}
      };return compare(value(a),value(b),sort.direction)||a.invoice.id.localeCompare(b.invoice.id);
    });
  const options=[...new Set(commerce.invoices.filter(i=>allowedAccounts.has(i.accountId)).map(i=>computedInvoiceStatus(commerce,i)))].sort();
  return <div><Title title="Invoices" detail="Individual customer receivables, invoice documents and payment allocations. Source records remain unchanged."/>
    <CatalogSummary data={[{label:"Visible invoice records",value:rows.length},{label:"Total recorded invoice amount",value:money(rows.filter(x=>x.status!=="Void").reduce((n,x)=>n+x.invoice.total,0))},{label:"Calculated unpaid balance",value:money(rows.filter(x=>x.status!=="Void").reduce((n,x)=>n+x.balance,0))}]}/>
    <section className="prototype-panel"><Filters query={query} setQuery={setQuery} status={status} setStatus={setStatus} statusOptions={options} from={from} setFrom={setFrom} to={to} setTo={setTo} searchLabel="Search invoice, order or customer"/>
      <div className="prototype-controls-right"><button type="button" onClick={()=>setShowPrint(value=>!value)}>{showPrint?"Close print center":"Print / Save PDF (single or bulk)"}</button><button type="button" disabled={!rows.length} onClick={()=>downloadCsv("momentum-invoices-visible.csv",rows.map(x=>({invoice:x.invoice.number,customer:x.customer,order:x.order?.number??"",recordedDate:x.invoice.issuedAt,dueDate:x.invoice.dueDate??"",total:x.invoice.total,unpaid:x.balance,status:x.status,terms:x.invoice.terms})),["invoice","customer","order","recordedDate","dueDate","total","unpaid","status","terms"])}>Export visible CSV ({rows.length})</button></div>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>
      {([["number","Invoice"],["customer","Customer"],["order","Order"],["issuedAt","Recorded date"],["dueDate","Due date"],["total","Amount"],["balance","Unpaid"],["status","Status"]] as const).map(([key,label])=><Header key={key} name={label} selected={sort.field===key} direction={sort.direction} onClick={()=>sort.select(key)}/>)}
      </tr></thead><tbody>{rows.map(x=><tr key={x.invoice.id}>
        <td><Link url={"/sales/invoices/"+encodeURIComponent(x.invoice.id)}>{x.invoice.number}</Link>{!x.deliveryConfirmed&&<small className="prototype-description">Delivery not verified</small>}</td>
        <td>{x.customer}</td><td>{x.order?.number??"Not linked"}</td><td>{showDate(x.invoice.issuedAt)}</td><td>{showDate(x.invoice.dueDate)}</td>
        <td>{money(x.invoice.total)}</td><td>{money(x.balance)}</td><td><Status value={x.status}/></td>
      </tr>)}</tbody></table></div>
      {!rows.length&&<Empty text="No invoices match your filters."/>}
      <p className="prototype-note">Some legacy commerce records were generated from order state; a recorded invoice alone does not prove delivery, issuance, or that a customer received an invoice. These are existing records, not new invoices created by this screen.</p>
    </section>
    {showPrint&&<section className="prototype-panel"><InvoicePrintCenter allowedInvoiceIds={rows.map(x=>x.invoice.id)} title="Print filtered invoices" description="Select individual invoices or print every active invoice in your filtered list. Use browser Save as PDF to download printable copies."/></section>}
  </div>;
}

export function InvoiceDetail({id}:{id:string}){
  const {scope}=useWorkspace();const {commerce}=useCommerce();
  const visibleAccounts=new Set(scope.accounts.map(a=>a.id));
  const invoice=commerce.invoices.find(i=>i.id===id&&visibleAccounts.has(i.accountId));
  if(!invoice)return <Empty text="Invoice not found or not authorized."/>;
  const account=scope.accounts.find(a=>a.id===invoice.accountId);
  const order=scope.orders.find(o=>o.id===invoice.orderId);
  const allocations=commerce.allocations.filter(a=>a.invoiceId===invoice.id)
    .map(a=>({allocation:a,payment:commerce.payments.find(p=>p.id===a.paymentId)})).filter(x=>x.payment?.accountId===invoice.accountId);
  const credits=commerce.credits.filter(c=>c.invoiceId===invoice.id);
  const balance=invoiceBalance(commerce,invoice);
  const paid=invoicePaidAmount(commerce,invoice.id),credit=invoiceCreditAmount(commerce,invoice.id),pending=invoicePendingAmount(commerce,invoice.id);
  const status=computedInvoiceStatus(commerce,invoice);
  return <div><Title title={"Invoice "+invoice.number} detail={"Customer: "+(account?.name??"Restricted")} back="/sales/invoices"/>
    <CatalogSummary data={[{label:"Invoice record amount",value:money(invoice.total)},{label:"Applied cleared payments",value:money(paid)},{label:"Unpaid balance",value:money(balance)}]}/>
    <div className="prototype-columns">
      <section className="prototype-panel"><h2>Invoice details</h2><dl className="prototype-facts">
        <Fact label="Status" value={<Status value={status}/>}/><Fact label="Recorded date" value={showDate(invoice.issuedAt)}/><Fact label="Due date" value={showDate(invoice.dueDate)}/><Fact label="Terms" value={invoice.terms}/>
        <Fact label="Customer" value={account?<Link url={"/sales/customers/"+encodeURIComponent(account.id)}>{account.name}</Link>:"Restricted"}/>
        <Fact label="Sales order" value={order?<Link url={"/sales/orders/"+encodeURIComponent(order.id)}>{order.number}</Link>:"Not linked"}/>
        <Fact label="Aging" value={arAgingBucket(invoice,balance)}/>
        <Fact label="Applied credits" value={money(credit)}/>
        <Fact label="Pending payments" value={money(pending)}/>
      </dl>
      {order&&!["Delivered","Paid"].includes(order.status)&&<p className="prototype-note">Delivery not verified. This existing receivable record must not be represented as a newly issued customer invoice.</p>}
      </section>
      <section className="prototype-panel"><h2>Payment activity</h2>
        {allocations.map(x=><div key={x.allocation.id} className="prototype-work-list"><div><Link url={"/sales/payments/"+encodeURIComponent(x.payment!.id)}>{x.payment!.method} • {x.payment!.status}</Link><small className="prototype-description">{showDate(x.payment!.settledAt??x.payment!.receivedAt)}</small></div><strong>{money(x.allocation.amount)}</strong></div>)}
        {!allocations.length&&<Empty text="No linked recorded payment allocations."/>}
        <p className="prototype-note">Allocation amounts are not equivalent to settled funds. Cleared and reversed statuses are evaluated by the commerce ledger.</p>
      </section>
    </div>
    <section className="prototype-panel"><h2>Invoice lines</h2>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Item</th><th>Cases</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>
        {(invoice.linesSnapshot??order?.lines??[]).map(l=><tr key={l.id}><td>{l.product}</td><td>{l.cases}</td><td>{money(l.pricePerCase)}</td><td>{money(l.amount)}</td></tr>)}
      </tbody></table></div>
      {!(invoice.linesSnapshot?.length||order?.lines?.length)&&<p className="prototype-note">No item-level invoice snapshot is available. The order record may retain legacy product totals.</p>}
      {credits.length>0&&<><h3>Credit records</h3>{credits.map(c=><div key={c.id} className="prototype-work-list"><span>{c.reason} • {c.status}</span><strong>{money(c.amount)}</strong></div>)}</>}
      <p className="prototype-note">Hosted payment links are not active. This preview does not charge customers, record funds, or send emails.</p>
    </section>
    <section className="prototype-panel"><InvoicePrintCenter allowedInvoiceIds={[invoice.id]} title="Print or save this invoice" description="Uses the original authorized invoice layout and source records. Browser printing supports Save as PDF."/></section>
  </div>;
}

export function PaymentsDirectory(){
  const {scope,currentUser}=useWorkspace();const {commerce}=useCommerce();
  const [query,setQuery]=useState(""),[status,setStatus]=useState("all"),[from,setFrom]=useState(""),[to,setTo]=useState("");
  const sort=useSort("receivedAt");
  const allowed=new Set(scope.accounts.map(a=>a.id)),names=new Map(scope.accounts.map(a=>[a.id,a.name]));
  const rows=commerce.payments.filter(p=>allowed.has(p.accountId))
    .filter(p=>status==="all"||p.status===status)
    .filter(p=>(!from||p.receivedAt.slice(0,10)>=from)&&(!to||p.receivedAt.slice(0,10)<=to))
    .filter(p=>[p.id,names.get(p.accountId),p.method,p.status,currentUser?.role==="Administrator"?p.processorReference:""].join(" ").toLowerCase().includes(query.toLowerCase()))
    .sort((a,b)=>{const value=(p:Payment):string|number=>{
      switch(sort.field){case "id":return p.id;case "customer":return names.get(p.accountId)??"";case "amount":return p.amount;case "method":return p.method;case "status":return p.status;case "settledAt":return p.settledAt??"";default:return p.receivedAt;}
    };return compare(value(a),value(b),sort.direction)||a.id.localeCompare(b.id)});
  const statuses=[...new Set(commerce.payments.filter(p=>allowed.has(p.accountId)).map(p=>p.status))].sort();
  return <div><Title title="Payments Received" detail="Recorded customer payments, allocations and settlement states. No payment processing occurs on this page."/>
    <CatalogSummary data={[{label:"Recorded payment entries",value:rows.length},{label:"Cleared payment face amount",value:money(rows.filter(p=>p.status==="Cleared").reduce((n,p)=>n+p.amount,0))},{label:"Pending payment face amount",value:money(rows.filter(p=>p.status==="Pending").reduce((n,p)=>n+p.amount,0))}]}/>
    <section className="prototype-panel"><Filters query={query} setQuery={setQuery} status={status} setStatus={setStatus} statusOptions={statuses} from={from} setFrom={setFrom} to={to} setTo={setTo} searchLabel="Search customer, method or reference"/>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>
        {([["id","Payment"],["customer","Customer"],["receivedAt","Received"],["settledAt","Settlement"],["amount","Face amount"],["method","Method"],["status","Status"]] as const).map(([key,label])=><Header key={key} name={label} selected={sort.field===key} direction={sort.direction} onClick={()=>sort.select(key)}/>)}
      </tr></thead><tbody>{rows.map(p=><tr key={p.id}><td><Link url={"/sales/payments/"+encodeURIComponent(p.id)}>{p.id}</Link></td>
        <td>{names.get(p.accountId)??"Restricted"}</td><td>{showDate(p.receivedAt)}</td><td>{showDate(paymentSettlementDate(p))}</td>
        <td>{money(p.amount)}</td><td>{p.method}</td><td><Status value={p.status}/></td></tr>)}</tbody></table></div>
      {!rows.length&&<Empty text="No recorded payments match your search."/>}
      <p className="prototype-note">Payment face amount is not net cash after refunds or reversals. Reconciliation and invoice balances remain with the source ledgers.</p>
    </section>
  </div>;
}
export function PaymentDetail({id}:{id:string}){
  const {scope,currentUser}=useWorkspace();const {commerce}=useCommerce();
  const allowed=new Set(scope.accounts.map(a=>a.id));
  const payment=commerce.payments.find(p=>p.id===id&&allowed.has(p.accountId));
  if(!payment)return <Empty text="Payment not found or not authorized."/>;
  const account=scope.accounts.find(a=>a.id===payment.accountId);
  const allocations=commerce.allocations.filter(a=>a.paymentId===payment.id).map(a=>({allocation:a,invoice:commerce.invoices.find(i=>i.id===a.invoiceId)}))
    .filter(x=>x.invoice?.accountId===payment.accountId);
  const refunds=commerce.refunds.filter(r=>r.paymentId===payment.id);
  return <div><Title title={"Payment "+payment.id} detail={"Customer: "+(account?.name??"Restricted")} back="/sales/payments"/>
    <CatalogSummary data={[{label:"Recorded amount",value:money(payment.amount)},{label:"Status",value:payment.status},{label:"Linked invoice allocations",value:allocations.length}]}/>
    <div className="prototype-columns">
      <section className="prototype-panel"><h2>Payment details</h2><dl className="prototype-facts">
        <Fact label="Customer" value={account?<Link url={"/sales/customers/"+encodeURIComponent(account.id)}>{account.name}</Link>:"Restricted"}/>
        <Fact label="Method" value={payment.method}/><Fact label="Received" value={showDate(payment.receivedAt)}/>
        <Fact label="Settlement" value={showDate(paymentSettlementDate(payment))}/><Fact label="Status" value={<Status value={payment.status}/>}/>
        {currentUser?.role==="Administrator"&&<Fact label="Processor reference" value={payment.processorReference??"Not recorded"}/>}
        {payment.status==="Reversed"&&<Fact label="Reversal" value={payment.reversalReason??"Recorded reversal"}/>}
      </dl></section>
      <section className="prototype-panel"><h2>Invoice allocations</h2>{allocations.map(x=><div key={x.allocation.id} className="prototype-work-list"><span>{x.invoice?<Link url={"/sales/invoices/"+encodeURIComponent(x.invoice.id)}>{x.invoice.number}</Link>:"Invoice unavailable"}</span><strong>{money(x.allocation.amount)}</strong></div>)}
      {!allocations.length&&<Empty text="No visible invoice allocations."/>}</section>
    </div>
    {refunds.length>0&&<section className="prototype-panel"><h2>Refund records</h2>{refunds.map(r=><div className="prototype-work-list" key={r.id}><span>{r.status} · {r.reason}</span><strong>{money(r.amount)}</strong></div>)}</section>}
    <p className="prototype-note">No payment method can be charged or refunded from this read-only prototype.</p>
  </div>;
}
