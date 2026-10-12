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
type Props={order:Order|null;onClose:()=>void;onSaved:(message:string)=>void};
const localNow=()=>{
  const value=new Date();
  return new Date(value.getTime()-value.getTimezoneOffset()*60000).toISOString().slice(0,16);
};
export function AdminDeliveryOverride({order,onClose,onSaved}:Props){
  const{currentUser,data}=useWorkspace();
  const{ledger}=useInventoryLedger();
  const firebase=useFirebaseSessionOptional();
  const[date,setDate]=useState("");
  const[performedBy,setPerformedBy]=useState("");
  const[reason,setReason]=useState("");
  const[rows,setRows]=useState<LotRow[]>([]);
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState("");
  const lots=data.inventory.filter((lot)=>lot.status!=="Quality hold");
  const sources=ledger.nodes.filter((node)=>node.active&&["Warehouse","Vehicle","Bin","Employee custody"].includes(node.type));

  useEffect(()=>{
    if(!order)return;
    const timer=window.setTimeout(()=>{
      setDate(localNow());setPerformedBy("");setReason("");setError("");
      setRows(orderLinesFor(order).map((line,index)=>({
        id:`initial-${index}`,lotId:matchingInventoryLots(lots,line.product)[0]?.id??"",
        fromNodeId:warehouseNodeId,quantity:line.cases,
      })));
    },0);
    return()=>window.clearTimeout(timer);
    // Reset only when switching the order, not as stock records sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[order?.id]);

  const update=(id:string,patch:Partial<LotRow>)=>
    setRows((items)=>items.map((item)=>item.id===id?{...item,...patch}:item));
  const close=()=>{if(!busy)onClose();};
  const submit=async()=>{
    if(busy||currentUser?.role!=="Administrator"||!firebase?.session?.idToken||!order)return;
    if(!performedBy.trim()||reason.trim().length<5||!date||!rows.length||
      rows.some((row)=>!row.lotId||!row.fromNodeId||!Number.isInteger(row.quantity)||row.quantity<1)){
      setError("Enter who delivered the cases, when, why, and each lot and quantity.");return;
    }
    setBusy(true);setError("");
    try{
      const keys=[COMMERCIAL_KEY,INVENTORY_LEDGER_STORAGE_KEY,DELIVERY_STORAGE_KEY];
      for(const key of keys){
        const result=await momentumStorage.flushAndConfirm(key);
        if(!result.ok){setError("Unsaved work must sync before the override: "+(result.message??"Please retry."));return;}
      }
      const deliveredAt=new Date(date).toISOString();
      const response=await fetch(firebaseFunctionUrl("adminDeliveryOverride"),{
        method:"POST",headers:{"content-type":"application/json",
          authorization:`Bearer ${firebase.session.idToken}`},
        body:JSON.stringify({
          orderId:order.id,deliveredAt,reason:reason.trim(),
          performedBy:performedBy.trim(),
          allocations:rows.map(({lotId,fromNodeId,quantity})=>({lotId,fromNodeId,quantity})),
        }),
      });
      const result=await response.json().catch(()=>null) as {ok?:boolean;message?:string}|null;
      if(!response.ok||result?.ok!==true){
        setError(result?.message??"The server did not confirm this delivery. Do not repeat it until the order is checked.");
        return;
      }
      const refreshed=await momentumStorage.refreshKeys(keys);
      onSaved(refreshed.ok?
        "Delivery completed by administrative override. Payment status remains separate.":
        "Override was saved on the server, but this device has not refreshed yet. Check Sync queue: "+
        (refreshed.message??"Refresh again."));
      onClose();
    }catch(e){
      setError(e instanceof Error?e.message:"The override request failed. Check the order before trying again.");
    }finally{setBusy(false);}
  };
  if(currentUser?.role!=="Administrator")return null;
  return <Modal open={Boolean(order)} title="Admin delivery override"
    description="For physical deliveries or customer pickups made outside the driver route. Records actual inventory movement and a permanent audit record. No payment is recorded."
    wide onClose={close} footer={<>
      <Button type="button" variant="ghost" disabled={busy} onClick={close}>Cancel</Button>
      <Button type="button" disabled={busy||!firebase?.session?.idToken} onClick={()=>void submit()}>{busy?"Saving…":"Record delivery"}</Button>
    </>}>
    <div className="form-grid">
      <Field label="Actual delivery date and time"><input type="datetime-local" required value={date} onChange={(event)=>setDate(event.target.value)}/></Field>
      <Field label="Who delivered or collected it"><input required value={performedBy} onChange={(event)=>setPerformedBy(event.target.value)} placeholder="Person or customer pickup"/></Field>
      <Field label="Reason and delivery notes" className="field--full"><textarea required value={reason} onChange={(event)=>setReason(event.target.value)} placeholder="Explain how and where the product was delivered"/></Field>
      <div className="field--full"><strong>Inventory delivered</strong><p>Use the actual lot and stock source. Each product&apos;s case total must match the order.</p></div>
      {rows.map((row,index)=><div key={row.id} className="field--full"
        style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))",gap:9,alignItems:"end"}}>
        <Field label={`Lot ${index+1}`}><select required value={row.lotId} onChange={(event)=>update(row.id,{lotId:event.target.value})}>
          <option value="">Choose lot</option>{lots.map((lot)=><option key={lot.id} value={lot.id}>{lot.lotCode} · {lot.product}</option>)}
        </select></Field>
        <Field label="Stock source"><select required value={row.fromNodeId} onChange={(event)=>update(row.id,{fromNodeId:event.target.value})}>
          <option value="">Choose source</option>{sources.map((node)=><option key={node.id} value={node.id}>{node.name}{row.lotId?` (${nodeLotBalance(ledger,node.id,row.lotId)} cases)`:""}</option>)}
        </select></Field>
        <Field label="Cases"><input type="number" min="1" step="1" required value={row.quantity} onChange={(event)=>update(row.id,{quantity:Number(event.target.value)})}/></Field>
        <Button type="button" size="sm" variant="ghost" disabled={rows.length<2} onClick={()=>setRows((items)=>items.filter((item)=>item.id!==row.id))}>Remove</Button>
      </div>)}
      <Button type="button" variant="secondary" size="sm" onClick={()=>setRows((items)=>[...items,{id:`extra-${Date.now()}-${Math.random()}`,lotId:"",fromNodeId:warehouseNodeId,quantity:1}])}>Add lot</Button>
      {error&&<p className="form-error field--full" role="alert">{error}</p>}
    </div>
  </Modal>;
}
