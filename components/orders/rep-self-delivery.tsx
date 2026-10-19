"use client";

import {useEffect,useMemo,useState} from "react";
import {CheckCircle2,PackageCheck,PackageOpen,RefreshCcw,Truck} from "lucide-react";
import type {Order} from "../../lib/types";
import type {DeliverySignaturePoint} from "../../lib/delivery-engine";
import {COMMERCIAL_KEY,useWorkspace} from "../../lib/workspace-context";
import {useFirebaseSessionOptional} from "../../lib/firebase-session-context";
import {firebaseFunctionUrl} from "../../lib/firebase-functions";
import {momentumStorage} from "../../lib/persistence";
import {DeliverySignaturePad} from "../delivery/signature-pad";
import {Button,Section} from "../ui";

type Stage="Unclaimed"|"Accepted"|"Loaded"|"In transit"|"Delivered";
type Receipt={ok?:boolean;message?:string;orderStatus?:string;taskStatus?:Stage;cloudConfirmed?:boolean;replayed?:boolean};
type Step="claim"|"pack"|"load"|"depart"|"complete";
const stages:Record<Step,string>={
  claim:"Claim self-delivery",pack:"Pack / reserve exact order",
  load:"Confirm load into my custody",depart:"Start delivery",
  complete:"Save signature & complete",
};

