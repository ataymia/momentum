"use client";
import {useEffect,useState} from "react";
import {useWorkspace} from "../../lib/workspace-context";
import {useFirebaseSessionOptional} from "../../lib/firebase-session-context";
import {firebaseFunctionUrl} from "../../lib/firebase-functions";
import {listFirestoreCollection} from "../../lib/firebase-firestore-rest";
import {momentumStorage} from "../../lib/persistence";
import {COMMERCIAL_KEY} from "../../lib/workspace-context";
import {COMMERCE_STORAGE_KEY} from "../../lib/commerce-engine";
import {DELIVERY_STORAGE_KEY} from "../../lib/delivery-engine";
import {INVENTORY_LEDGER_STORAGE_KEY} from "../../lib/inventory-ledger";
import type {Order} from "../../lib/types";
import {Button,Modal,formatDate,formatMoney} from "../ui";

type ArchiveRecord={orderId:string;orderNumber:string;archivedAt:string;archivedBy:string;reason:string;
 testOnly:boolean;originalOrder:Order;tasks:unknown[];invoices:unknown[];approvals:unknown[];
 inventoryMovements:unknown[];payments:unknown[];policyVersion:number};
const keys=[COMMERCIAL_KEY,COMMERCE_STORAGE_KEY,DELIVERY_STORAGE_KEY,INVENTORY_LEDGER_STORAGE_KEY];
export function AdminOrderArchiveManager({order,onClose,onArchived,archiveListOpen,onCloseArchive}:{
 order:Order|null;onClose:()=>void;onArchived:(orderId:string)=>void;
 archiveListOpen:boolean;onCloseArchive:()=>void;
}){
 const {currentUser}=useWorkspace();
 const firebase=useFirebaseSessionOptional();
 const [reason,setReason]=useState("");
 const [confirmation,setConfirmation]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [archives,setArchives]=useState<ArchiveRecord[]>([]);
 const [archiveError,setArchiveError]=useState("");
 const [loading,setLoading]=useState(false);
 useEffect(()=>{
  if(!archiveListOpen||currentUser?.role!=="Administrator")return;
  let active=true;
  listFirestoreCollection<ArchiveRecord>("archivedOrders")
   .then(items=>{if(active){setArchives(items.sort((a,b)=>b.archivedAt.localeCompare(a.archivedAt)));setArchiveError("");}})
   .catch(()=>{if(active)setArchiveError("The Admin archive could not be loaded. Check your access and connection.");})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[archiveListOpen,currentUser?.role]);
 const archive=async()=>{
  if(!order||busy)return;
  if(reason.trim().length<12||confirmation!=="ARCHIVE"){
   setError("Explain the error in at least 12 characters and type ARCHIVE to confirm.");return;
  }
  if(!firebase?.session?.idToken){setError("An active Administrator session is required.");return;}
  setBusy(true);setError("");setNotice("");
  try{
   for(const key of keys){
    const flushed=await momentumStorage.flushAndConfirm(key);
    if(!flushed.ok)throw Error("Unconfirmed pending workspace changes: "+(flushed.message??key)+". Retry after cloud sync.");
   }
   const response=await fetch(firebaseFunctionUrl("archiveOrderWorkflow"),{
    method:"POST",headers:{"content-type":"application/json",
     authorization:"Bearer "+firebase.session.idToken},
    body:JSON.stringify({orderId:order.id,reason:reason.trim(),confirmation:"ARCHIVE"}),
   });
   const result=await response.json().catch(()=>null) as {ok?:boolean;message?:string}|null;
   if(!response.ok||!result?.ok)throw Error(result?.message??"Archive was not confirmed.");
   const refresh=await momentumStorage.refreshKeys(keys);
   if(!refresh.ok){
    setNotice("Order archived on the server, but this session could not refresh: "+(refresh.message??"Reload the application.")+
     " Do not repeat the operation.");
   }else{
    setReason("");setConfirmation("");
    onArchived(order.id);
   }
  }catch(e){setError(e instanceof Error?e.message:"Archive failed. Nothing was confirmed.");}
  finally{setBusy(false);}
 };
 if(currentUser?.role!=="Administrator")return null;
 return <>
  <Modal open={Boolean(order)} title={order?"Archive order "+order.number:"Archive order"}
   description="Administrator-only. Removes this order from operational queues, but preserves its original evidence in Admin deleted orders. Orders with real financial or physical activity are blocked pending reconciliation."
   onClose={()=>{if(!busy)onClose()}} footer={<>
    <Button variant="ghost" disabled={busy} onClick={onClose}>Close</Button>
    <Button variant="danger" disabled={busy||confirmation!=="ARCHIVE"||reason.trim().length<12} onClick={()=>void archive()}>{busy?"Verifying archive…":"Archive order"}</Button>
   </>}>
   {order&&<div className="form-grid">
    <p className="field--full"><strong>{order.number}</strong> · {order.status} · {order.cases} cases · {formatMoney(order.amount)} {order.testOnly?"· Internal QA":""}</p>
    <p className="field--full">This is not cancellation or permanent erasure. Audit evidence is preserved. Real deliveries, payments, credits, inventory postings and accounting entries require reconciliation first.</p>
    <label className="field--full">Why should this order leave the active platform?
     <textarea rows={3} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} placeholder="For example: duplicate order submitted during internal testing" />
    </label>
    <label className="field--full">Type ARCHIVE to confirm
     <input value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="off" />
    </label>
    {error&&<p className="form-error field--full" role="alert">{error}</p>}
    {notice&&<p className="form-notice field--full" role="status">{notice}</p>}
   </div>}
  </Modal>
  <Modal open={archiveListOpen} title="Admin deleted orders"
   description="Read-only order graveyard. Retains original order, approvals, invoice revisions and delivery history for audit. Only Administrators can open it."
   wide onClose={onCloseArchive} footer={<Button variant="ghost" onClick={onCloseArchive}>Close</Button>}>
   {loading&&<p>Loading Admin archive…</p>}
   {archiveError&&<p className="form-error" role="alert">{archiveError}</p>}
   {!loading&&!archiveError&&archives.length===0&&<p>No orders have been archived yet.</p>}
   <div className="company-request-list">
    {archives.map(item=><article key={item.orderId}>
     <div><strong>{item.orderNumber||item.originalOrder?.number||item.orderId}</strong>
      <p>{item.reason}</p>
      <small>Archived {formatDate(item.archivedAt,{month:"short",day:"numeric",year:"numeric"})} · {item.testOnly?"Internal QA":"Commercial"} · Original status: {item.originalOrder?.status??"Unknown"}</small>
      <p>{item.originalOrder?.cases??0} cases · {formatMoney(item.originalOrder?.amount??0)} · {item.tasks?.length??0} delivery records · {item.invoices?.length??0} invoice records · {item.approvals?.length??0} approvals</p>
      <details><summary>View preserved record and supporting evidence</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",maxHeight:440,overflowY:"auto"}}>{JSON.stringify(item,null,2)}</pre></details>
     </div>
    </article>)}
   </div>
  </Modal>
 </>;
}
