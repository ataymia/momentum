"use client";

/**
 * Controlled shipment operations on the existing delivery engine.
 * No duplicate dispatch or inventory ledger is created here. Mutation is
 * disabled whenever a Firebase session or connected persistence is present.
 */
import {useRef,useState} from "react";
import {assignedDelivery,type AssignedDeliveryAction} from "../../lib/firebase-assigned-delivery";
import {AlertTriangle,CheckCircle2,LockKeyhole,Truck} from "lucide-react";
import {useDelivery} from "../../lib/delivery-context";
import type {DeliveryTask} from "../../lib/delivery-engine";
import {useFirebaseSessionOptional} from "../../lib/firebase-session-context";
import {momentumStorage} from "../../lib/persistence";
import {useRuntimeMode} from "../../lib/runtime-mode";
import {useWorkspace} from "../../lib/workspace-context";
import {canMutatePrototypeFulfillment,nextShipmentStep,shipmentStepDescription} from "../../lib/fulfillment-prototype-policy";
import type {Order} from "../../lib/types";

function useDeliveryDemoAccess(){
  const {currentUser}=useWorkspace();
  const mode=useRuntimeMode();
  const session=useFirebaseSessionOptional();
  return canMutatePrototypeFulfillment({
    isDemo:mode.isDemo,persistenceMode:momentumStorage.mode(),
    hasFirebaseSession:Boolean(session),role:currentUser?.role,
  });
}

function DemoAccessNote({available,connected}:{available:boolean;connected:boolean}){
  return <div className="prototype-guard" role="note"><LockKeyhole size={18}/>
    <p>{connected?"Company fulfillment. Order, driver, inventory and custody are validated together on the server.":available
      ?"Demonstration-only controls. Transactions change local test records; no live customer order or stock is changed."
      :"Read-only. Operational changes are disabled against company data. Recreate these steps in a disconnected local demo to evaluate the interface."}</p>
  </div>;
}