/** Self-delivery never writes the shared inventory or delivery Firestore arrays from the browser. */
export function RepSelfDelivery(){
  const {currentUser,scope}=useWorkspace();
  const firebase=useFirebaseSessionOptional();
  const orders=useMemo(()=>currentUser?.role==="Sales Representative"?
    scope.orders.filter(order=>order.ownerId===currentUser.id&&
      ["Approved","Allocated","Out for delivery","Delivered"].includes(order.status)):[],
  [scope.orders,currentUser]);
  const [selectedId,setSelectedId]=useState("");
  const [record,setRecord]=useState<Receipt|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [strokes,setStrokes]=useState<DeliverySignaturePoint[][]>([]);
  const [recipientName,setRecipientName]=useState("");
  const selected:Order|undefined=orders.find(order=>order.id===selectedId);
  const getState=async(orderId:string,signal?:AbortSignal):Promise<Receipt>=>{
    if(!firebase?.session?.idToken)throw new Error("A signed-in Firebase session is required.");
    const response=await fetch(firebaseFunctionUrl("repSelfDelivery"),{
      method:"POST",headers:{"content-type":"application/json",
        authorization:"Bearer "+firebase.session.idToken},
      body:JSON.stringify({orderId,action:"status"}),signal,
    });
    const result=await response.json().catch(()=>null) as Receipt|null;
    if(!response.ok||result?.ok!==true)throw new Error(result?.message||"Could not verify self-delivery state.");
    return result;
  };
  useEffect(()=>{
    if(!selectedId||!orders.some(order=>order.id===selectedId)||!firebase?.session?.idToken)return;
    const controller=new AbortController();
    // Set state only after a server read, never assume a client task was saved.
    void getState(selectedId,controller.signal)
      .then(next=>{if(!controller.signal.aborted){setRecord(next);setMessage("");}})
      .catch(error=>{if(!controller.signal.aborted){setRecord(null);setMessage(error instanceof Error?error.message:"Could not verify delivery.");}});
    return()=>controller.abort();
    // Token is a stable signed-in session, refreshed on re-authentication.
  },[selectedId,firebase?.session?.idToken,orders]);
  const selectOrder=(id:string)=>{
    if(busy)return;
    setSelectedId(id);setRecord(null);setMessage("");
    setStrokes([]);setRecipientName("");
  };
  const send=async(step:Step)=>{
    if(busy||!selected||!firebase?.session?.idToken||record?.cloudConfirmed!==true)return;
    if(step==="complete"&&(!strokes.some(stroke=>stroke.length>=2)||!recipientName.trim())){
      setMessage("Have the recipient sign and enter their printed name first.");return;
    }
    setBusy(true);setMessage("Saving and verifying "+selected.number+" with Momentum cloud…");
    try{
      const response=await fetch(firebaseFunctionUrl("repSelfDelivery"),{
        method:"POST",headers:{"content-type":"application/json",
          authorization:"Bearer "+firebase.session.idToken},
        body:JSON.stringify({orderId:selected.id,action:step,
          ...(step==="complete"?{signature:{strokes,recipientName:recipientName.trim()}}:{})}),
      });
      const result=await response.json().catch(()=>null) as Receipt|null;
      if(!response.ok||result?.ok!==true||result.cloudConfirmed!==true)
        throw new Error(result?.message||"The cloud has not confirmed this action.");
      // Read back authoritative server state before showing any success.
      const confirmed=await getState(selected.id);
      if(confirmed.orderStatus!==result.orderStatus||
        confirmed.taskStatus!==result.taskStatus||confirmed.cloudConfirmed!==true)
        throw new Error("The server's delivery and order records did not match after saving. Do not repeat the action; ask Operations to reconcile.");
      setRecord(confirmed);
      if(step==="complete"){
        setStrokes([]);setRecipientName("");
        setMessage("Signed self-delivery verified in Momentum cloud. Invoice email is queued separately and may arrive later.");
      }else setMessage(selected.number+" updated and verified in Momentum cloud.");
      // The server owns all writes. Refresh only, never stage stale client records.
      void momentumStorage.refreshKeys([COMMERCIAL_KEY]).catch(()=>undefined);
    }catch(error){
      setMessage((error instanceof Error?error.message:"Cloud verification failed.")+
        " Check this order's current state before retrying. Do not duplicate an inventory or delivery action.");
      try{setRecord(await getState(selected.id));}catch{setRecord(null);}
    }finally{setBusy(false);}
  };
  if(currentUser?.role!=="Sales Representative")return null;
  const status=record?.taskStatus??"Unclaimed";
  const orderStatus=record?.orderStatus??selected?.status;
  let step:Step|null=null;
  if(selected&&record?.cloudConfirmed===true){
    if(status==="Unclaimed"&&orderStatus==="Approved")step="claim";
    else if(status==="Accepted"&&orderStatus==="Approved")step="pack";
    else if(status==="Accepted"&&orderStatus==="Allocated")step="load";
    else if(status==="Loaded"&&orderStatus==="Allocated")step="depart";
    else if(status==="In transit"&&orderStatus==="Out for delivery")step="complete";
  }
  return <Section title="My self-deliveries" description="Only your approved orders can be claimed. Warehouse stock, rep custody, customer signature and completed records are independently checked by the server.">
    <div className="rep-self-delivery">
      <label htmlFor="rep-self-order">Your approved orders</label>
      <select id="rep-self-order" value={selectedId} disabled={busy} onChange={event=>selectOrder(event.target.value)}>
        <option value="">Choose an order to self-deliver</option>
        {orders.map(order=><option key={order.id} value={order.id}>{order.number} · {scope.accounts.find(a=>a.id===order.accountId)?.name||"Account"} · {order.cases} cases</option>)}
      </select>
      {!orders.length&&<p>No eligible orders in your account scope. Submit an order and wait for Administrator approval first.</p>}
      {selected&&<div className="rep-self-delivery__status">
        <strong>{selected.number}</strong>
        <span>Order: {orderStatus??"Checking…"} · Delivery: {record?status:"Checking cloud…"}</span>
        <Button type="button" size="sm" variant="secondary" icon={<RefreshCcw size={14}/>} disabled={busy} onClick={()=>{
          setRecord(null);setMessage("");
          void getState(selected.id).then(setRecord).catch(error=>setMessage(error instanceof Error?error.message:"Could not refresh."));
        }}>Verify status</Button>
      </div>}
      {selected&&step==="complete"&&<div className="rep-self-delivery__signature">
        <p>Have the customer or authorized recipient sign before you complete delivery.</p>
        <DeliverySignaturePad strokes={strokes} onChange={setStrokes}/>
        <label htmlFor="rep-self-recipient">Recipient printed name</label>
        <input id="rep-self-recipient" value={recipientName} maxLength={120} onChange={event=>setRecipientName(event.target.value)} placeholder="Name of person accepting delivery"/>
      </div>}
      {selected&&step&&<Button type="button" disabled={busy||(!firebase?.session?.idToken)||
        (step==="complete"&&(!recipientName.trim()||!strokes.some(stroke=>stroke.length>=2)))}
        icon={step==="claim"?<PackageCheck size={15}/>:step==="pack"?<PackageCheck size={15}/>:step==="load"?<PackageOpen size={15}/>:step==="depart"?<Truck size={15}/>:<CheckCircle2 size={15}/>}
        onClick={()=>void send(step)}>{busy?"Confirming cloud save…":stages[step]}</Button>}
      {selected&&status==="Delivered"&&record?.cloudConfirmed&&
        <p className="rep-self-delivery__complete"><CheckCircle2 size={16}/> Delivery completed with cloud-verified order and inventory posting. Email delivery is verified separately.</p>}
      {message&&<p className="form-notice" role="status">{message}</p>}
    </div>
  </Section>;
}
