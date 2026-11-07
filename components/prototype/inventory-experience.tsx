"use client";

/** Read-only inventory directories built on confirmed lot and custody ledgers. */
import {useState} from "react";
import {ArrowDownUp,ArrowLeft,ExternalLink,Search} from "lucide-react";
import {useWorkspace} from "../../lib/workspace-context";
import {arizonaDateKey} from "../../lib/date-time";
import {reviewInventoryLot} from "../../lib/stock-health-review";
import {useInventoryLedger} from "../../lib/inventory-ledger-context";
import {
  lotBalances,nodeLotBalance,reservedQuantity,warehouseAvailable,warehouseNodeId,
  type InventoryMovement,type InventoryCount,
} from "../../lib/inventory-ledger";
import {navigateToRoute} from "../../lib/navigation-store";
import {downloadCsv} from "../../lib/browser-export";
import {inventoryExportColumns,inventoryExportRows} from "../../lib/saturday-scoped-workflows";

type Direction="asc"|"desc";
const fmt=(num:number)=>new Intl.NumberFormat("en-US",{maximumFractionDigits:2}).format(num);
const date=(v?:string)=>v?.slice(0,10)||"Not recorded";
function Title({name,detail,back}:{name:string;detail:string;back?:string}){
  return <header className="prototype-heading">{back&&<button type="button" className="prototype-back" onClick={()=>navigateToRoute(back)}><ArrowLeft size={15}/> Back to inventory</button>}<h1>{name}</h1><p>{detail}</p></header>;
}
function Go({path,children}:{path:string;children:React.ReactNode}){
  return <button type="button" className="prototype-link" onClick={()=>navigateToRoute(path)}>{children}<ExternalLink size={13}/></button>;
}
function Header({field,label,active,dir,onSort}:{field:string;label:string;active:boolean;dir:Direction;onSort:(field:string)=>void}){
  return <th aria-sort={active?(dir==="asc"?"ascending":"descending"):"none"}><button type="button" onClick={()=>onSort(field)}>{label}<ArrowDownUp size={13}/></button></th>;
}
function useSort(initial:string){
  const [key,setKey]=useState(initial),[dir,setDir]=useState<Direction>("asc");
  const pick=(field:string)=>{if(field===key)setDir(d=>d==="asc"?"desc":"asc");else{setKey(field);setDir("asc");}};
  return {key,dir,pick};
}
const cmp=(a:string|number,b:string|number,dir:Direction)=>{
  const n=typeof a==="number"&&typeof b==="number"?a-b:String(a).localeCompare(String(b),undefined,{numeric:true});
  return n*(dir==="asc"?1:-1);
};
function Facts({items}:{items:{label:string;value:React.ReactNode}[]}){
  return <dl className="prototype-facts">{items.map(item=><div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>;
}
function LegacyInventoryControls(){
  return <div className="prototype-legacy-actions"><button type="button" onClick={()=>navigateToRoute("/inventory/workflow")}>Existing inventory operations</button><small>Temporary access to receipts, stock imports, and quality-hold controls. The new inventory directory does not write stock.</small></div>;
}
function useInventoryRows(){
  const {scope}=useWorkspace();const {ledger}=useInventoryLedger();
  return scope.inventory.map(lot=>{
    const warehouseOnHand=nodeLotBalance(ledger,warehouseNodeId,lot.id);
    const reserved=reservedQuantity(ledger,lot.id);
    return {
      lot,warehouseOnHand,reserved,
      sellable:lot.status==="Quality hold"?0:warehouseAvailable(ledger,lot.id),
      recordedLocations:lotBalances(ledger,lot.id).filter(x=>x.node.type!=="External").map(x=>x.node.name),
      health:reviewInventoryLot({bestBy:lot.bestBy,status:lot.status,warehouseOnHand,reserved},arizonaDateKey()),
    };
  });
}
export function InventoryDirectory(){
  const {scope}=useWorkspace();const records=useInventoryRows();
  const [query,setQuery]=useState(""),[status,setStatus]=useState("all"),[product,setProduct]=useState("all"),[risk,setRisk]=useState("all");
  const [bestByFrom,setBestByFrom]=useState(""),[bestByThrough,setBestByThrough]=useState("");
  const sort=useSort("lotCode");
  const rows=records.filter(r=>status==="all"||r.lot.status===status)
    .filter(r=>product==="all"||r.lot.product===product)
    .filter(r=>risk==="all"||risk==="review"&&r.health.reviewRequired||risk==="past"&&r.health.issues.includes("Past best-by")||risk==="near"&&r.health.issues.includes("Best-by within 30 days")||risk==="custody"&&r.health.issues.some(i=>["Negative custody","Over-reserved"].includes(i)))
    .filter(r=>(!bestByFrom||r.lot.bestBy>=bestByFrom)&&(!bestByThrough||r.lot.bestBy<=bestByThrough))
    .filter(r=>[r.lot.product,r.lot.lotCode,r.lot.location,r.lot.status,r.lot.bestBy,...r.recordedLocations].join(" ").toLowerCase().includes(query.toLowerCase()))
    .sort((a,b)=>{
      const value=(r:typeof a):string|number=>{
        switch(sort.key){
          case "product":return r.lot.product;
          case "status":return r.lot.status;
          case "location":return r.lot.location;
          case "bestBy":return r.lot.bestBy;
          case "onHand":return r.warehouseOnHand;
          case "reserved":return r.reserved;
          case "sellable":return r.sellable;
          case "risk":return r.health.summary;
          default:return r.lot.lotCode;
        }
      };
      return cmp(value(a),value(b),sort.dir)||a.lot.id.localeCompare(b.lot.id);
    });
  const hdr=(key:string,label:string)=><Header key={key} field={key} label={label} active={sort.key===key} dir={sort.dir} onSort={sort.pick}/>;
  return <div><Title name="Inventory" detail="Lot-controlled stock availability, quality holds and warehouse balances from recorded custody movements."/>
    <div className="prototype-metrics">
      <div><small>Visible lots</small><strong>{rows.length}</strong></div>
      <div><small>Warehouse cases on hand</small><strong>{fmt(rows.reduce((n,r)=>n+r.warehouseOnHand,0))}</strong></div>
      <div><small>Available sellable cases</small><strong>{fmt(rows.reduce((n,r)=>n+r.sellable,0))}</strong></div>
    </div>
    <section className="prototype-panel">
      <div className="prototype-commerce-filters">
        <label className="prototype-search"><Search size={16}/><input aria-label="Search lots" value={query} onChange={e=>setQuery(e.target.value)} placeholder="SKU, lot, warehouse, location"/></label>
        <label>Product<select aria-label="Filter inventory by product" value={product} onChange={e=>setProduct(e.target.value)}><option value="all">All products</option>{[...new Set(scope.inventory.map(l=>l.product))].sort().map(p=><option key={p}>{p}</option>)}</select></label>
        <label>Availability<select aria-label="Filter inventory status" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option>{[...new Set(scope.inventory.map(l=>l.status))].sort().map(s=><option key={s}>{s}</option>)}</select></label>
        <label>Risk filter<select aria-label="Filter inventory exceptions" value={risk} onChange={e=>setRisk(e.target.value)}><option value="all">All lots</option><option value="review">Requires review</option><option value="past">Past best-by</option><option value="near">Within 30 days</option><option value="custody">Custody variance</option></select></label>
        <label>Best-by from<input type="date" aria-label="Best-by from" value={bestByFrom} onChange={e=>setBestByFrom(e.target.value)}/></label>
        <label>Through<input type="date" aria-label="Best-by through" value={bestByThrough} onChange={e=>setBestByThrough(e.target.value)}/></label>
        <button type="button" disabled={!rows.length} onClick={()=>downloadCsv("momentum-visible-inventory-lots.csv",inventoryExportRows(rows),inventoryExportColumns)}>Download filtered lot register CSV</button>
      </div>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>
        {([["lotCode","Lot"],["product","Product"],["location","Storage label"],["bestBy","Best by"],["onHand","Warehouse on hand"],["reserved","Reserved"],["sellable","Available"],["status","Status"],["risk","Stock review"]] as const).map(([key,label])=>hdr(key,label))}
      </tr></thead><tbody>{rows.map(({lot,warehouseOnHand,reserved,sellable,health})=><tr key={lot.id}>
        <td><Go path={"/inventory/lots/"+encodeURIComponent(lot.id)}>{lot.lotCode}</Go></td><td>{lot.product}</td><td>{lot.location}</td>
        <td>{date(lot.bestBy)}</td><td>{fmt(warehouseOnHand)}</td><td>{fmt(reserved)}</td><td>{fmt(sellable)}</td>
        <td><span className="prototype-status">{lot.status}</span></td><td>{health.summary}</td>
      </tr>)}</tbody></table></div>
      {!rows.length&&<div className="prototype-empty">No inventory lots match your filters.</div>}
      <p className="prototype-note">Warehouse stock and reservations are sourced from the custody ledger. Customer-delivered or disposed cases do not count as sellable warehouse stock. All edits remain in the operational workflow until migrated and tested.</p>
      <LegacyInventoryControls/>
    </section>
  </div>;
}
export function InventoryLotDetail({id}:{id:string}){
  const {scope,data}=useWorkspace();const {ledger}=useInventoryLedger();
  const lot=scope.inventory.find(item=>item.id===id);
  if(!lot)return <div className="prototype-empty">Lot not found or access restricted.</div>;
  const balances=lotBalances(ledger,lot.id);
  const movements=ledger.movements.filter(m=>m.lotId===lot.id).sort((a,b)=>b.at.localeCompare(a.at));
  const reservations=ledger.reservations.filter(r=>r.lotId===lot.id);
  const nodes=new Map(ledger.nodes.map(n=>[n.id,n]));
  const person=new Map(data.users.map(u=>[u.id,u.name]));
  return <div><Title name={"Lot "+lot.lotCode} detail={lot.product+" · "+lot.status} back="/inventory"/>
    <div className="prototype-metrics">
      <div><small>Warehouse on hand</small><strong>{fmt(nodeLotBalance(ledger,warehouseNodeId,lot.id))}</strong></div>
      <div><small>Currently reserved</small><strong>{fmt(reservedQuantity(ledger,lot.id))}</strong></div>
      <div><small>Sellable available</small><strong>{fmt(lot.status==="Quality hold"?0:warehouseAvailable(ledger,lot.id))}</strong></div>
    </div>
    <div className="prototype-columns">
      <section className="prototype-panel"><h2>Lot master</h2><Facts items={[
        {label:"SKU / product",value:lot.product},{label:"Lot code",value:lot.lotCode},
        {label:"Received",value:date(lot.receivedAt)},{label:"Best by",value:date(lot.bestBy)},
        {label:"Storage label",value:lot.location},{label:"Status",value:lot.status},
        {label:"Quality hold",value:lot.holdReason??"No reason recorded"},
      ]}/></section>
      <section className="prototype-panel"><h2>Quantity by custody location</h2>
        <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Node</th><th>Type</th><th>Recorded cases</th></tr></thead><tbody>{balances.map(({node,balance})=>
          <tr key={node.id}><td>{node.name}</td><td>{node.type}</td><td>{fmt(balance)}</td></tr>)}</tbody></table></div>
        {!balances.length&&<div className="prototype-empty">No custody balance movements recorded.</div>}
        <p className="prototype-note">Customer nodes and disposal nodes are included for traceability, not counted as warehouse availability.</p>
      </section>
    </div>
    <section className="prototype-panel"><h2>Movement history</h2><div className="prototype-table-scroll">
      <table className="prototype-table"><thead><tr><th>Date</th><th>Type</th><th>Cases</th><th>From</th><th>To</th><th>Related order</th><th>Recorded by</th></tr></thead><tbody>
        {movements.map(m=><tr key={m.id}><td>{date(m.at)}</td><td>{m.type}</td><td>{fmt(m.quantity)}</td><td>{nodes.get(m.fromNodeId??"")?.name??"Not recorded"}</td><td>{nodes.get(m.toNodeId??"")?.name??"Not recorded"}</td>
          <td>{m.relatedOrderId&&scope.orders.some(o=>o.id===m.relatedOrderId)?<Go path={"/sales/orders/"+encodeURIComponent(m.relatedOrderId)}>{scope.orders.find(o=>o.id===m.relatedOrderId)?.number??"Order"}</Go>:"Not linked"}</td>
          <td>{person.get(m.actorId)??(m.actorId==="system"?"Recorded system entry":"Unverified")}</td></tr>)}
      </tbody></table></div>{!movements.length&&<div className="prototype-empty">No lot movement records.</div>}
      <h3>Reservation records</h3><div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Order</th><th>Cases</th><th>Status</th><th>Created</th></tr></thead><tbody>
        {reservations.map(r=><tr key={r.id}><td>{scope.orders.find(o=>o.id===r.orderId)?.number??"Unlinked or restricted"}</td><td>{fmt(r.quantity)}</td><td>{r.status}</td><td>{date(r.createdAt)}</td></tr>)}
      </tbody></table></div>
    </section>
  </div>;
}
export function InventoryLedgerDirectory(){
  const {scope,data}=useWorkspace();const {ledger}=useInventoryLedger();
  const [query,setQuery]=useState(""),[type,setType]=useState("all"),[from,setFrom]=useState(""),[to,setTo]=useState("");
  const sort=useSort("at");
  const allowedLots=new Set(scope.inventory.map(l=>l.id));
  const names=new Map(scope.inventory.map(l=>[l.id,l.lotCode]));
  const nodes=new Map(ledger.nodes.map(n=>[n.id,n.name]));
  const people=new Map(data.users.map(u=>[u.id,u.name]));
  const rows=ledger.movements.filter(m=>allowedLots.has(m.lotId)).filter(m=>type==="all"||m.type===type)
    .filter(m=>(!from||m.at.slice(0,10)>=from)&&(!to||m.at.slice(0,10)<=to))
    .filter(m=>[m.id,m.type,m.product,names.get(m.lotId),nodes.get(m.fromNodeId??""),nodes.get(m.toNodeId??""),people.get(m.actorId)].join(" ").toLowerCase().includes(query.toLowerCase()))
    .sort((a,b)=>{
      const value=(m:InventoryMovement):string|number=>{
        switch(sort.key){case "lot":return names.get(m.lotId)??"";case "product":return m.product;case "type":return m.type;case "quantity":return m.quantity;case "from":return nodes.get(m.fromNodeId??"")??"";case "to":return nodes.get(m.toNodeId??"")??"";case "actor":return people.get(m.actorId)??m.actorId;default:return m.at;}
      };
      return cmp(value(a),value(b),sort.dir)||a.id.localeCompare(b.id);
    });
  const hdr=(key:string,label:string)=><Header key={key} field={key} label={label} active={sort.key===key} dir={sort.dir} onSort={sort.pick}/>;
  return <div><Title name="Inventory Ledger" detail="Source-linked inventory movement history, custody transfers, receipts, deliveries and adjustments."/>
    <section className="prototype-panel"><div className="prototype-commerce-filters">
      <label className="prototype-search"><Search size={16}/><input aria-label="Search inventory movements" placeholder="Lot, product, node, actor" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <label>Movement type<select aria-label="Filter inventory movement type" value={type} onChange={e=>setType(e.target.value)}><option value="all">All recorded types</option>{[...new Set(ledger.movements.filter(m=>allowedLots.has(m.lotId)).map(m=>m.type))].sort().map(t=><option key={t}>{t}</option>)}</select></label>
      <label>From<input type="date" aria-label="Movement from date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
      <label>Through<input type="date" aria-label="Movement through date" value={to} onChange={e=>setTo(e.target.value)}/></label>
    </div>
    <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>
      {([["at","Date"],["lot","Lot"],["product","Product"],["type","Movement"],["quantity","Cases"],["from","From"],["to","To"],["actor","Actor"]] as const).map(([key,label])=>hdr(key,label))}
    </tr></thead><tbody>{rows.map(m=><tr key={m.id}><td>{date(m.at)}</td><td><Go path={"/inventory/lots/"+encodeURIComponent(m.lotId)}>{names.get(m.lotId)??"Restricted"}</Go></td><td>{m.product}</td><td>{m.type}</td><td>{fmt(m.quantity)}</td><td>{nodes.get(m.fromNodeId??"")??"Not recorded"}</td><td>{nodes.get(m.toNodeId??"")??"Not recorded"}</td><td>{people.get(m.actorId)??"Recorded system entry"}</td></tr>)}</tbody></table></div>
    {!rows.length&&<div className="prototype-empty">No movement records match these filters.</div>}
    <p className="prototype-note">Movement dates and quantities are taken from recorded ledger events. A movement by itself is not proof of customer payment or consumer sell-through.</p>
    </section>
  </div>;
}
export function InventoryAdjustmentDirectory(){
  const {scope,data}=useWorkspace();const {ledger}=useInventoryLedger();
  const [query,setQuery]=useState(""),[status,setStatus]=useState("all");
  const sort=useSort("countedAt");
  const allowed=new Set(scope.inventory.map(l=>l.id));
  const lots=new Map(scope.inventory.map(l=>[l.id,l]));
  const people=new Map(data.users.map(u=>[u.id,u.name]));
  const rows=ledger.counts.filter(c=>allowed.has(c.lotId))
    .filter(c=>status==="all"||c.status===status)
    .filter(c=>[c.id,lots.get(c.lotId)?.lotCode,lots.get(c.lotId)?.product,c.reason,people.get(c.countedBy)].join(" ").toLowerCase().includes(query.toLowerCase()))
    .sort((a,b)=>{
      const value=(c:InventoryCount):string|number=>{switch(sort.key){case "lot":return lots.get(c.lotId)?.lotCode??"";case "variance":return c.variance;case "status":return c.status;case "countedQty":return c.countedQty;default:return c.countedAt;}};
      return cmp(value(a),value(b),sort.dir)||a.id.localeCompare(b.id);
    });
  const hdr=(key:string,label:string)=><Header key={key} field={key} label={label} active={sort.key===key} dir={sort.dir} onSort={sort.pick}/>;
  return <div><Title name="Inventory Adjustments" detail="Review counted stock, variance, approvals and reconciliation records."/>
    <section className="prototype-panel"><div className="prototype-commerce-filters">
      <label className="prototype-search"><Search size={16}/><input aria-label="Search inventory counts" placeholder="Lot, product, counter, adjustment reason" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <label>Status<select aria-label="Count reconciliation status" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option><option>Open</option><option>Reconciled</option></select></label>
    </div>
    <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>
      {([["lot","Lot"],["countedAt","Count date"],["countedQty","Counted"],["variance","Variance"],["status","Status"]] as const).map(([key,label])=>hdr(key,label))}
      <th>Counter</th></tr></thead><tbody>{rows.map(c=><tr key={c.id}><td><Go path={"/inventory/lots/"+encodeURIComponent(c.lotId)}>{lots.get(c.lotId)?.lotCode??"Unknown"}</Go></td><td>{date(c.countedAt)}</td><td>{fmt(c.countedQty)}</td><td>{fmt(c.variance)}</td><td>{c.status}</td><td>{people.get(c.countedBy)??"Not verified"}</td></tr>)}</tbody></table></div>
    {!rows.length&&<div className="prototype-empty">No recorded inventory counts match your filters.</div>}
    <p className="prototype-note">Only authorized reconciliation may post an inventory adjustment movement. No quantity changes can be made from this preview.</p>
    <LegacyInventoryControls/>
    </section>
  </div>;
}
