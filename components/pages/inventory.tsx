"use client";

import { Boxes, CalendarClock, CheckCircle2, ChevronRight, ClipboardCheck, PackageOpen, Plus, ShieldAlert, Warehouse } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { arizonaDateKey, isValidCalendarDateKey } from "../../lib/date-time";
import { holdNodeId, nodeLotBalance, warehouseAvailable } from "../../lib/inventory-ledger";
import { useInventoryLedger } from "../../lib/inventory-ledger-context";
import type { InventoryLot } from "../../lib/types";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Field, Modal, PageHeader, Section, StatusPill, formatDate } from "../ui";

const companyCustodyTypes=new Set(["Warehouse","Bin","Vehicle","Employee custody","Quality hold"]);
const quickProducts=["Tropical","Sugar Free","Original","Red","Blue"] as const;
type QuickInventoryRow={product:string;cases:string;lotCode:string;bestBy:string};
const freshQuickRows=():QuickInventoryRow[]=>quickProducts.map((product)=>({product,cases:"",lotCode:"",bestBy:""}));

export function InventoryPage() {
  const { data, scope, currentUser, importInventoryLots } = useWorkspace();
  const { ledger, resolveQualityHold }=useInventoryLedger();
  const focusId=typeof window!=="undefined"?window.sessionStorage.getItem("momentum-focus-record"):null;
  const quickIntent=typeof window!=="undefined"?window.sessionStorage.getItem("momentum-inventory-intent"):null;
  const focusedLot=scope.inventory.find((lot)=>lot.id===focusId);
  const [selectedLotId, setSelectedLotId] = useState(focusedLot?.id??scope.inventory[0]?.id ?? "");
  const [holdOpen,setHoldOpen] = useState(false); const [decision,setDecision] = useState<"Release"|"Retain">("Retain"); const [reason,setReason] = useState(""); const [error,setError] = useState("");
  const [quickOpen,setQuickOpen]=useState(quickIntent==="quick-add");
  const [quickRows,setQuickRows]=useState<QuickInventoryRow[]>(freshQuickRows);
  const [receivedAt,setReceivedAt]=useState(arizonaDateKey());
  const [receiptLocation,setReceiptLocation]=useState("Phoenix warehouse");
  const [quickError,setQuickError]=useState("");
  const [quickNotice,setQuickNotice]=useState("");
  useEffect(()=>{if(focusId)window.sessionStorage.removeItem("momentum-focus-record");if(quickIntent)window.sessionStorage.removeItem("momentum-inventory-intent")},[focusId,quickIntent]);
  const selectedLot = scope.inventory.find((lot) => lot.id === selectedLotId) ?? scope.inventory[0];
  const companyQtyFor=(lotId:string)=>ledger.nodes.filter((node)=>companyCustodyTypes.has(node.type)).reduce((sum,node)=>sum+nodeLotBalance(ledger,node.id,lotId),0);
  const availableFor=(lotId:string,status:string)=>status==="Quality hold"?0:warehouseAvailable(ledger,lotId);
  const onHand = scope.inventory.reduce((sum, lot) => sum + companyQtyFor(lot.id), 0);
  const available = scope.inventory.reduce((sum, lot) => sum + availableFor(lot.id,lot.status), 0);
  const reserved = ledger.reservations.filter((reservation)=>reservation.status==="Active"&&scope.inventory.some((lot)=>lot.id===reservation.lotId)).reduce((sum,reservation)=>sum+reservation.quantity,0);
  const held = scope.inventory.reduce((sum,lot)=>sum+Math.max(0,nodeLotBalance(ledger,holdNodeId,lot.id)),0);
  const selectedCustody=selectedLot?ledger.nodes.map((node)=>({node,qty:nodeLotBalance(ledger,node.id,selectedLot.id)})).filter(({node,qty})=>node.type!=="External"&&qty>0):[];
  const submitHold = (event: FormEvent) => { event.preventDefault(); if (!selectedLot || !resolveQualityHold(selectedLot.id,decision,reason)) { setError("The hold decision could not be recorded. Use a reason of at least eight characters and confirm the inventory period is open and the held cases are present in custody."); return; } setHoldOpen(false); setReason(""); setError(""); };

  const openQuickAdd=()=>{
    setQuickRows(freshQuickRows());
    setReceivedAt(arizonaDateKey());
    setReceiptLocation("Phoenix warehouse");
    setQuickError("");
    setQuickNotice("");
    setQuickOpen(true);
  };
  const updateQuickRow=(index:number,patch:Partial<QuickInventoryRow>)=>setQuickRows((rows)=>rows.map((row,rowIndex)=>rowIndex===index?{...row,...patch}:row));
  const submitQuickAdd=(event:FormEvent)=>{
    event.preventDefault();
    setQuickError("");
    if(currentUser?.role!=="Administrator"){setQuickError("Only an Administrator can use quick inventory receipt.");return;}
    if(!isValidCalendarDateKey(receivedAt)){setQuickError("Choose a valid received date.");return;}
    const location=receiptLocation.trim();
    if(location.length<2){setQuickError("Enter the warehouse or custody location receiving these cases.");return;}

    const existingCodes=new Set(data.inventory.map((lot)=>lot.lotCode.trim().toLowerCase()));
    const batchCodes=new Set<string>();
    const records:InventoryLot[]=[];
    let totalCases=0;
    const stamp=Date.now();

    for(let index=0;index<quickRows.length;index+=1){
      const row=quickRows[index];
      if(!row.cases.trim())continue;
      const quantity=Number(row.cases);
      if(!Number.isInteger(quantity)||quantity<=0){setQuickError(`${row.product||`Row ${index+1}`}: cases must be a whole number greater than zero.`);return;}
      const product=row.product.trim();
      if(!product){setQuickError(`Row ${index+1}: enter a product name.`);return;}
      const lotCode=row.lotCode.trim();
      if(!lotCode){setQuickError(`${product}: enter the actual lot code or an internal receipt code before adding stock.`);return;}
      const normalizedCode=lotCode.toLowerCase();
      if(existingCodes.has(normalizedCode)||batchCodes.has(normalizedCode)){setQuickError(`${product}: lot code ${lotCode} already exists or is repeated in this receipt.`);return;}
      if(!isValidCalendarDateKey(row.bestBy)){setQuickError(`${product}: enter the best-by date printed for this lot.`);return;}
      if(row.bestBy<receivedAt){setQuickError(`${product}: best-by date cannot be earlier than the received date.`);return;}
      batchCodes.add(normalizedCode);
      totalCases+=quantity;
      records.push({
        id:`lot-manual-${stamp}-${index}`,
        lotCode,
        product,
        receivedAt,
        bestBy:row.bestBy,
        onHand:quantity,
        reserved:0,
        available:quantity,
        status:"Available",
        location,
      });
    }

    if(!records.length){setQuickError("Enter a case quantity for at least one product.");return;}
    const imported=importInventoryLots(records);
    if(imported!==records.length){setQuickError(`Momentum accepted ${imported} of ${records.length} lots. Nothing else was retried automatically. Review existing lot codes and dates before trying the rejected rows again.`);return;}
    setSelectedLotId(records[0].id);
    setQuickNotice(`${totalCases} cases across ${records.length} product lot${records.length===1?"":"s"} were added to warehouse inventory.`);
    setQuickOpen(false);
  };

  return (
    <div className="page page--inventory">
      <PageHeader eyebrow="Supply chain" title="Inventory" description="The custody ledger is the quantity source of truth. Lot records provide product, dates, and disposition status." actions={currentUser?.role==="Administrator"?<Button variant="gold" icon={<Plus size={17}/>} onClick={openQuickAdd}>Quick add inventory</Button>:undefined}/>
      {quickNotice&&<div className="form-callout"><CheckCircle2 size={17}/><p>{quickNotice}</p></div>}
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
            <span>{companyQtyFor(lot.id)}</span><span>{availableFor(lot.id,lot.status)}</span><span>{formatDate(lot.bestBy, { month:"short", year:"numeric" })}</span><ChevronRight size={16} />
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
      <Modal open={quickOpen} title="Quick add inventory" description="Administrator-only opening receipt. Enter only quantities physically in company custody. Lot code and best-by date are required so inventory stays auditable and usable for fulfillment." onClose={()=>setQuickOpen(false)} footer={<><Button variant="ghost" onClick={()=>setQuickOpen(false)}>Cancel</Button><Button type="submit" form="quick-inventory-form" variant="primary">Add inventory</Button></>}>
        <form id="quick-inventory-form" className="form-grid" onSubmit={submitQuickAdd}>
          <Field label="Received date"><input type="date" required value={receivedAt} onChange={(event)=>setReceivedAt(event.target.value)}/></Field>
          <Field label="Receiving location"><input required value={receiptLocation} onChange={(event)=>setReceiptLocation(event.target.value)} placeholder="Phoenix warehouse"/></Field>
          <div className="field--full form-callout"><Boxes size={17}/><p>Leave Cases blank for any product you are not receiving. Product names are editable before the receipt is saved.</p></div>
          {quickRows.map((row,index)=><div key={`${row.product}-${index}`} className="field--full form-grid">
            <Field label="Product"><input value={row.product} onChange={(event)=>updateQuickRow(index,{product:event.target.value})}/></Field>
            <Field label="Cases"><input type="number" min="1" step="1" value={row.cases} onChange={(event)=>updateQuickRow(index,{cases:event.target.value})} placeholder="0"/></Field>
            <Field label="Lot / receipt code"><input value={row.lotCode} onChange={(event)=>updateQuickRow(index,{lotCode:event.target.value})} placeholder="Printed lot or internal receipt code"/></Field>
            <Field label="Best by"><input type="date" value={row.bestBy} onChange={(event)=>updateQuickRow(index,{bestBy:event.target.value})}/></Field>
          </div>)}
          {quickError&&<p className="form-error field--full" role="alert">{quickError}</p>}
        </form>
      </Modal>
      <Modal open={holdOpen} title={`Review ${selectedLot?.lotCode ?? "quality hold"}`} description="Retaining the hold leaves custody in Quality Hold. Releasing it records the physical move from Quality Hold to Warehouse and then makes the lot sellable." onClose={() => setHoldOpen(false)} footer={<><Button variant="ghost" onClick={() => setHoldOpen(false)}>Cancel</Button><Button type="submit" form="hold-form" variant={decision === "Release" ? "primary" : "secondary"}>Record decision</Button></>}>
        <form id="hold-form" className="form-grid" onSubmit={submitHold}><Field label="Disposition"><select value={decision} onChange={event => setDecision(event.target.value as "Release"|"Retain")}><option value="Retain">Retain hold</option><option value="Release">Release hold</option></select></Field><Field label="Cases currently held"><input value={selectedLot?Math.max(0,nodeLotBalance(ledger,holdNodeId,selectedLot.id)):0} disabled/></Field><Field label="Reason and evidence reviewed" className="field--full"><textarea rows={4} required value={reason} onChange={event => { setReason(event.target.value); setError(""); }} placeholder="Why is this disposition appropriate?"/></Field>{selectedLot?.holdReason && <div className="form-callout field--full"><ShieldAlert size={17}/><p>Hold reason: {selectedLot.holdReason}</p></div>}{error && <p className="form-error field--full" role="alert">{error}</p>}</form>
      </Modal>
    </div>
  );
}
