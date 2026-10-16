"use client";

import {useEffect,useState} from "react";
import {useWorkspace,COMMERCIAL_KEY} from "../../lib/workspace-context";
import {useInventoryLedger} from "../../lib/inventory-ledger-context";
import {useFirebaseSessionOptional} from "../../lib/firebase-session-context";
import {firebaseFunctionUrl} from "../../lib/firebase-functions";
import {momentumStorage} from "../../lib/persistence";
import {DELIVERY_STORAGE_KEY} from "../../lib/delivery-engine";
import {INVENTORY_LEDGER_STORAGE_KEY,warehouseNodeId,nodeLotBalance} from "../../lib/inventory-ledger";
import {matchingInventoryLots,orderLinesFor} from "../../lib/order-lines";
import type {Order} from "../../lib/types";
import {Button,Field,Modal} from "../ui";

type LotRow={id:string;lotId:string;fromNodeId:string;quantity:number};
type Props={order:Order|null;onClose:()=>void;onSaved:(message:string,orderId:string)=>void};
type CompletionMode="verified"|"reconcile";
const localNow=()=>{
  const value=new Date();
  return new Date(value.getTime()-value.getTimezoneOffset()*60000).toISOString().slice(0,16);
};

/** Administrator's physical delivery attestation; no pending browser sync gates. */
export function AdminDeliveryOverride({order,onClose,onSaved}:Props){
  const{currentUser,data}=useWorkspace();
  const{ledger}=useInventoryLedger();
  const firebase=useFirebaseSessionOptional();
  const[date,setDate]=useState("");
  const[performedBy,setPerformedBy]=useState("");
  const[reason,setReason]=useState("");
  const[rows,setRows]=useState<LotRow[]>([]);
  const[mode,setMode]=useState<CompletionMode>("verified");
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState("");
  const lots=data.inventory.filter(lot=>lot.status!=="Quality hold");
  const sources=ledger.nodes.filter(node=>node.active&&["Warehouse","Vehicle","Bin","Employee custody"].includes(node.type));

  useEffect(()=>{
    if(!order)return;
    const timer=window.setTimeout(()=>{
      const suggested=orderLinesFor(order).map((line,index)=>{
        const match=matchingInventoryLots(lots,line.product).map(lot=>{
          const node=sources.find(node=>nodeLotBalance(ledger,node.id,lot.id)>=line.cases);
          return node?{lot,node}:null;
        }).find(Boolean);
        return {id:`initial-${index}`,lotId:match?.lot.id??"",fromNodeId:match?.node.id??warehouseNodeId,quantity:line.cases};
      });
      setDate(localNow());setPerformedBy("");setReason("");setError("");
      setRows(suggested);
      setMode(suggested.every(item=>Boolean(item.lotId))?"verified":"reconcile");
    },0);
    return()=>window.clearTimeout(timer);
    // Reset only when switching orders. Draft does not reset as inventory syncs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[order?.id]);

  const update=(id:string,patch:Partial<LotRow>)=>
    setRows(items=>items.map(item=>item.id===id?{...item,...patch}:item));
  const close=()=>{if(!busy)onClose();};
  const submit=async()=>{
    if(busy||currentUser?.role!=="Administrator"||!firebase?.session?.idToken||!order)return;
    if(!performedBy.trim()||reason.trim().length<5||!date||
      (mode==="verified"&&(!rows.length||
        rows.some(row=>!row.lotId||!row.fromNodeId||!Number.isInteger(row.quantity)||row.quantity<1)))){
      setError("Enter who completed the delivery and a reason. For verified stock, complete each lot and case quantity.");
      return;
    }
    const timestamp=new Date(date);
    if(Number.isNaN(timestamp.getTime())){
      setError("Enter a valid actual delivery time.");return;
    }
    setBusy(true);setError("");
    try{
      // The server validates fresh Firestore orders and stock atomically.
      // Unrelated unsaved browser work must never block this admin action.
      const response=await fetch(firebaseFunctionUrl("adminDeliveryOverride"),{
        method:"POST",headers:{"content-type":"application/json",
          authorization:`Bearer ${firebase.session.idToken}`},
        body:JSON.stringify({
          orderId:order.id,deliveredAt:timestamp.toISOString(),
          reason:reason.trim(),performedBy:performedBy.trim(),
          inventoryReconciliationAcknowledged:mode==="reconcile",
          allocations:mode==="verified"?rows.map(({lotId,fromNodeId,quantity})=>({lotId,fromNodeId,quantity})):[],
        }),
      });
      const result=await response.json().catch(()=>null) as
        {ok?:boolean;message?:string;inventoryReconciliationRequired?:boolean}|null;
      if(!response.ok||result?.ok!==true){
        setError(result?.message??"The server did not confirm this delivery. Check the order before attempting again.");
        return;
      }
      const refreshed=await momentumStorage.refreshKeys([
        COMMERCIAL_KEY,INVENTORY_LEDGER_STORAGE_KEY,DELIVERY_STORAGE_KEY,
      ]);
      const base=result.inventoryReconciliationRequired?
        "Delivered, with a recorded inventory reconciliation exception. No inventory was deducted.":
        "Delivered with verified inventory movements.";
      onSaved(refreshed.ok?base+" Payment status was not changed.":
        base+" Firebase confirmed delivery, but this device has pending edits. Refresh after syncing; do not submit the override again.",order.id);
      onClose();
    }catch(e){
      setError(e instanceof Error?e.message:"The request failed. Check the order status before retrying.");
    }finally{setBusy(false);}
  };

  if(currentUser?.role!=="Administrator")return null;
  return <Modal open={Boolean(order)} title="Confirm physical delivery"
    description="Administrator override for a delivery or customer pickup. Records delivery and audit evidence without recording payment."
    wide onClose={close} footer={<>
      <Button type="button" variant="ghost" disabled={busy} onClick={close}>Cancel</Button>
      <Button type="button" disabled={busy||!firebase?.session?.idToken}
        onClick={()=>void submit()}>{busy?"Recording…":"Confirm delivered"}</Button>
    </>}>
    <div className="form-grid">
      <Field label="Delivered by / customer pickup"><input required value={performedBy}
        onChange={event=>setPerformedBy(event.target.value)} placeholder="Who physically delivered or collected the order?"/></Field>
      <Field label="Actual delivery date and time"><input type="datetime-local" required value={date}
        onChange={event=>setDate(event.target.value)}/></Field>
      <Field label="Delivery explanation" className="field--full"><textarea required value={reason}
        onChange={event=>setReason(event.target.value)} placeholder="Where was it delivered and how was receipt confirmed?"/></Field>
      <div className="field--full">
        <strong>Inventory verification</strong>
        <p>Choose one. If physical delivery is confirmed but stock records are incomplete, create a reconciliation exception instead of inventing inventory.</p>
        <label><input type="radio" name="override-stock-mode" checked={mode==="verified"}
          onChange={()=>setMode("verified")}/> Record using verified stock</label>
        <label><input type="radio" name="override-stock-mode" checked={mode==="reconcile"}
          onChange={()=>setMode("reconcile")}/> Confirm delivery; inventory reconciliation required</label>
      </div>
      {mode==="verified"?<div className="field--full">
        {rows.map((row,index)=><div key={row.id}
          style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))",gap:9,alignItems:"end",marginTop:8}}>
          <Field label={`Lot ${index+1}`}><select required value={row.lotId}
            onChange={event=>update(row.id,{lotId:event.target.value})}>
            <option value="">Choose lot</option>{lots.map(lot=><option key={lot.id} value={lot.id}>{lot.lotCode} · {lot.product}</option>)}
          </select></Field>
          <Field label="Stock source"><select required value={row.fromNodeId}
            onChange={event=>update(row.id,{fromNodeId:event.target.value})}>
            <option value="">Choose source</option>{sources.map(node=><option key={node.id} value={node.id}>
              {node.name}{row.lotId?` (${nodeLotBalance(ledger,node.id,row.lotId)} cases)`:""}
            </option>)}
          </select></Field>
          <Field label="Cases"><input type="number" min="1" step="1" required value={row.quantity}
            onChange={event=>update(row.id,{quantity:Number(event.target.value)})}/></Field>
          <Button type="button" size="sm" variant="ghost" disabled={rows.length<2}
            onClick={()=>setRows(items=>items.filter(item=>item.id!==row.id))}>Remove</Button>
        </div>)}
        <Button type="button" size="sm" variant="secondary"
          onClick={()=>setRows(items=>[...items,{id:`extra-${Date.now()}`,lotId:"",fromNodeId:warehouseNodeId,quantity:1}])}>Add another lot</Button>
      </div>:<p className="field--full">
        By clicking <strong>Confirm delivered</strong>, you attest that the physical delivery occurred.
        An inventory reconciliation exception will remain open. No stock deduction or payment entry will be fabricated.
      </p>}
      {error&&<p className="form-error field--full" role="alert">{error}</p>}
    </div>
  </Modal>;
}
