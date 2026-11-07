"use client";

/**
 * E03 physical-location custody visibility.
 * Existing inventory ledger is the only source; this view does not count
 * purchasing-demo receipts as stock or permit unapproved quantity changes.
 */
import {useMemo,useState} from "react";
import {ArrowLeft,ArrowUpDown,Search} from "lucide-react";
import {nodeLotBalance,reservedQuantity,warehouseNodeId} from "../../lib/inventory-ledger";
import {useInventoryLedger} from "../../lib/inventory-ledger-context";
import {navigateToRoute} from "../../lib/navigation-store";
import {useWorkspace} from "../../lib/workspace-context";
import {arizonaDateKey} from "../../lib/date-time";
import {reviewInventoryLot} from "../../lib/stock-health-review";
import type {InventoryNode} from "../../lib/inventory-ledger";
const physicalTypes=new Set<InventoryNode["type"]>(["Warehouse","Bin","Quality hold"]);
const fmt=(n:number)=>new Intl.NumberFormat("en-US",{maximumFractionDigits:2}).format(n);
const sortText=(a:string|number,b:string|number,asc:boolean)=>{
  const n=typeof a==="number"&&typeof b==="number"?a-b:String(a).localeCompare(String(b),undefined,{numeric:true});
  return n*(asc?1:-1);
};
type LocationRow={node:InventoryNode;lotCount:number;cases:number;unreconciledCounts:number};
export function InventoryLocationsDirectory({id}:{id?:string}){
  const {currentUser,scope,data}=useWorkspace();
  const {ledger}=useInventoryLedger();
  const [query,setQuery]=useState("");
  const [type,setType]=useState("all");
  const [sort,setSort]=useState<"name"|"type"|"lotCount"|"cases"|"unreconciledCounts">("name");
  const [asc,setAsc]=useState(true);
  const permitted=Boolean(currentUser&&["Administrator","Operations","Warehouse"].includes(currentUser.role));
  const allowedLotIds=useMemo(()=>new Set(scope.inventory.map(l=>l.id)),[scope.inventory]);
  const rows=useMemo<LocationRow[]>(()=>ledger.nodes.filter(node=>physicalTypes.has(node.type)).map(node=>{
    const balances=scope.inventory.map(lot=>nodeLotBalance(ledger,node.id,lot.id));
    return {
      node,
      lotCount:balances.filter(quantity=>quantity!==0).length,
      cases:balances.reduce((sum,q)=>sum+q,0),
      unreconciledCounts:ledger.counts.filter(c=>c.nodeId===node.id&&c.status==="Open"&&allowedLotIds.has(c.lotId)&&Math.abs(c.variance)>0.005).length,
    };
  }),[ledger,scope.inventory,allowedLotIds]);
  if(!permitted)return <p className="prototype-empty">Company warehouse locations are restricted to authorized warehouse and operations roles.</p>;
  const selected=id?rows.find(r=>r.node.id===id):undefined;
  if(id&&!selected)return <p className="prototype-empty">That warehouse location was not found or is restricted.</p>;
  const clickSort=(key:typeof sort)=>{if(key===sort)setAsc(v=>!v);else{setSort(key);setAsc(true);}};
  const heading=(key:typeof sort,label:string)=><th aria-sort={sort===key?(asc?"ascending":"descending"):"none"}><button type="button" onClick={()=>clickSort(key)}>{label}<ArrowUpDown size={13}/></button></th>;
  const filtered=rows.filter(r=>(type==="all"||r.node.type===type)&&[r.node.id,r.node.name,r.node.type].join(" ").toLowerCase().includes(query.toLowerCase())).sort((a,b)=>sortText(sort==="name"?a.node.name:sort==="type"?a.node.type:a[sort],sort==="name"?b.node.name:sort==="type"?b.node.type:b[sort],asc)||a.node.id.localeCompare(b.node.id));
  const balances=selected?scope.inventory.map(lot=>({lot,cases:nodeLotBalance(ledger,selected.node.id,lot.id)})).filter(row=>row.cases!==0):[];
  const selectedMovements=selected?ledger.movements.filter(m=>allowedLotIds.has(m.lotId)&&(m.fromNodeId===selected.node.id||m.toNodeId===selected.node.id)).sort((a,b)=>b.at.localeCompare(a.at)):[];
  const counts=selected?ledger.counts.filter(c=>c.nodeId===selected.node.id&&allowedLotIds.has(c.lotId)).sort((a,b)=>b.countedAt.localeCompare(a.countedAt)):[];
  const people=new Map(data.users.map(user=>[user.id,user.name]));
  const lotNames=new Map(scope.inventory.map(lot=>[lot.id,lot.lotCode]));
  return <div>
    <header className="prototype-heading">
      {selected&&<button type="button" className="prototype-back" onClick={()=>navigateToRoute("/inventory/locations")}><ArrowLeft size={15}/> All warehouse locations</button>}
      <h1>{selected?selected.node.name:"Warehouse Locations"}</h1>
      <p>Source-linked warehouse, bin and quality-hold custody. Driver, customer and disposed stock are not shown as available warehouse stock.</p>
    </header>
    {selected?<>
      <div className="prototype-metrics">
        <div><small>Location type</small><strong>{selected.node.type}</strong></div>
        <div><small>Lot records with quantity</small><strong>{selected.lotCount}</strong></div>
        <div><small>Recorded cases in custody</small><strong>{fmt(selected.cases)}</strong></div>
        <div><small>Unreconciled variance counts</small><strong>{selected.unreconciledCounts}</strong></div>
      </div>
      <section className="prototype-panel"><h2>Physical lot custody</h2>
        <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Lot / batch</th><th>Product</th><th>Cases here</th><th>Best by</th><th>Quality status</th><th>Review exception</th></tr></thead><tbody>
        {balances.map(({lot,cases})=>{
          const risk=reviewInventoryLot({bestBy:lot.bestBy,status:lot.status,warehouseOnHand:cases,reserved:selected.node.id===warehouseNodeId?reservedQuantity(ledger,lot.id):0},arizonaDateKey());
          return <tr key={lot.id}><td><button type="button" className="prototype-link" onClick={()=>navigateToRoute("/inventory/lots/"+encodeURIComponent(lot.id))}>{lot.lotCode}</button></td><td>{lot.product}</td><td>{fmt(cases)}</td><td>{lot.bestBy||"Unknown"}</td><td>{lot.status}</td><td>{risk.summary}</td></tr>;
        })}</tbody></table></div>
        {!balances.length&&<p className="prototype-empty">No recorded custody quantity at this location.</p>}
        <p className="prototype-note">Location balances come exclusively from existing stock movements. Reservations are recorded separately against the warehouse inventory system, not physically at every bin. An expired lot is flagged for review, not automatically written off.</p>
      </section>
      <section className="prototype-panel"><h2>Receiving, transfers and adjustments</h2>
        <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Recorded time</th><th>Lot</th><th>Type</th><th>Cases</th><th>Direction</th><th>Actor</th><th>Source</th></tr></thead><tbody>
          {selectedMovements.map(m=><tr key={m.id}><td>{m.at}</td><td>{lotNames.get(m.lotId)??"Restricted"}</td><td>{m.type}</td><td>{fmt(m.quantity)}</td><td>{m.toNodeId===selected.node.id?"In":"Out"}</td><td>{people.get(m.actorId)??m.actorId}</td><td>{m.reason}</td></tr>)}
        </tbody></table></div>
        {!selectedMovements.length&&<p className="prototype-empty">No movements recorded at this location.</p>}
      </section>
      <section className="prototype-panel"><h2>Count and discrepancy records</h2>
        <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Counted at</th><th>Lot</th><th>Physical cases</th><th>Recorded cases</th><th>Variance</th><th>Status</th></tr></thead><tbody>
          {counts.map(c=><tr key={c.id}><td>{c.countedAt}</td><td>{lotNames.get(c.lotId)??"Restricted"}</td><td>{fmt(c.countedQty)}</td><td>{fmt(c.systemQty)}</td><td>{fmt(c.variance)}</td><td>{c.status}</td></tr>)}
        </tbody></table></div>
        {!counts.length&&<p className="prototype-empty">No counts recorded for this location.</p>}
      </section>
    </>:<>
      <div className="prototype-metrics"><div><small>Physical locations</small><strong>{rows.length}</strong></div><div><small>Cases in custody</small><strong>{fmt(rows.reduce((sum,r)=>sum+r.cases,0))}</strong></div><div><small>Unreconciled count variances</small><strong>{rows.reduce((sum,r)=>sum+r.unreconciledCounts,0)}</strong></div></div>
      <section className="prototype-panel"><div className="prototype-commerce-filters">
        <label className="prototype-search"><Search size={16}/><input aria-label="Search physical locations" value={query} placeholder="Search warehouse, bin or hold location" onChange={e=>setQuery(e.target.value)}/></label>
        <label>Location type<select aria-label="Location type" value={type} onChange={e=>setType(e.target.value)}><option value="all">All</option>{[...physicalTypes].map(value=><option key={value}>{value}</option>)}</select></label>
      </div>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>
        {heading("name","Physical location")}{heading("type","Type")}{heading("lotCount","Lots")}{heading("cases","Custody cases")}{heading("unreconciledCounts","Open variance counts")}
      </tr></thead><tbody>{filtered.map(r=><tr key={r.node.id}>
        <td><button type="button" className="prototype-link" onClick={()=>navigateToRoute("/inventory/locations/"+encodeURIComponent(r.node.id))}>{r.node.name}</button></td><td>{r.node.type}</td><td>{r.lotCount}</td><td>{fmt(r.cases)}</td><td>{r.unreconciledCounts}</td>
      </tr>)}</tbody></table></div>
      {!filtered.length&&<p className="prototype-empty">No physical locations match the filters.</p>}
      <p className="prototype-note">Read-only view of existing custody locations. This does not provision warehouses, reclassify inventory, release holds or post receipts from the purchasing demo.</p>
      </section>
    </>}
  </div>;
}