export function ShipmentWorkflowControls({order,task}:{order:Order;task?:DeliveryTask}){
  const {data,currentUser}=useWorkspace();
  const {assignDelivery,cancelDelivery,prepareDelivery,markLoaded,startDelivery,addDeliveryNote}=useDelivery();
  const demo=useDeliveryDemoAccess();
  const firebase=useFirebaseSessionOptional();
  const connected=momentumStorage.mode()==="firestore"&&firebase?.status==="ready"&&firebase.session?.uid===currentUser?.id&&firebase.access?.accountState==="Active"&&["Administrator","Operations"].includes(currentUser?.role??"");
  const available=demo||connected;
  const requestLock=useRef(false);
  const [driverId,setDriverId]=useState("");
  const [confirmation,setConfirmation]=useState(false);
  const [reason,setReason]=useState("");
  const [note,setNote]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [releaseOpen,setReleaseOpen]=useState(false);
  const [noteOpen,setNoteOpen]=useState(false);
  const step=nextShipmentStep(order,task);
  const drivers=data.users.filter(user=>user.role==="Delivery Driver"&&user.employmentStatus!=="Separated")
    .sort((a,b)=>a.name.localeCompare(b.name));
  const canAct=available&&!busy&&Boolean(currentUser);
  const driver=drivers.find(user=>user.id===driverId);
  const labels:{[key:string]:string}={
    assign:"Assign driver",
    reserve:"Reserve full order",
    load:"Confirm loading",
    depart:"Confirm departure",
  };
  const canAdvance=["assign","reserve","load","depart"].includes(step) &&
    (step!=="assign" || Boolean(driver)) && confirmation && canAct;

  const send=async(action:AssignedDeliveryAction)=>{
    if(!connected||!firebase?.session||requestLock.current)return false;
    requestLock.current=true;setBusy(true);setMessage("");
    try{const result=await assignedDelivery(firebase.session,action);setMessage(result.refreshed?"Saved and confirmed by the company server.":"Server saved the change; local refresh is unconfirmed. Refresh before repeating.");return true;}
    catch(error){setMessage(error instanceof Error?error.message:"Delivery change not confirmed.");return false;}
    finally{requestLock.current=false;setBusy(false);}
  };
  const advance=async()=>{
    if(!canAdvance)return;
    if(connected){if(await send({orderId:order.id,action:step==="assign"?"assign":step==="reserve"?"pack":step==="load"?"load":"depart",...(step==="assign"?{driverId}:{})}))setConfirmation(false);return;}
    setBusy(true);
    setMessage("");
    try{
      const result=step==="assign"?assignDelivery(order.id,driverId):
        step==="reserve"?prepareDelivery(order.id):
        step==="load"?markLoaded(order.id):
        startDelivery(order.id);
      if(!result.ok){setMessage(result.message??"The canonical delivery engine declined the transition.");return;}
      setConfirmation(false);
      setMessage("Local demonstration step recorded. Verify the updated task and inventory evidence before continuing.");
    }catch{
      setMessage("The transition could not be verified. Inspect the local record before repeating it.");
    }finally{setBusy(false);}
  };

  const release=async()=>{
    if(!available||!task||task.status!=="Accepted"||reason.trim().length<8||busy)return;
    if(connected){if(await send({orderId:order.id,action:"release",reason:reason.trim()})){setReleaseOpen(false);setReason("");}return;}
    setBusy(true);setMessage("");
    try{
      const result=cancelDelivery(order.id,reason.trim());
      if(!result.ok){setMessage(result.message??"The delivery assignment could not be released.");return;}
      setReleaseOpen(false);setReason("");
      setMessage("Assignment released in local demonstration records. Existing recorded custody was not rewritten.");
    }catch{setMessage("Release not confirmed. Inspect the local task before retrying.");}
    finally{setBusy(false);}
  };
  const saveNote=async()=>{
    if(!canAct||!task||note.trim().length<3)return;
    if(connected){if(await send({orderId:order.id,action:"note",note:note.trim()})){setNote("");setNoteOpen(false);}return;}
    const result=addDeliveryNote(order.id,note.trim());
    if(result.ok){setNote("");setNoteOpen(false);setMessage("Local delivery note added to task history.");}
    else setMessage(result.message??"Note rejected by delivery engine.");
  };

  const confirmText=step==="assign"?"I have confirmed the destination and selected the intended delivery driver":
    step==="reserve"?"I have reviewed the full order SKU mix and inventory availability":
    step==="load"?"I have verified that all ordered cases are physically loaded into the assigned driver's custody":
    step==="depart"?"I have confirmed the assigned vehicle has all cases before marking this delivery in transit":"";
  return <section className="prototype-panel prototype-fulfillment-workflow">
    <h2>Fulfillment workflow</h2>
    <div className="prototype-work-list"><strong>Next supported step</strong><span>{shipmentStepDescription[step]}</span></div>
    <DemoAccessNote available={available} connected={Boolean(connected)}/>
    {step==="assign"&&<div className="prototype-fulfillment-field">
      <label>Eligible delivery driver
        <select aria-label={"Assign driver for "+order.number} value={driverId} onChange={e=>{setDriverId(e.target.value);setConfirmation(false);}}>
          <option value="">Choose an active delivery driver</option>
          {drivers.map(user=><option key={user.id} value={user.id}>{user.name} · {user.id}</option>)}
        </select>
      </label>
      {!drivers.length&&<p className="prototype-note">No active Delivery Driver profiles were found. Do not substitute a sales representative.</p>}
    </div>}
    {step==="recipient-proof"&&<p className="prototype-note"><AlertTriangle size={15}/> Recipient signature and inventory posting must use the authorized assigned-driver workflow. No completion, collection or fabricated proof is available here.</p>}
    {step==="complete"&&<p className="prototype-note"><CheckCircle2 size={16}/> The task is marked Delivered. Review its signature and corresponding inventory posting independently. Payment settlement is not inferred.</p>}
    {step==="review"&&<p className="prototype-note">This combination of order and delivery states cannot advance through this panel. Inspect the order, task history and custody ledger.</p>}
    {labels[step]&&<>
      <label className="prototype-fulfillment-confirm"><input type="checkbox" checked={confirmation} disabled={!available} onChange={e=>setConfirmation(e.target.checked)}/>{confirmText}</label>
      <button type="button" className="prototype-primary-action" disabled={!canAdvance} onClick={advance}>
        <Truck size={16}/>{labels[step]}
      </button>
    </>}
    {task?.status==="Accepted"&&<>
      <div className="prototype-fulfillment-secondary-actions">
        <button type="button" className="prototype-secondary-action" disabled={!available} onClick={()=>setReleaseOpen(v=>!v)}>Release assignment</button>
      </div>
      {releaseOpen&&<div className="prototype-fulfillment-field">
        <label>Release reason
          <textarea aria-label="Delivery assignment release reason" value={reason} onChange={e=>setReason(e.target.value)} rows={3} placeholder="Record the specific reason for releasing this assignment"/>
        </label>
        <button type="button" disabled={!available||reason.trim().length<8||busy} onClick={release}>{connected?"Confirm release":"Confirm release in local demo"}</button>
      </div>}
    </>}
    {task&&task.status!=="Cancelled"&&<>
      <div className="prototype-fulfillment-secondary-actions">
        <button type="button" className="prototype-secondary-action" disabled={!available} onClick={()=>setNoteOpen(v=>!v)}>Add operational note</button>
      </div>
      {noteOpen&&<div className="prototype-fulfillment-field">
        <label>Delivery note
          <textarea aria-label="Delivery operational note" value={note} onChange={e=>setNote(e.target.value)} rows={3} placeholder="Describe an exception, customer instruction, or custody concern"/>
        </label>
        <button type="button" disabled={!canAct||note.trim().length<3} onClick={saveNote}>{connected?"Record operational note":"Record note in local demo"}</button>
      </div>}
    </>}
    {message&&<p role="status" className="prototype-fulfillment-result">{message}</p>}
    <p className="prototype-note">This panel does not allocate stock based on a visual status, impersonate a driver, capture signatures, record money, or override period locks. Those decisions remain with their original engines.</p>
  </section>;
}
