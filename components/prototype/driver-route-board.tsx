"use client";

/**
 * E04/E05 driver stop manifest. No guessed coordinates, optimized route, ETA,
 * assignment, proof-of-delivery, stock mutation or phone location tracking.
 * Existing delivery engine remains the write authority.
 */
import {useMemo,useState} from "react";
import {MapPin,PackageCheck,Search,ShieldCheck,Truck} from "lucide-react";
import {deliveryAddressLabel,hasCompleteDeliveryAddress} from "../../lib/account-address";
import {useDelivery} from "../../lib/delivery-context";
import {orderDeliveryQuantity} from "../../lib/inventory-ledger";
import {useInventoryLedger} from "../../lib/inventory-ledger-context";
import {navigateToRoute} from "../../lib/navigation-store";
import {useWorkspace} from "../../lib/workspace-context";

export function DriverRouteBoard(){
  const {currentUser,scope}=useWorkspace();
  const {state}=useDelivery();
  const {ledger}=useInventoryLedger();
  const [query,setQuery]=useState("");
  const [showCompleted,setShowCompleted]=useState(false);
  const rows=useMemo(()=>{
    if(!currentUser||currentUser.role!=="Delivery Driver")return [];
    const byOrder=new Map(scope.orders.map(order=>[order.id,order]));
    const byAccount=new Map(scope.accounts.map(account=>[account.id,account]));
    return state.tasks.filter(task=>task.driverId===currentUser.id&&task.status!=="Cancelled")
      .map(task=>{
        const order=byOrder.get(task.orderId);
        if(!order||order.testOnly)return null;
        const account=byAccount.get(order.accountId);
        const address=account?deliveryAddressLabel(account):"";
        const hasAddress=Boolean(account&&hasCompleteDeliveryAddress(account));
        const delivered=orderDeliveryQuantity(ledger,order.id);
        const proof=Boolean(task.signature?.signedAt&&task.signature.strokes.length>0&&
          task.history.some(event=>event.type==="Delivered"&&event.actorId===task.signature?.capturedBy));
        const complete=task.status==="Delivered"&&proof&&delivered>=order.cases;
        const exception=task.status==="Delivered"&&!complete;
        return {task,order,account,address,hasAddress,delivered,proof,complete,exception};
      }).filter((x):x is NonNullable<typeof x>=>Boolean(x))
      .sort((a,b)=>{
        const rank=(status:string)=>status==="In transit"?0:status==="Loaded"?1:status==="Accepted"?2:status==="Delivered"?3:4;
        return rank(a.task.status)-rank(b.task.status)||a.task.acceptedAt.localeCompare(b.task.acceptedAt)||a.task.id.localeCompare(b.task.id);
      });
  },[currentUser,scope.orders,scope.accounts,state.tasks,ledger]);
  if(currentUser?.role!=="Delivery Driver")return <p className="prototype-empty">Driver route records are only visible to the assigned driver.</p>;
  const shown=rows.filter(x=>(showCompleted||!x.complete)&&
    [x.order.number,x.account?.name,x.address,x.task.status].join(" ").toLowerCase().includes(query.toLowerCase()));
  const pending=rows.filter(x=>!x.complete).length;
  return <div className="page page--focused-tool prototype-driver-manifest">
    <header className="prototype-heading"><h1>My Delivery Stops</h1><p>Assigned stops from recorded delivery tasks. Review destination, custody and proof before closing each order.</p></header>
    <div className="prototype-metrics"><div><small>Assigned stops</small><strong>{rows.length}</strong></div><div><small>Still needing closeout</small><strong>{pending}</strong></div><div><small>Evidence exceptions</small><strong>{rows.filter(x=>x.exception).length}</strong></div></div>
    <section className="prototype-panel"><p className="prototype-note"><ShieldCheck size={15}/> This is a prioritized stop manifest, not a calculated driving route. No GPS monitoring, travel-time estimate or automatic stop reordering occurs. Driver assignments and recipient signatures remain in the Deliveries workspace.</p>
      <div className="prototype-commerce-filters">
        <label className="prototype-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search my assigned stops" aria-label="Search my delivery stops"/></label>
        <label className="prototype-driver-completed"><input type="checkbox" checked={showCompleted} onChange={e=>setShowCompleted(e.target.checked)}/> Include completed stops</label>
      </div>
      <div className="prototype-driver-stops">{shown.map((x,index)=><article className="prototype-driver-stop" key={x.task.id}>
        <div className="prototype-driver-stop__number">{index+1}</div>
        <div><strong>{x.account?.name??"Account access restricted"}</strong><small>{x.order.number} · {x.task.status}</small>
          <p><MapPin size={14}/> {x.address||"Delivery address not verified. Contact Operations before travel."}</p>
          <p><PackageCheck size={14}/> {x.delivered}/{x.order.cases} cases posted · {x.proof?"Recipient signature recorded":"Signature not yet verified"}</p>
          {x.exception&&<p role="alert">Delivery closeout exception: posted inventory and recipient proof do not match the order.</p>}
          <div className="prototype-driver-stop__actions">
            {x.hasAddress&&<a href={"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(x.address)} target="_blank" rel="noopener noreferrer">Open destination in Maps</a>}
            <button type="button" onClick={()=>navigateToRoute("/driver/deliveries")}><Truck size={15}/> Open delivery controls</button>
          </div>
        </div>
      </article>)}</div>
      {!shown.length&&<p className="prototype-empty">No assigned delivery stops match your filters. New assignments appear after Operations records them.</p>}
      <p className="prototype-note">Stops are prioritized by recorded delivery state and acceptance timestamp. Their numbered display is not a dispatch sequence and does not authorize changing routes or delivery commitments.</p>
    </section>
  </div>;
}
