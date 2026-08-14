"use client";

import { Boxes, CalendarClock, CheckCircle2, ChevronRight, ClipboardCheck, PackageOpen, ShieldAlert, Warehouse } from "lucide-react";
import { useState } from "react";
import { useWorkspace } from "../../lib/workspace-context";
import { PageHeader, Section, StatusPill, formatDate } from "../ui";

export function InventoryPage() {
  const { data, navigate } = useWorkspace();
  const [selectedLotId, setSelectedLotId] = useState(data.inventory[0]?.id ?? "");
  const selectedLot = data.inventory.find((lot) => lot.id === selectedLotId) ?? data.inventory[0];
  const onHand = data.inventory.reduce((sum, lot) => sum + lot.onHand, 0);
  const available = data.inventory.reduce((sum, lot) => sum + lot.available, 0);
  const reserved = data.inventory.reduce((sum, lot) => sum + lot.reserved, 0);
  const held = data.inventory.filter((lot) => lot.status === "Quality hold").reduce((sum, lot) => sum + lot.onHand, 0);

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
        {data.inventory.map((lot) => (
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
            {selectedLot.status === "Quality hold" && <button onClick={() => navigate("work")}><ShieldAlert size={16} /> Open hold review</button>}
          </div>
        )}
      </Section>
    </div>
  );
}
