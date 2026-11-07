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
import {Button} from "../ui";

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
  const [query,setQuery]=useState("");
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
  const listed=orders.filter(order=>[order.number,scope.accounts.find(a=>a.id===order.accountId)?.name??"",order.status].join(" ").toLowerCase().includes(query.toLowerCase()));
  const readyOrders=orders.filter(order=>order.status==="Approved").length;
  const deliveredOrders=orders.filter(order=>order.status==="Delivered").length;
  return <div className="prototype-self-delivery">
    <header className="prototype-heading"><h1>My Self-Deliveries</h1><p>Pick up and deliver your own approved orders through the existing Momentum server-verified fulfillment process.</p></header>
    <div className="prototype-metrics">
      <div><small>Eligible assigned orders</small><strong>{orders.length}</strong></div>
      <div><small>Approved, not yet completed</small><strong>{readyOrders}</strong></div>
      <div><small>Marked delivered</small><strong>{deliveredOrders}</strong></div>
    </div>
    <section className="prototype-panel">
      <h2>My approved orders</h2>
      <p className="prototype-note">Only orders credited to your employee identity are eligible. A completed order cannot be reclaimed. This list does not authorize a delivery until the server confirms each step.</p>
      <label className="prototype-search"><input aria-label="Search my self-delivery orders" placeholder="Find order number, customer or status" value={query} onChange={event=>setQuery(event.target.value)}/></label>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Order</th><th>Customer location</th><th>Cases</th><th>Order status</th><th>Action</th></tr></thead><tbody>
        {listed.map(order=><tr key={order.id}>
          <td>{order.number}</td><td>{scope.accounts.find(a=>a.id===order.accountId)?.name??"Restricted"}</td>
          <td>{order.cases}</td><td>{order.status}</td>
          <td><button type="button" className="prototype-link" aria-current={selectedId===order.id?"true":undefined} disabled={busy} onClick={()=>selectOrder(order.id)}>{selectedId===order.id?"Selected":"Review delivery"}</button></td>
        </tr>)}
      </tbody></table></div>
      {!listed.length&&<p className="prototype-empty">No eligible orders match this search. Approved orders appear after Administrator approval.</p>}
    </section>
    <section className="prototype-panel">
      <h2>Verified delivery workflow</h2>
      <p className="prototype-note">Required sequence: claim → reserve exact SKU mix → load into your custody → depart → recipient signature → reconcile inventory and order in cloud.</p>
      {!firebase?.session?.idToken&&<p className="prototype-note" role="alert">A signed-in Firebase session is required for real self-delivery. No offline or browser-only delivery can be completed here.</p>}
      {!selected&&<p className="prototype-empty">Select one of your approved orders above to see its server-confirmed delivery state.</p>}
      {selected&&<div className="rep-self-delivery">
        <div className="rep-self-delivery__status">
          <strong>{selected.number}</strong>
          <span>Order: {orderStatus??"Checking…"} · Delivery: {record?status:"Checking cloud…"}</span>
          <Button type="button" size="sm" variant="secondary" icon={<RefreshCcw size={14}/>} disabled={busy||!firebase?.session?.idToken} onClick={()=>{
            setRecord(null);setMessage("");
            void getState(selected.id).then(setRecord).catch(error=>setMessage(error instanceof Error?error.message:"Could not refresh."));
          }}>Verify cloud status</Button>
        </div>
        {step==="complete"&&<div className="rep-self-delivery__signature">
          <p>Have the customer or authorized recipient sign before completing this order.</p>
          <DeliverySignaturePad strokes={strokes} onChange={setStrokes}/>
          <label htmlFor="rep-self-recipient">Recipient printed name</label>
          <input id="rep-self-recipient" value={recipientName} maxLength={120} onChange={event=>setRecipientName(event.target.value)} placeholder="Name of person accepting delivery"/>
        </div>}
        {step&&<Button type="button" disabled={busy||(!firebase?.session?.idToken)||
          (step==="complete"&&(!recipientName.trim()||!strokes.some(stroke=>stroke.length>=2)))}
          icon={step==="claim"?<PackageCheck size={15}/>:step==="pack"?<PackageCheck size={15}/>:step==="load"?<PackageOpen size={15}/>:step==="depart"?<Truck size={15}/>:<CheckCircle2 size={15}/>}
          onClick={()=>void send(step)}>{busy?"Confirming cloud save…":stages[step]}</Button>}
        {status==="Delivered"&&record?.cloudConfirmed&&
          <p className="rep-self-delivery__complete"><CheckCircle2 size={16}/> Delivery completed with cloud-verified order and inventory posting. Email delivery is verified separately.</p>}
      </div>}
      {message&&<p className="form-notice" role="status">{message}</p>}
    </section>
  </div>;
}
