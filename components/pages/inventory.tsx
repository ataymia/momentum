"use client";

import { Boxes, CalendarClock, CheckCircle2, ChevronRight, ClipboardCheck, PackageOpen, ShieldAlert, Warehouse } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Field, Modal, PageHeader, Section, StatusPill, formatDate } from "../ui";

export function InventoryPage() {
  const { scope, resolveInventoryHold } = useWorkspace();
  const focusId=typeof window!=="undefined"?window.sessionStorage.getItem("momentum-focus-record"):null;
  const focusedLot=scope.inventory.find((lot)=>lot.id===focusId);
  const [selectedLotId, setSelectedLotId] = useState(focusedLot?.id??scope.inventory[0]?.id ?? "");
  const [holdOpen,setHoldOpen] = useState(false); const [decision,setDecision] = useState<"Release"|"Retain">("Retain"); const [reason,setReason] = useState(""); const [error,setError] = useState("");
  useEffect(()=>{if(focusId)window.sessionStorage.removeItem("momentum-focus-record")},[focusId]);
  const selectedLot = scope.inventory.find((lot) => lot.id === selectedLotId) ?? scope.inventory[0];
  const onHand = scope.inventory.reduce((sum, lot) => sum + lot.onHand, 0);
  const available = scope.inventory.reduce((sum, lot) => sum + lot.available, 0);
  const reserved = scope.inventory.reduce((sum, lot) => sum + lot.reserved, 0);
  const held = scope.inventory.filter((lot) => lot.status === "Quality hold").reduce((sum, lot) => sum + lot.onHand, 0);
  const submitHold = (event: FormEvent) => { event.preventDefault(); if (!selectedLot || !resolveInventoryHold(selectedLot.id,decision,reason)) { setError("Enter a review reason of at least eight characters."); return; } setHoldOpen(false); setReason(""); setError(""); };

  return (
    <div className="page page--inventory">
      <PageHeader eyebrow="Supply chain" title="Inventory" description="Track case availability, reservations, holds, custody, and lot dates." />
      <div className="inventory-kpis">
        <div><span><Boxes size={19} /></span><div><small>On hand</small><strong>{onHand} cases</strong></div></div>
        <div><span><CheckCircle2 size={19} /></span><div><small>Available</small><strong>{available} cases</strong></div></div>
        <div><span><ClipboardCheck size={19} /></span><div><small>Reserved</small><strong>{reserved} cases</strong></div></div>
        <div><span><ShieldAlert size={19} /></span><div><small>Quality hold</small><strong>{held} cases</strong></div></div>
      </div>
      <Section title="Lot inventory" description="Select a lot to review quantity, custody, and status" className="lot-panel">
        <div className="lot-table lot-table--head"><span>Lot</span><span>Status</span><span>On hand</span><span>Available</span><span>Best by</span><span /></div>
        {scope.inventory.map((lot) => (
          <button key={lot.id} className={`lot-table ${selectedLot?.id === lot.id ? "is-selected" : ""}`} onClick={() => setSelectedLotId(lot.id)}>
            <span><strong>{lot.lotCode}</strong><small>{lot.location}</small></span>
            <span><StatusPill tone={lot.status === "Available" ? "success" : lot.status === "Quality hold" ? "danger" : "warning"}>{lot.status}</StatusPill></span>
            <span>{lot.onHand}</span><span>{lot.available}</span><span>{formatDate(lot.bestBy, { month: "short", year: "numeric" })}</span><ChevronRight size={16} />
          </button>
        ))}
        {selectedLot && (
          <div className="lot-detail">
            <div><Warehouse size={19} /><span><small>Custody location</small><strong>{selectedLot.location}</strong></span></div>
            <div><PackageOpen size={19} /><span><small>Product</small><strong>{selectedLot.product}</strong></span></div>
            <div><CalendarClock size={19} /><span><small>Received</small><strong>{formatDate(selectedLot.receivedAt)}</strong></span></div>
            {selectedLot.status === "Quality hold" && <button onClick={() => setHoldOpen(true)}><ShieldAlert size={16} /> Resolve hold</button>}
            {selectedLot.holdDecision && <div className="lot-decision"><ShieldAlert size={16}/><span><small>Latest disposition review</small><strong>{selectedLot.holdDecision}</strong></span></div>}
          </div>
        )}
      </Section>
      <Modal open={holdOpen} title={`Review ${selectedLot?.lotCode ?? "quality hold"}`} description="Document the disposition. Releasing a hold returns eligible cases to available inventory; retaining it keeps them blocked." onClose={() => setHoldOpen(false)} footer={<><Button variant="ghost" onClick={() => setHoldOpen(false)}>Cancel</Button><Button type="submit" form="hold-form" variant={decision === "Release" ? "primary" : "secondary"}>Record decision</Button></>}>
        <form id="hold-form" className="form-grid" onSubmit={submitHold}><Field label="Disposition"><select value={decision} onChange={event => setDecision(event.target.value as "Release"|"Retain")}><option value="Retain">Retain hold</option><option value="Release">Release hold</option></select></Field><Field label="Cases affected"><input value={selectedLot?.onHand ?? 0} disabled/></Field><Field label="Reason and evidence reviewed" className="field--full"><textarea rows={4} required value={reason} onChange={event => { setReason(event.target.value); setError(""); }} placeholder="Why is this disposition appropriate?"/></Field>{selectedLot?.holdReason && <div className="form-callout field--full"><ShieldAlert size={17}/><p>Hold reason: {selectedLot.holdReason}</p></div>}{error && <p className="form-error field--full" role="alert">{error}</p>}</form>
      </Modal>
    </div>
  );
}
