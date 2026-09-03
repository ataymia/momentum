"use client";

import { Boxes, CalendarClock, CheckCircle2, ChevronRight, ClipboardCheck, PackageOpen, ShieldAlert, Warehouse } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { holdNodeId, nodeLotBalance, warehouseAvailable } from "../../lib/inventory-ledger";
import { useInventoryLedger } from "../../lib/inventory-ledger-context";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Field, Modal, PageHeader, Section, StatusPill, formatDate } from "../ui";

const companyCustodyTypes=new Set(["Warehouse","Bin","Vehicle","Employee custody","Quality hold"]);

export function InventoryPage() {
  const { scope } = useWorkspace();
  const { ledger, resolveQualityHold }=useInventoryLedger();
  const focusId=typeof window!=="undefined"?window.sessionStorage.getItem("momentum-focus-record"):null;
  const focusedLot=scope.inventory.find((lot)=>lot.id===focusId);
  const [selectedLotId, setSelectedLotId] = useState(focusedLot?.id??scope.inventory[0]?.id ?? "");
  const [holdOpen,setHoldOpen] = useState(false); const [decision,setDecision] = useState<"Release"|"Retain">("Retain"); const [reason,setReason] = useState(""); const [error,setError] = useState("");
  useEffect(()=>{if(focusId)window.sessionStorage.removeItem("momentum-focus-record")},[focusId]);
  const selectedLot = scope.inventory.find((lot) => lot.id === selectedLotId) ?? scope.inventory[0];
  const companyQtyFor=(lotId:string)=>ledger.nodes.filter((node)=>companyCustodyTypes.has(node.type)).reduce((sum,node)=>sum+nodeLotBalance(ledger,node.id,lotId),0);
  const availableFor=(lotId:string,status:string)=>status==="Quality hold"?0:warehouseAvailable(ledger,lotId);
  const onHand = scope.inventory.reduce((sum, lot) => sum + companyQtyFor(lot.id), 0);
  const available = scope.inventory.reduce((sum, lot) => sum + availableFor(lot.id,lot.status), 0);
  const reserved = ledger.reservations.filter((reservation)=>reservation.status==="Active"&&scope.inventory.some((lot)=>lot.id===reservation.lotId)).reduce((sum,reservation)=>sum+reservation.quantity,0);
  const held = scope.inventory.reduce((sum,lot)=>sum+Math.max(0,nodeLotBalance(ledger,holdNodeId,lot.id)),0);
  const selectedCustody=selectedLot?ledger.nodes.map((node)=>({node,qty:nodeLotBalance(ledger,node.id,selectedLot.id)})).filter(({node,qty})=>node.type!=="External"&&qty>0):[];
  const submitHold = (event: FormEvent) => { event.preventDefault(); if (!selectedLot || !resolveQualityHold(selectedLot.id,decision,reason)) { setError("The hold decision could not be recorded. Use a reason of at least eight characters and confirm the inventory period is open and the held cases are present in custody."); return; } setHoldOpen(false); setReason(""); setError(""); };

  return (
    <div className="page page--inventory">
      <PageHeader eyebrow="Supply chain" title="Inventory" description="The custody ledger is the quantity source of truth. Lot records provide product, dates, and disposition status." />
      <div className="inventory-kpis">
        <div><span><Boxes size={19} /></span><div><small>Company custody</small><strong>{onHand} cases</strong></div></div>
        <div><span><CheckCircle2 size={19} /></span><div><small>Warehouse available</small><strong>{available} cases</strong></div></div>
        <div><span><ClipboardCheck size={19} /></span><div><small>Reserved</small><strong>{reserved} cases</strong></div></div>
        <div><span><ShieldAlert size={19} /></span><div><small>Quality hold custody</small><strong>{held} cases</strong></div></div>
      </div>
      <Section title="Lot inventory" description="Quantity comes from recorded custody movements and reservations. Select a lot to review its physical position and disposition." className="lot-panel">
        <div className="lot-table lot-table--head"><span>Lot</span><span>Status</span><span>Company custody</span><span>Available</span><span>Best by</span><span /></div>
        {scope.inventory.map((lot) => (
          <button key={lot.id} className={`lot-table ${selectedLot?.id === lot.id ? "is-selected" : ""}`} onClick={() => setSelectedLotId(lot.id)}>
            <span><strong>{lot.lotCode}</strong><small>{lot.product}</small></span>
            <span><StatusPill tone={lot.status === "Available" ? "success" : lot.status === "Quality hold" ? "danger" : "warning"}>{lot.status}</StatusPill></span>
            <span>{companyQtyFor(lot.id)}</span><span>{availableFor(lot.id,lot.status)}</span><span>{formatDate(lot.bestBy, { month: "short", year: "numeric" })}</span><ChevronRight size={16} />
          </button>
        ))}
        {selectedLot && (
          <div className="lot-detail">
            <div><Warehouse size={19} /><span><small>Current custody</small><strong>{selectedCustody.length?selectedCustody.map(({node,qty})=>`${node.name}: ${qty} cs`).join(" · "):"No active custody balance"}</strong></span></div>
            <div><PackageOpen size={19} /><span><small>Product</small><strong>{selectedLot.product}</strong></span></div>
            <div><CalendarClock size={19} /><span><small>Received</small><strong>{formatDate(selectedLot.receivedAt)}</strong></span></div>
            {selectedLot.status === "Quality hold" && <button onClick={() => setHoldOpen(true)}><ShieldAlert size={16} /> Resolve hold</button>}
            {selectedLot.holdDecision && <div className="lot-decision"><ShieldAlert size={16}/><span><small>Latest disposition review</small><strong>{selectedLot.holdDecision}</strong></span></div>}
          </div>
        )}
      </Section>
      <Modal open={holdOpen} title={`Review ${selectedLot?.lotCode ?? "quality hold"}`} description="Retaining the hold leaves custody in Quality Hold. Releasing it records the physical move from Quality Hold to Warehouse and then makes the lot sellable." onClose={() => setHoldOpen(false)} footer={<><Button variant="ghost" onClick={() => setHoldOpen(false)}>Cancel</Button><Button type="submit" form="hold-form" variant={decision === "Release" ? "primary" : "secondary"}>Record decision</Button></>}>
        <form id="hold-form" className="form-grid" onSubmit={submitHold}><Field label="Disposition"><select value={decision} onChange={event => setDecision(event.target.value as "Release"|"Retain")}><option value="Retain">Retain hold</option><option value="Release">Release hold</option></select></Field><Field label="Cases currently held"><input value={selectedLot?Math.max(0,nodeLotBalance(ledger,holdNodeId,selectedLot.id)):0} disabled/></Field><Field label="Reason and evidence reviewed" className="field--full"><textarea rows={4} required value={reason} onChange={event => { setReason(event.target.value); setError(""); }} placeholder="Why is this disposition appropriate?"/></Field>{selectedLot?.holdReason && <div className="form-callout field--full"><ShieldAlert size={17}/><p>Hold reason: {selectedLot.holdReason}</p></div>}{error && <p className="form-error field--full" role="alert">{error}</p>}</form>
      </Modal>
    </div>
  );
}
