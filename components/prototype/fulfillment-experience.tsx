"use client";

/**
 * Read-only operational views of existing delivery tasks, reservations and
 * movement evidence. No fictional package, shipment, tracking number or ETA
 * is created from an order status. Mutation workflows remain protected by the
 * existing inventory and delivery engines until the new controls pass parity.
 */
import {useMemo,useState} from "react";
import {ArrowLeft,ArrowUpDown,Search,ShieldCheck} from "lucide-react";
import {useWorkspace} from "../../lib/workspace-context";
import {useDelivery} from "../../lib/delivery-context";
import {useInventoryLedger} from "../../lib/inventory-ledger-context";
import {
  activeReservedForOrder,orderOutboundQuantity,orderDeliveryQuantity,
} from "../../lib/inventory-ledger";
import {deliveryStatusForOrder,processedForDelivery,type DeliveryTask} from "../../lib/delivery-engine";
import {deliveryReconciliationIssue} from "../../lib/delivery-reconciliation";
import {navigateToRoute} from "../../lib/navigation-store";
import {ShipmentWorkflowControls} from "./fulfillment-controls";
import type {Order} from "../../lib/types";

const showDate=(s?:string)=>s?s.slice(0,10):"Not recorded";
type SortDirection="asc"|"desc";
const sortValue=(a:string|number,b:string|number,dir:SortDirection)=>
  (typeof a==="number"&&typeof b==="number"?a-b:String(a).localeCompare(String(b),undefined,{numeric:true}))*(dir==="asc"?1:-1);
