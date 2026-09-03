"use client";

import { Boxes, ClipboardCheck, PackageCheck, Plus, Route, ScanLine, ShieldAlert, Warehouse } from "lucide-react";
import { FormEvent, useState } from "react";
import { MovementType, lotBalances, nodeLotBalance, reservedQuantity, warehouseAvailable, warehouseNodeId } from "../../lib/inventory-ledger";
import { useInventoryLedger } from "../../lib/inventory-ledger-context";
import { customerForLocation, locationLabel } from "../../lib/crm-hierarchy";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Field, Modal, Section, StatusPill, formatDate } from "../ui";

const movementTypes: MovementType[] = ["Receipt", "Transfer", "Delivery", "Return", "Sample", "Damage", "Shrink", "Adjustment", "Disposal"];
const countTone = (status: string) => status === "Reconciled" ? "success" as const : "warning" as const;

export function InventoryLedgerPanel() {
  const { data, currentUser } = useWorkspace();
  const { ledger, postMovement, reserve, releaseReservation, recordCount, reconcileCount } = useInventoryLedger();
  const lots = data.inventory;
  const [selectedLotId, setSelectedLotId] = useState(lots[0]?.id ?? "");
  const [movementOpen, setMovementOpen] = useState(false);
  const [countOpen, setCountOpen] = useState(false);
  const [reservationOpen, setReservationOpen] = useState(false);
  const [movement, setMovement] = useState({ type: "Transfer" as MovementType, quantity: "", fromNodeId: warehouseNodeId, toNodeId: "", relatedOrderId: "", reason: "" });
  const [countForm, setCountForm] = useState({ nodeId: warehouseNodeId, countedQty: "" });
  const [reservationForm, setReservationForm] = useState({ orderId: "", quantity: "" });

  if (!currentUser || !["Administrator", "Operations"].includes(currentUser.role)) return null;

  const selectedLot = lots.find((lot) => lot.id === selectedLotId) ?? lots[0];
  const balances = selectedLot ? lotBalances(ledger, selectedLot.id) : [];
  const reservations = selectedLot ? ledger.reservations.filter((item) => item.lotId === selectedLot.id) : [];
  const counts = selectedLot ? ledger.counts.filter((item) => item.lotId === selectedLot.id) : [];
  const activeReservations = ledger.reservations.filter((item) => item.status === "Active");
  const reservedByOrder = new Map<string, number>();
  for (const item of activeReservations) reservedByOrder.set(item.orderId, (reservedByOrder.get(item.orderId) ?? 0) + item.quantity);
  const allocationCandidates = data.orders.filter((order) => ["Approved", "Allocated"].includes(order.status) && order.cases > (reservedByOrder.get(order.id) ?? 0));
  const systemTotal = selectedLot ? ledger.nodes.filter((node) => node.type !== "External").reduce((sum, node) => sum + nodeLotBalance(ledger, node.id, selectedLot.id), 0) : 0;

  const submitMovement = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedLot) return;
    const id = postMovement({
      lotId: selectedLot.id,
      quantity: Number(movement.quantity),
      type: movement.type,
      fromNodeId: movement.fromNodeId || undefined,
      toNodeId: movement.toNodeId || undefined,
      relatedOrderId: movement.relatedOrderId || undefined,
      reason: movement.reason,
    });
    if (!id) return;
    setMovementOpen(false);
    setMovement({ type: "Transfer", quantity: "", fromNodeId: warehouseNodeId, toNodeId: "", relatedOrderId: "", reason: "" });
  };

  const submitCount = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedLot) return;
    const id = recordCount(countForm.nodeId, selectedLot.id, Number(countForm.countedQty));
    if (!id) return;
    setCountOpen(false);
    setCountForm({ nodeId: warehouseNodeId, countedQty: "" });
  };

  const submitReservation = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedLot) return;
    const order = data.orders.find((item) => item.id === reservationForm.orderId);
    if (!order) return;
    const remaining = order.cases - (reservedByOrder.get(order.id) ?? 0);
    const quantity = Math.min(remaining, Number(reservationForm.quantity));
    if (quantity <= 0 || quantity > warehouseAvailable(ledger, selectedLot.id)) return;
    const id = reserve(order.id, selectedLot.id, quantity);
    if (!id) return;
    setReservationOpen(false);
    setReservationForm({ orderId: "", quantity: "" });
  };

  const changeMovementOrder = (orderId:string) => {
    const order=data.orders.find((item)=>item.id===orderId);
    setMovement((current)=>({...current,relatedOrderId:orderId,toNodeId:current.type==="Delivery"&&order?`node-account-${order.accountId}`:current.toNodeId}));
  };

  return (
    <div className="page inventory-ledger-panel">
      <Section title="Inventory custody ledger" description="Every case movement is a source record. Reservations protect stock; custody movements prove where the physical cases went.">
        <div className="company-rule-facts"><div><span>Ledger quantity</span><strong>{systemTotal} cs</strong><small>{selectedLot?.lotCode ?? "Select lot"}</small></div><div><span>Warehouse available</span><strong>{selectedLot ? warehouseAvailable(ledger, selectedLot.id) : 0} cs</strong><small>Warehouse balance less active reservations</small></div><div><span>Reserved</span><strong>{selectedLot ? reservedQuantity(ledger, selectedLot.id) : 0} cs</strong><small>Protected for approved orders</small></div><div><span>Open count exceptions</span><strong>{ledger.counts.filter((count) => count.status === "Open" && count.variance !== 0).length}</strong><small>Requires independent reconciliation</small></div></div>
      </Section>

      <Section title="Lot & custody view" description="See where every recorded case is held" action={<div className="account-detail__actions"><label className="reassign-field"><span>Lot</span><select value={selectedLot?.id ?? ""} onChange={(event) => setSelectedLotId(event.target.value)}>{lots.map((lot) => <option key={lot.id} value={lot.id}>{lot.lotCode} · {lot.product}</option>)}</select></label><Button size="sm" icon={<Plus size={14} />} onClick={() => setMovementOpen(true)}>Record movement</Button><Button size="sm" variant="secondary" icon={<ScanLine size={14} />} onClick={() => setCountOpen(true)}>Physical count</Button>{allocationCandidates.length > 0 && <Button size="sm" variant="secondary" icon={<PackageCheck size={14} />} onClick={() => setReservationOpen(true)}>Reserve order</Button>}</div>}>
        <div className="company-request-list">
          {balances.map(({ node, balance }) => <article key={node.id}><span>{node.type === "Warehouse" ? <Warehouse size={17} /> : node.type === "Quality hold" ? <ShieldAlert size={17} /> : <Boxes size={17} />}</span><div><small>{node.type}</small><strong>{node.name}</strong><p>{balance} cases recorded at this custody point</p></div><StatusPill tone={node.type === "Quality hold" ? "warning" : node.type === "Disposed" ? "danger" : "success"}>{balance} cs</StatusPill></article>)}
          {balances.length === 0 && <div className="review-empty"><Boxes size={23} /><p>No custody balance exists for this lot.</p></div>}
        </div>
      </Section>

      <div className="company-grid company-grid--two">
        <Section title="Movement history" description="Append-only physical custody transactions">
          <div className="hcm-audit-list">
            {ledger.movements.filter((item) => item.lotId === selectedLot?.id).slice(0, 20).map((item) => {
              const from = ledger.nodes.find((node) => node.id === item.fromNodeId);
              const to = ledger.nodes.find((node) => node.id === item.toNodeId);
              const order = item.relatedOrderId ? data.orders.find((entry) => entry.id === item.relatedOrderId) : undefined;
              return <article key={item.id}><span><Route size={16} /></span><div><small>{item.type} · {formatDate(item.at, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small><strong>{item.quantity} cs · {from?.name ?? "External source"} → {to?.name ?? "Removed from custody"}</strong><p>{item.reason}{order ? ` · ${order.number}` : ""}</p></div></article>;
            })}
          </div>
        </Section>

        <Section title="Order reservations" description="Reservation protects stock without pretending it physically moved">
          <div className="company-request-list">
            {reservations.map((item) => {
              const order = data.orders.find((entry) => entry.id === item.orderId);
              const location = data.accounts.find((account) => account.id === order?.accountId);
              const customer = location ? customerForLocation(data, location) : undefined;
              return <article key={item.id}><span><PackageCheck size={17} /></span><div><small>{order?.number} · {item.status}</small><strong>{item.quantity} cases · {customer?.name ?? "Customer"}</strong><p>{location ? locationLabel(location) : "Location"}</p>{item.status==="Active"&&<p>Fulfillment is recorded automatically only after linked delivery evidence proves customer custody.</p>}</div><StatusPill tone={item.status === "Active" ? "warning" : item.status === "Fulfilled" ? "success" : "neutral"}>{item.status}</StatusPill>{item.status === "Active" && <div className="request-actions"><Button size="sm" variant="ghost" onClick={() => releaseReservation(item.id)}>Release</Button></div>}</article>;
            })}
            {reservations.length === 0 && <div className="review-empty"><p>No reservations for this lot.</p></div>}
          </div>
        </Section>
      </div>

      <Section title="Physical count & variance control" description="A count freezes system quantity and observed quantity. A different authorized operator must reconcile the variance with a reason.">
        <div className="company-request-list">
          {counts.map((count) => {
            const node = ledger.nodes.find((item) => item.id === count.nodeId);
            const canReconcile=count.status==="Open"&&count.countedBy!==currentUser.id;
            return <article key={count.id}><span><ClipboardCheck size={17} /></span><div><small>{formatDate(count.countedAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {node?.name}</small><strong>Counted {count.countedQty} · system {count.systemQty} · variance {count.variance > 0 ? "+" : ""}{count.variance}</strong><p>{count.reason ?? "No reconciliation reason yet"}</p></div><StatusPill tone={countTone(count.status)}>{count.status}</StatusPill>{canReconcile && <Button size="sm" onClick={() => { const reason = window.prompt("Explain the variance or confirm the count reconciliation"); if (reason) reconcileCount(count.id, reason); }}>Reconcile</Button>}{count.status==="Open"&&!canReconcile&&<small>Independent review required</small>}</article>;
          })}
          {counts.length === 0 && <div className="review-empty"><p>No physical counts recorded for this lot.</p></div>}
        </div>
      </Section>

      <Modal open={movementOpen} title="Record inventory movement" description="Use Transfer for a physical custody handoff and Delivery only when cases reach the retailer. Reservations are created separately." onClose={() => setMovementOpen(false)} footer={<><Button variant="ghost" onClick={() => setMovementOpen(false)}>Cancel</Button><Button type="submit" form="movement-form">Post movement</Button></>} wide>
        <form id="movement-form" className="form-grid" onSubmit={submitMovement}><Field label="Movement type"><select value={movement.type} onChange={(event) => {const type=event.target.value as MovementType;const order=data.orders.find((item)=>item.id===movement.relatedOrderId);setMovement({...movement,type,toNodeId:type==="Delivery"&&order?`node-account-${order.accountId}`:movement.toNodeId});}}>{movementTypes.map((type) => <option key={type}>{type}</option>)}</select></Field><Field label="Quantity (cases)"><input required type="number" min="0.01" step="0.01" value={movement.quantity} onChange={(event) => setMovement({ ...movement, quantity: event.target.value })} /></Field><Field label="From"><select value={movement.fromNodeId} onChange={(event) => setMovement({ ...movement, fromNodeId: event.target.value })}><option value="">No source / external receipt</option>{ledger.nodes.filter((node) => node.active).map((node) => <option key={node.id} value={node.id}>{node.name} · {node.type}</option>)}</select></Field><Field label="To"><select value={movement.toNodeId} onChange={(event) => setMovement({ ...movement, toNodeId: event.target.value })}><option value="">No destination / remove from active custody</option>{ledger.nodes.filter((node) => node.active).map((node) => <option key={node.id} value={node.id}>{node.name} · {node.type}</option>)}</select></Field><Field label="Related order"><select value={movement.relatedOrderId} onChange={(event) => changeMovementOrder(event.target.value)}><option value="">None</option>{data.orders.filter((order)=>["Approved","Allocated","Out for delivery"].includes(order.status)).map((order) => <option key={order.id} value={order.id}>{order.number} · {order.cases} cases</option>)}</select></Field><Field label="Reason" className="field--full"><textarea required rows={3} value={movement.reason} onChange={(event) => setMovement({ ...movement, reason: event.target.value })} /></Field></form>
      </Modal>

      <Modal open={countOpen} title="Record physical count" description="Count one lot at one custody point. The person recording the count cannot reconcile their own variance." onClose={() => setCountOpen(false)} footer={<><Button variant="ghost" onClick={() => setCountOpen(false)}>Cancel</Button><Button type="submit" form="count-form">Record count</Button></>}>
        <form id="count-form" className="form-grid" onSubmit={submitCount}><Field label="Custody point"><select value={countForm.nodeId} onChange={(event) => setCountForm({ ...countForm, nodeId: event.target.value })}>{ledger.nodes.filter((node) => node.type !== "External").map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select></Field><Field label="Counted cases"><input required type="number" min="0" step="0.01" value={countForm.countedQty} onChange={(event) => setCountForm({ ...countForm, countedQty: event.target.value })} /></Field></form>
      </Modal>

      <Modal open={reservationOpen} title="Reserve inventory for order" description="Reservations protect quantity before physical fulfillment. The engine prevents over-reserving the order or lot." onClose={() => setReservationOpen(false)} footer={<><Button variant="ghost" onClick={() => setReservationOpen(false)}>Cancel</Button><Button type="submit" form="reservation-form">Reserve</Button></>}>
        <form id="reservation-form" className="form-grid" onSubmit={submitReservation}><Field label="Order"><select required value={reservationForm.orderId} onChange={(event) => { const order = data.orders.find((item) => item.id === event.target.value); setReservationForm({ orderId: event.target.value, quantity: order ? String(Math.max(0, order.cases - (reservedByOrder.get(order.id) ?? 0))) : "" }); }}><option value="">Select order</option>{allocationCandidates.map((order) => <option key={order.id} value={order.id}>{order.number} · {order.cases - (reservedByOrder.get(order.id) ?? 0)} unreserved cases</option>)}</select></Field><Field label="Cases"><input required type="number" min="0.01" step="0.01" max={selectedLot ? warehouseAvailable(ledger, selectedLot.id) : 0} value={reservationForm.quantity} onChange={(event) => setReservationForm({ ...reservationForm, quantity: event.target.value })} /></Field></form>
      </Modal>
    </div>
  );
}
