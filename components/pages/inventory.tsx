"use client";

import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Container,
  FileQuestion,
  PackageOpen,
  ScanBarcode,
  ShieldAlert,
  Warehouse,
} from "lucide-react";
import { useState } from "react";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, PageHeader, Section, StatusPill, formatDate } from "../ui";

const productFacts = [
  ["Sellable SKU", "Pending owner verification", "blocking"],
  ["UPC / GTIN", "Not provided", "blocking"],
  ["Can size", "Conflicting source artwork", "blocking"],
  ["Case configuration", "24 cans · proposed", "review"],
  ["Formula & ingredients", "Not provided", "blocking"],
  ["Caffeine / actives", "Conflicting source artwork", "blocking"],
  ["Shelf life", "Not provided", "blocking"],
  ["Approved claims", "Legal review required", "review"],
];

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
      <PageHeader
        eyebrow="Supply chain control"
        title="Product & inventory"
        description="Control the product truth first; then track every case by status, custody, and lot."
        actions={<Button variant="secondary" icon={<ScanBarcode size={17} />}>Receive inventory</Button>}
      />

      <div className="product-gate">
        <div className="product-gate__visual"><span className="product-can product-can--large"><i>GE</i></span><div className="product-gate__orbit" /></div>
        <div className="product-gate__copy">
          <StatusPill tone="danger">Release 0 blocker</StatusPill>
          <h2>Golden Eagle product record</h2>
          <p>The platform cannot safely quote, label, invoice, market, or recall a product until its controlled identity is approved.</p>
          <div className="product-gate__meta"><span>Record status</span><strong>Draft · not sellable</strong></div>
        </div>
        <div className="product-gate__action">
          <ShieldAlert size={23} />
          <strong>6 critical facts missing</strong>
          <p>Source artwork shows conflicting category, size, and active-ingredient information.</p>
          <button onClick={() => navigate("knowledge")}>Open verification register <ChevronRight size={15} /></button>
        </div>
      </div>

      <div className="inventory-kpis">
        <div><span><Boxes size={19} /></span><div><small>On hand</small><strong>{onHand} cases</strong></div></div>
        <div><span><CheckCircle2 size={19} /></span><div><small>Available</small><strong>{available} cases</strong></div></div>
        <div><span><ClipboardCheck size={19} /></span><div><small>Reserved</small><strong>{reserved} cases</strong></div></div>
        <div><span><ShieldAlert size={19} /></span><div><small>Quality hold</small><strong>{held} cases</strong></div></div>
      </div>

      <div className="inventory-grid">
        <Section title="Controlled product facts" description="Approved records should power every downstream surface" className="product-facts-panel">
          <div className="product-fact-list">
            {productFacts.map(([label, value, state]) => (
              <div key={label}>
                <span>{state === "blocking" ? <FileQuestion size={16} /> : <AlertTriangle size={16} />}</span>
                <div><strong>{label}</strong><p>{value}</p></div>
                <StatusPill tone={state === "blocking" ? "danger" : "warning"} dot={false}>{state === "blocking" ? "Missing" : "Review"}</StatusPill>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Lot inventory" description="Demo quantities · no warehouse connection" className="lot-panel">
          <div className="lot-table lot-table--head"><span>Lot</span><span>Status</span><span>On hand</span><span>Available</span><span>Best by</span><span /></div>
          {data.inventory.map((lot) => (
            <button key={lot.id} className={`lot-table ${selectedLot?.id === lot.id ? "is-selected" : ""}`} onClick={() => setSelectedLotId(lot.id)}>
              <span><strong>{lot.lotCode}</strong><small>{lot.location}</small></span>
              <span><StatusPill tone={lot.status === "Available" ? "success" : "danger"}>{lot.status}</StatusPill></span>
              <span>{lot.onHand}</span><span>{lot.available}</span><span>{formatDate(lot.bestBy, { month: "short", year: "numeric" })}</span><ChevronRight size={16} />
            </button>
          ))}
          {selectedLot && (
            <div className="lot-detail">
              <div><Warehouse size={19} /><span><small>Custody location</small><strong>{selectedLot.location}</strong></span></div>
              <div><PackageOpen size={19} /><span><small>Product</small><strong>{selectedLot.product}</strong></span></div>
              <div><CalendarClock size={19} /><span><small>Received</small><strong>{formatDate(selectedLot.receivedAt)}</strong></span></div>
              {selectedLot.status === "Quality hold" && <button onClick={() => navigate("work")}><ShieldAlert size={16} /> Review hold approval</button>}
            </div>
          )}
        </Section>
      </div>

      <Section title="Inbound & container planning" description="Designed into the model; blocked pending real supplier and import facts" className="container-panel">
        <div className="container-flow">
          {[
            ["Purchase order", "Supplier not confirmed"],
            ["Production", "Formula/version unknown"],
            ["Ocean freight", "Lane and lead time unknown"],
            ["Customs & FDA", "Importer roles unknown"],
            ["Receiving", "Warehouse workflow unknown"],
          ].map(([title, detail], index) => (
            <div key={title}><span>{index + 1}</span><strong>{title}</strong><p>{detail}</p>{index < 4 && <ChevronRight size={17} />}</div>
          ))}
        </div>
        <div className="container-callout"><Container size={26} /><div><StatusPill tone="warning">Definition pending</StatusPill><h3>One container per month</h3><p>Container quantity, cash milestones, cycle time, landed-cost allocation, and success event must be approved before this becomes a progress bar.</p></div></div>
      </Section>
    </div>
  );
}
