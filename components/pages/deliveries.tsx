"use client";

import { CheckCircle2, MapPin, PackageCheck, PackageOpen, Phone, Route, Truck, UserCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { deliveryStatusForOrder, processedForDelivery } from "../../lib/delivery-engine";
import { useDelivery } from "../../lib/delivery-context";
import { useSyncStatus } from "../../lib/persistence";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, PageHeader, Section, StatusPill } from "../ui";

const tone = (status: string) => status === "Delivered" ? "success" as const : status === "In transit" || status === "Loaded" ? "info" as const : status.includes("ready") || status === "Accepted" ? "warning" as const : "neutral" as const;

export function DeliveriesPage() {
  const { data, currentUser, navigate } = useWorkspace();
  const { state, taskForOrder, claimDelivery, assignDelivery, cancelDelivery, markLoaded, startDelivery, markDelivered } = useDelivery();
  const sync = useSyncStatus();
  const [driverByOrder, setDriverByOrder] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const isDriver = currentUser?.role === "Delivery Driver";
  const canManage = Boolean(currentUser && ["Administrator", "Operations"].includes(currentUser.role));
  const drivers = data.users.filter((user) => user.role === "Delivery Driver");

  const eligible = useMemo(() => data.orders.filter(processedForDelivery).sort((a, b) => b.placedAt.localeCompare(a.placedAt)), [data.orders]);
  const visible = eligible.filter((order) => {
    const task = taskForOrder(order.id);
    if (!isDriver) return true;
    return !task || task.driverId === currentUser?.id;
  });
  const ready = visible.filter((order) => !taskForOrder(order.id) || taskForOrder(order.id)?.status === "Accepted");
  const active = visible.filter((order) => ["Loaded", "In transit"].includes(taskForOrder(order.id)?.status ?? ""));
  const complete = visible.filter((order) => taskForOrder(order.id)?.status === "Delivered");

  const run = (result: { ok: boolean; message?: string }, success: string) => {
    setNotice(result.ok ? success : result.message ?? "The delivery update was not accepted.");
  };

  const syncText = sync.lastError ? `Sync issue: ${sync.lastError}` : sync.pending || sync.flushing ? `Saving ${sync.pending || 1} change${sync.pending === 1 ? "" : "s"}…` : sync.mode === "firestore" ? "Cloud synced" : "Local demo";

  const card = (orderId: string) => {
    const order = data.orders.find((item) => item.id === orderId)!;
    const task = taskForOrder(order.id);
    const account = data.accounts.find((item) => item.id === order.accountId);
    const driver = task ? data.users.find((user) => user.id === task.driverId) : undefined;
    const status = deliveryStatusForOrder(state, order);
    const address = account ? [account.streetAddress, account.city || account.location, account.state, account.postalCode].filter(Boolean).join(", ") : "Location unavailable";
    const ownTask = isDriver && task?.driverId === currentUser?.id;
    const selectedDriver = driverByOrder[order.id] ?? drivers[0]?.id ?? "";
    return <article key={order.id} className="company-request-list__item" style={{display:"grid",gap:12}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start",flexWrap:"wrap"}}>
        <div>
          <small>{order.number} · {order.product ?? "Golden Eagle"}</small>
          <strong style={{display:"block",fontSize:"1.05rem"}}>{account?.locationName ?? account?.name ?? "Unknown customer"}</strong>
          <p style={{margin:"4px 0"}}><MapPin size={14} style={{verticalAlign:"-2px"}}/> {address}</p>
          {account?.phone && <p style={{margin:"4px 0"}}><Phone size={14} style={{verticalAlign:"-2px"}}/> {account.phone}</p>}
        </div>
        <StatusPill tone={tone(status)}>{status}</StatusPill>
      </div>
      <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
        <span><b>{order.cases}</b> cases</span>
        <span><b>{order.status}</b> order status</span>
        <span><b>{driver?.name ?? "Unassigned"}</b> driver</span>
      </div>
      {!task && isDriver && <div><Button size="sm" icon={<UserCheck size={15}/>} onClick={() => run(claimDelivery(order.id), `${order.number} accepted.`)}>Accept delivery</Button></div>}
      {!task && canManage && <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <select value={selectedDriver} onChange={(event)=>setDriverByOrder((current)=>({...current,[order.id]:event.target.value}))}>
          {drivers.map((item)=><option value={item.id} key={item.id}>{item.name}</option>)}
        </select>
        <Button size="sm" disabled={!selectedDriver} onClick={() => run(assignDelivery(order.id, selectedDriver), `${order.number} assigned.`)}>Assign driver</Button>
      </div>}
      {task?.status === "Accepted" && (ownTask || canManage) && <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        {order.status === "Allocated" ? <Button size="sm" icon={<PackageOpen size={15}/>} onClick={() => run(markLoaded(order.id), `${order.number} loaded into driver custody.`)}>Mark loaded</Button> : <span>Waiting for warehouse reservation / allocation before loading.</span>}
        {canManage && <Button size="sm" variant="ghost" onClick={() => { const reason = window.prompt("Why is this delivery being cancelled or reassigned?")?.trim() ?? ""; if (reason) run(cancelDelivery(order.id, reason), `${order.number} returned to the delivery queue.`); }}>Cancel assignment</Button>}
      </div>}
      {task?.status === "Loaded" && (ownTask || canManage) && <Button size="sm" icon={<Truck size={15}/>} onClick={() => run(startDelivery(order.id), `${order.number} is now in transit.`)}>Start delivery</Button>}
      {task?.status === "In transit" && (ownTask || canManage) && <Button size="sm" icon={<CheckCircle2 size={15}/>} onClick={() => { if (window.confirm(`Confirm ${order.number} was delivered to ${account?.locationName ?? account?.name ?? "the customer"}?`)) run(markDelivered(order.id), `${order.number} delivered and inventory posted to the customer.`); }}>Mark delivered</Button>}
      {task?.history?.length ? <details><summary>Delivery history ({task.history.length})</summary><div style={{display:"grid",gap:6,marginTop:8}}>{task.history.map((event)=><small key={event.id}>{new Date(event.at).toLocaleString()} · {event.type}{event.note?` · ${event.note}`:""}</small>)}</div></details> : null}
    </article>;
  };

  return <div className="page page--deliveries">
    <PageHeader title={isDriver ? "My deliveries" : "Delivery operations"} actions={<StatusPill tone={sync.lastError ? "danger" : sync.pending || sync.flushing ? "warning" : "success"}>{syncText}</StatusPill>}/>
    {notice && <p className="form-error" role="status">{notice}</p>}
    <div className="company-rule-facts">
      <div><span>Ready / accepted</span><strong>{ready.length}</strong><small>Approved or packed orders</small></div>
      <div><span>Loaded / in transit</span><strong>{active.length}</strong><small>Active driver custody</small></div>
      <div><span>Delivered</span><strong>{complete.length}</strong><small>Delivery records in this workspace</small></div>
      <div><span>Drivers</span><strong>{drivers.length}</strong><small>{drivers.length ? "Provisioned delivery users" : "No delivery drivers provisioned yet"}</small></div>
    </div>
    <Section title="Delivery queue" description="Only processed orders appear here. A driver accepts or is assigned an order, loads reserved inventory into driver custody, starts the route, then posts delivery to the customer location.">
      <div className="company-request-list">{visible.filter((order)=>taskForOrder(order.id)?.status!=="Delivered").map((order)=>card(order.id))}{visible.filter((order)=>taskForOrder(order.id)?.status!=="Delivered").length===0&&<div className="review-empty"><Route size={23}/><p>No active deliveries in your scope.</p></div>}</div>
    </Section>
    {complete.length>0&&<Section title="Completed deliveries"><div className="company-request-list">{complete.slice(0,25).map((order)=>card(order.id))}</div></Section>}
    {!isDriver&&<Section title="Fulfillment handoff" description="Warehouse allocation remains a controlled inventory step. If an accepted delivery says it is waiting for allocation, open Inventory and reserve the exact lots before loading."><Button variant="secondary" icon={<PackageCheck size={15}/>} onClick={()=>navigate("inventory")}>Open inventory fulfillment</Button></Section>}
  </div>;
}