function useTableSort(initial:string){
  const [field,setField]=useState(initial);
  const [direction,setDirection]=useState<SortDirection>("desc");
  const choose=(key:string)=>{if(key===field)setDirection(v=>v==="asc"?"desc":"asc");else{setField(key);setDirection("asc");}};
  return {field,direction,choose};
}
function Column({name,keyName,sort}:{name:string;keyName:string;sort:ReturnType<typeof useTableSort>}){
  return <th aria-sort={sort.field===keyName?(sort.direction==="asc"?"ascending":"descending"):"none"}>
    <button type="button" onClick={()=>sort.choose(keyName)}>{name}<ArrowUpDown size={14}/></button>
  </th>;
}
function Title({heading,subtitle,back}:{heading:string;subtitle:string;back?:string}){
  return <header className="prototype-heading">
    {back&&<button className="prototype-back" type="button" onClick={()=>navigateToRoute(back)}><ArrowLeft size={15}/> Back to shipments</button>}
    <h1>{heading}</h1><p>{subtitle}</p>
  </header>;
}
function RecordLink({path,children}:{path:string;children:React.ReactNode}){
  return <button className="prototype-link" type="button" onClick={()=>navigateToRoute(path)}>{children}</button>;
}
function Summary({stats}:{stats:{label:string;value:React.ReactNode}[]}){
  return <div className="prototype-metrics">{stats.map(x=><div key={x.label}><small>{x.label}</small><strong>{x.value}</strong></div>)}</div>;
}
function SearchInput({value,onChange,placeholder}:{value:string;onChange:(v:string)=>void;placeholder:string}){
  return <label className="prototype-search"><Search size={16}/>
    <input aria-label={placeholder} placeholder={placeholder} value={value} onChange={e=>onChange(e.target.value)}/>
  </label>;
}
function DateFilter({start,setStart,end,setEnd}:{start:string;setStart:(s:string)=>void;end:string;setEnd:(s:string)=>void}){
  return <><label>From<input aria-label="From date" type="date" value={start} onChange={e=>setStart(e.target.value)}/></label>
    <label>Through<input aria-label="Through date" type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label></>;
}
function Note(){return <p className="prototype-note"><ShieldCheck size={14}/> Ledger reservations are not physical packing evidence. Loading, transit, customer receipt, and settlement are shown separately, based on the recorded workflow.</p>}
function useOperationalRecords(){
  const {scope,currentUser,data}=useWorkspace();
  const {state}=useDelivery();
  const {ledger}=useInventoryLedger();
  const allowed=new Set(scope.orders.map(order=>order.id));
  const accounts=new Map(scope.accounts.map(a=>[a.id,a]));
  const users=new Map(data.users.map(u=>[u.id,u.name]));
  const tasks=state.tasks.filter(t=>allowed.has(t.orderId)&&(currentUser?.role!=="Delivery Driver"||t.driverId===currentUser.id));
  const indexed=new Map(tasks.filter(t=>t.status!=="Cancelled").map(t=>[t.orderId,t]));
  const orders=scope.orders.filter(o=>!o.testOnly&&processedForDelivery(o)&&
    (currentUser?.role!=="Delivery Driver"||indexed.get(o.id)?.driverId===currentUser.id));
  return {scope,currentUser,state,ledger,accounts,users,tasks,indexed,orders};
}
function packageState(order:Order,task:DeliveryTask|undefined,loaded:number,reserved:number){
  if(task?.status==="Delivered")return "Delivery recorded";
  if(task?.status==="In transit")return "On vehicle / in transit";
  if(task?.status==="Loaded")return "Loaded";
  if(task?.status==="Accepted")return "Accepted, not yet loaded";
  if(loaded>=order.cases&&order.cases>0)return "Warehouse outbound recorded";
  if(reserved>=order.cases&&order.cases>0)return "Stock reserved, not packed";
  return "Requires preparation review";
}
export function PackagesDirectory(){
  const {orders,accounts,users,indexed,ledger}=useOperationalRecords();
  const [query,setQuery]=useState(""),[filter,setFilter]=useState("all");
  const sort=useTableSort("placedAt");
  const records=useMemo(()=>orders.map(o=>{
    const task=indexed.get(o.id);
    const outbound=orderOutboundQuantity(ledger,o.id);
    const reserved=activeReservedForOrder(ledger,o.id);
    return {order:o,task,outbound,reserved,state:packageState(o,task,outbound,reserved)};
  }).filter(x=>filter==="all"||x.state===filter)
    .filter(x=>[x.order.number,accounts.get(x.order.accountId)?.name,x.state,users.get(x.task?.driverId??"")].join(" ").toLowerCase().includes(query.toLowerCase()))
    .sort((a,b)=>{
      const val=(x:typeof a):string|number=>{
        switch(sort.field){case "order":return x.order.number;case "customer":return accounts.get(x.order.accountId)?.name??"";case "cases":return x.order.cases;case "reserved":return x.reserved;case "outbound":return x.outbound;case "state":return x.state;default:return x.order.placedAt;}
      };
      return sortValue(val(a),val(b),sort.direction)||a.order.id.localeCompare(b.order.id);
    }),[orders,accounts,users,indexed,ledger,filter,query,sort.field,sort.direction]);
  const states=[...new Set(records.map(x=>x.state))].sort();
  const col=(key:string,name:string)=><Column key={key} keyName={key} name={name} sort={sort}/>;
  return <div><Title heading="Packages & Preparation" subtitle="A packing worklist sourced from approved orders, warehouse reservations and delivery custody evidence. Package labels and tracking IDs are not yet generated."/>
    <Summary stats={[{label:"Orders in view",value:records.length},{label:"Total cases",value:records.reduce((n,x)=>n+x.order.cases,0)},{label:"Recorded warehouse outbound",value:records.reduce((n,x)=>n+x.outbound,0)}]}/>
    <section className="prototype-panel"><div className="prototype-commerce-filters"><SearchInput value={query} onChange={setQuery} placeholder="Search order, customer, driver or status"/>
      <label>Preparation state<select aria-label="Filter package preparation" value={filter} onChange={e=>setFilter(e.target.value)}>
        <option value="all">All preparation states</option>{[...new Set([...states,"Stock reserved, not packed","Loaded","Requires preparation review"])].sort().map(x=><option key={x}>{x}</option>)}
      </select></label></div>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>
        {col("order","Order")}{col("customer","Customer")}{col("placedAt","Placed")}{col("cases","Cases")}{col("reserved","Reserved")}{col("outbound","Outbound")}{col("state","Preparation status")}<th>Workflow</th>
      </tr></thead><tbody>{records.map(x=><tr key={x.order.id}>
        <td><RecordLink path={"/sales/orders/"+encodeURIComponent(x.order.id)}>{x.order.number}</RecordLink></td>
        <td>{accounts.get(x.order.accountId)?.name??"Restricted"}</td><td>{showDate(x.order.placedAt)}</td><td>{x.order.cases}</td>
        <td>{x.reserved}</td><td>{x.outbound}</td><td>{x.state}</td><td><RecordLink path={"/inventory/shipments/"+encodeURIComponent(x.order.id)}>Review preparation</RecordLink></td></tr>)}</tbody></table></div>
      {!records.length&&<p className="prototype-empty">No orders match the preparation filters.</p>}
      <Note/>
      <p className="prototype-note">Actual pack/allocate and inventory-custody actions remain in the established operations workflow until the new transaction-safe controls are validated.</p>
    </section></div>;
}
export function ShipmentsDirectory(){
  const {tasks,orders,accounts,users,ledger}=useOperationalRecords();
  const [query,setQuery]=useState(""),[filter,setFilter]=useState("all");
  const [from,setFrom]=useState(""),[through,setThrough]=useState("");
  const sort=useTableSort("acceptedAt");
  const orderIds=new Map(orders.map(o=>[o.id,o]));
  const rows=tasks.filter(t=>orderIds.has(t.orderId)).map(t=>({task:t,order:orderIds.get(t.orderId)!}))
    .filter(x=>filter==="all"||x.task.status===filter)
    .filter(x=>(!from||x.task.acceptedAt.slice(0,10)>=from)&&(!through||x.task.acceptedAt.slice(0,10)<=through))
    .filter(x=>[x.task.id,x.order.number,x.task.status,accounts.get(x.order.accountId)?.name,users.get(x.task.driverId)].join(" ").toLowerCase().includes(query.toLowerCase()))
    .sort((a,b)=>{
      const val=(x:typeof a):string|number=>{switch(sort.field){
        case "order":return x.order.number;case "customer":return accounts.get(x.order.accountId)?.name??"";
        case "driver":return users.get(x.task.driverId)??"";case "cases":return x.order.cases;
        case "status":return x.task.status;case "departedAt":return x.task.departedAt??"";
        case "deliveredAt":return x.task.deliveredAt??"";default:return x.task.acceptedAt;
      }};
      return sortValue(val(a),val(b),sort.direction)||a.task.id.localeCompare(b.task.id);
    });
  const col=(key:string,name:string)=><Column key={key} keyName={key} name={name} sort={sort}/>;
  return <div><Title heading="Shipments" subtitle="Recorded delivery assignments, movements and recipient proof. No carrier tracking number or estimated arrival is invented."/>
    <Summary stats={[{label:"Visible delivery assignments",value:rows.length},{label:"In transit",value:rows.filter(x=>x.task.status==="In transit").length},{label:"Signed deliveries",value:rows.filter(x=>x.task.status==="Delivered"&&Boolean(x.task.signature)).length}]}/>
    <section className="prototype-panel"><div className="prototype-commerce-filters"><SearchInput value={query} onChange={setQuery} placeholder="Search shipment, customer, order or driver"/>
      <label>Delivery status<select aria-label="Filter shipment status" value={filter} onChange={e=>setFilter(e.target.value)}>
        <option value="all">All statuses</option>{["Accepted","Loaded","In transit","Delivered","Cancelled"].map(status=><option key={status}>{status}</option>)}
      </select></label><DateFilter start={from} setStart={setFrom} end={through} setEnd={setThrough}/></div>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>
        {col("order","Order")}{col("customer","Customer")}{col("acceptedAt","Accepted")}{col("driver","Assigned driver")}{col("cases","Cases")}{col("status","Status")}{col("departedAt","Departed")}{col("deliveredAt","Delivered")}
      </tr></thead><tbody>{rows.map(({task,order})=><tr key={task.id}><td><RecordLink path={"/inventory/shipments/"+encodeURIComponent(order.id)}>{order.number}</RecordLink></td>
        <td>{accounts.get(order.accountId)?.name??"Restricted"}</td><td>{showDate(task.acceptedAt)}</td>
        <td>{users.get(task.driverId)??"Recorded ID: "+task.driverId}</td><td>{order.cases}</td><td>{task.status}</td>
        <td>{showDate(task.departedAt)}</td><td>{showDate(task.deliveredAt)}</td></tr>)}</tbody></table></div>
      {!rows.length&&<p className="prototype-empty">No recorded delivery assignments match.</p>}
      <p className="prototype-note">Delivery proof is only complete when signature and inventory posting are verified. A field cash-collection note is not a settled payment.</p>
    </section></div>;
}
export function ShipmentDetail({orderId}:{orderId:string}){
  const {tasks,orders,accounts,users,ledger,state,currentUser}=useOperationalRecords();
  const order=orders.find(o=>o.id===orderId);
  const task=tasks.find(t=>t.orderId===orderId&&t.status!=="Cancelled")??tasks.find(t=>t.orderId===orderId);
  if(!order)return <p className="prototype-empty">Shipment order not found or access is restricted.</p>;
  if(!task)return <div><Title heading={"Prepare shipment for "+order.number} subtitle="No delivery task is currently assigned to this approved order." back="/inventory/shipments"/>
    <ShipmentWorkflowControls order={order}/><Note/></div>;
  const deliveredCases=orderDeliveryQuantity(ledger,order.id);
  const movements=ledger.movements.filter(m=>m.relatedOrderId===order.id);
  const verifiedSignature=Boolean(task.signature?.signedAt&&task.signature.strokes.length&&task.history.some(event=>event.type==="Delivered"&&event.actorId===task.signature?.capturedBy));
  const override=state.overrides.find(x=>x.orderId===order.id);
  return <div><Title heading={"Shipment for "+order.number} subtitle={"Delivery task "+task.id} back="/inventory/shipments"/>
    <Summary stats={[{label:"Task state",value:task.status},{label:"Cases in order",value:order.cases},{label:"Posted delivered cases",value:deliveredCases}]}/>
    <div className="prototype-columns">
      <section className="prototype-panel"><h2>Shipment record</h2><dl className="prototype-facts">
        <div><dt>Customer location</dt><dd>{accounts.get(order.accountId)?.name??"Restricted"}</dd></div>
        <div><dt>Assigned driver</dt><dd>{users.get(task.driverId)??"Historical ID "+task.driverId}</dd></div>
        <div><dt>Assignment accepted</dt><dd>{showDate(task.acceptedAt)}</dd></div>
        <div><dt>Loaded</dt><dd>{showDate(task.loadedAt)}</dd></div>
        <div><dt>Departed</dt><dd>{showDate(task.departedAt)}</dd></div>
        <div><dt>Delivered</dt><dd>{showDate(task.deliveredAt)}</dd></div>
        <div><dt>Recipient proof</dt><dd>{verifiedSignature?"Recorded signature ("+showDate(task.signature?.signedAt)+")":"No verified task signature"}</dd></div>
        <div><dt>Inventory posting</dt><dd>{deliveredCases>=order.cases?"Full order quantity posted":"Not fully posted"}</dd></div>
      </dl>
      {override&&currentUser?.role==="Administrator"&&<p className="prototype-note">Administrator override recorded {showDate(override.recordedAt)}. Reason: {override.reason}</p>}
      </section>
      <section className="prototype-panel"><h2>Recorded activity</h2>
        {task.history.slice().sort((a,b)=>a.at.localeCompare(b.at)).map(ev=><div key={ev.id} className="prototype-work-list">
          <div><strong>{ev.type}</strong><small className="prototype-description">{showDate(ev.at)} · {users.get(ev.actorId)??"Recorded ID "+ev.actorId}</small></div>
          <span>{ev.note||""}</span>
        </div>)}
        {!task.history.length&&<p className="prototype-empty">No task events recorded.</p>}
      </section>
    </div>
    <section className="prototype-panel"><h2>Custody and delivery postings</h2>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Date</th><th>Movement</th><th>Product</th><th>Cases</th><th>Recorded reason</th></tr></thead><tbody>
        {movements.map(m=><tr key={m.id}><td>{showDate(m.at)}</td><td>{m.type}</td><td>{m.product}</td><td>{m.quantity}</td><td>{m.reason}</td></tr>)}
      </tbody></table></div>
      {!movements.length&&<p className="prototype-empty">No stock movement evidence recorded for this order.</p>}
      <div className="prototype-page-actionbar"><RecordLink path={"/sales/orders/"+encodeURIComponent(order.id)}>View sales order</RecordLink></div>
      <Note/>
    </section>
    <ShipmentWorkflowControls order={order} task={task}/>
  </div>;
}
export function DeliveryOperationsDirectory(){
  const {orders,indexed,accounts,users,ledger,currentUser,state}=useOperationalRecords();
  const [query,setQuery]=useState("");
  const [filter,setFilter]=useState("all");
  const [from,setFrom]=useState(""),[through,setThrough]=useState("");
  const [exceptionsOnly,setExceptionsOnly]=useState(false);
  const sort=useTableSort("placedAt");
  if(!currentUser||!["Administrator","Operations","Warehouse"].includes(currentUser.role))
    return <p className="prototype-empty">Use your assigned delivery workspace. Company-wide delivery operations are restricted.</p>;
  const summary=orders.map(order=>{
    const task=indexed.get(order.id);const delivered=orderDeliveryQuantity(ledger,order.id);
    const override=state.overrides.some(x=>x.orderId===order.id);
    const issue=deliveryReconciliationIssue(order,task,delivered,override);
    const proof=Boolean(task?.signature?.signedAt&&task.signature.strokes?.some(stroke=>stroke.length>=2));
    return {order,task,delivered,proof,issue,status:deliveryStatusForOrder(state,order)};
  });
  const statuses=[...new Set(summary.map(x=>x.status))].sort();
  const rows=summary.filter(x=>filter==="all"||x.status===filter)
    .filter(x=>!exceptionsOnly||Boolean(x.issue))
    .filter(x=>(!from||x.order.placedAt.slice(0,10)>=from)&&(!through||x.order.placedAt.slice(0,10)<=through))
    .filter(x=>[x.order.number,accounts.get(x.order.accountId)?.name,x.status,users.get(x.task?.driverId??""),x.issue].join(" ").toLowerCase().includes(query.toLowerCase()))
    .sort((a,b)=>{
      const value=(x:typeof a):string|number=>{switch(sort.field){
        case "order":return x.order.number;
        case "customer":return accounts.get(x.order.accountId)?.name??"";
        case "cases":return x.order.cases;
        case "driver":return users.get(x.task?.driverId??"")??"";
        case "status":return x.status;
        case "delivered":return x.delivered;
        case "proof":return x.proof?"Recorded":"Missing";
        case "issue":return x.issue??"";
        default:return x.order.placedAt;
      }};
      return sortValue(value(a),value(b),sort.direction)||a.order.id.localeCompare(b.order.id);
    });
  const col=(key:string,label:string)=><Column key={key} keyName={key} name={label} sort={sort}/>;
  return <div><Title heading="Delivery Operations" subtitle="Traceable orders, driver assignment, proof of delivery and inventory posting exceptions from existing records."/>
    <Summary stats={[{label:"Orders in workflow",value:summary.length},{label:"Unassigned orders",value:summary.filter(x=>!x.task).length},{label:"Reconciliation exceptions",value:summary.filter(x=>Boolean(x.issue)).length},{label:"Delivered with recorded proof",value:summary.filter(x=>x.task?.status==="Delivered"&&x.proof&&x.delivered>=x.order.cases).length}]}/>
    <section className="prototype-panel"><div className="prototype-commerce-filters">
      <SearchInput value={query} onChange={setQuery} placeholder="Search orders, accounts, drivers or reconciliation issues"/>
      <label>Delivery state<select aria-label="Filter delivery operations" value={filter} onChange={e=>setFilter(e.target.value)}>
        <option value="all">All delivery states</option>{statuses.map(x=><option key={x}>{x}</option>)}</select></label>
      <DateFilter start={from} setStart={setFrom} end={through} setEnd={setThrough}/>
      <label className="prototype-driver-completed"><input type="checkbox" checked={exceptionsOnly} onChange={e=>setExceptionsOnly(e.target.checked)}/> Show exceptions only</label>
    </div><div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>
      {col("order","Order")}{col("customer","Customer")}{col("placedAt","Placed")}{col("cases","Cases")}{col("driver","Assigned driver")}{col("status","Delivery status")}{col("delivered","Posted cases")}{col("proof","Recipient proof")}{col("issue","Reconciliation")}</tr></thead><tbody>
      {rows.map(x=><tr key={x.order.id}><td><RecordLink path={"/inventory/shipments/"+encodeURIComponent(x.order.id)}>{x.order.number}</RecordLink></td>
        <td>{accounts.get(x.order.accountId)?.name??"Restricted"}</td><td>{showDate(x.order.placedAt)}</td><td>{x.order.cases}</td>
        <td>{x.task?users.get(x.task.driverId)??"Recorded driver ID":"Unassigned"}</td><td>{x.status}</td>
        <td>{x.delivered}</td><td>{x.proof?"Signature recorded":"Not verified"}</td><td>{x.issue??"No detected discrepancy"}</td></tr>)}</tbody></table></div>
      {!rows.length&&<p className="prototype-empty">No recorded delivery orders match these filters.</p>}
      <Note/>
      <p className="prototype-note">An administrator override is not a substitute for missing stock posting. Assignments, field signatures and stock movement changes remain in their authorized workflows. Legacy office Dispatch must stay available until route planning and exception parity pass acceptance testing.</p>
    </section></div>;
}
