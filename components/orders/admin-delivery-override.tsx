"use client";

import {useEffect,useState} from "react";
import {useWorkspace} from "../../lib/workspace-context";
import {useFirebaseSessionOptional} from "../../lib/firebase-session-context";
import {firebaseFunctionUrl} from "../../lib/firebase-functions";
import type {Order} from "../../lib/types";
import {Button,Field,Modal} from "../ui";

type Props={order:Order|null;onClose:()=>void;onSaved:(message:string,orderId:string)=>void};

/** Confirm the entire order and let the server post exact inventory movements. */
export function AdminDeliveryOverride({order,onClose,onSaved}:Props){
  const {currentUser}=useWorkspace();
  const firebase=useFirebaseSessionOptional();
  const [performedBy,setPerformedBy]=useState("");
  const [note,setNote]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  useEffect(()=>{
    if(!order)return;
    const timer=window.setTimeout(()=>{
      setPerformedBy("");setNote("");setError("");
    },0);
    return()=>window.clearTimeout(timer);
  },[order?.id]);

  const close=()=>{if(!busy)onClose();};
  const submit=async()=>{
    if(busy||currentUser?.role!=="Administrator"||!firebase?.session?.idToken||!order)return;
    if(!performedBy.trim()||note.trim().length<5){
      setError("Enter who delivered the order and a short delivery note.");
      return;
    }
    setBusy(true);
    setError("");
    try{
      const response=await fetch(firebaseFunctionUrl("adminDeliveryOverride"),{
        method:"POST",
        headers:{"content-type":"application/json",
          authorization:`Bearer ${firebase.session.idToken}`},
        body:JSON.stringify({
          orderId:order.id,performedBy:performedBy.trim(),reason:note.trim(),
        }),
      });
      const result=await response.json().catch(()=>null) as
        {ok?:boolean;message?:string;movementIds?:string[]}|null;
      if(!response.ok||result?.ok!==true){
        setError(result?.message??"Delivery was not confirmed. Check the order before retrying.");
        return;
      }
      onSaved("Delivered. Inventory updated.",order.id);
      onClose();
    }catch(error){
      setError(error instanceof Error?error.message:"Delivery could not be confirmed.");
    }finally{
      setBusy(false);
    }
  };

  if(currentUser?.role!=="Administrator")return null;
  return <Modal open={Boolean(order)} title={`Confirm delivery · ${order?.number??""}`}
    description="Completes the full order and posts its inventory automatically."
    onClose={close} footer={<>
      <Button type="button" variant="ghost" disabled={busy} onClick={close}>Cancel</Button>
      <Button type="button" disabled={busy||!firebase?.session?.idToken}
        onClick={()=>void submit()}>{busy?"Saving…":"Mark delivered"}</Button>
    </>}>
    <div className="form-grid">
      <Field label="Delivered by" className="field--full">
        <input required value={performedBy} onChange={event=>setPerformedBy(event.target.value)}
          placeholder="Name or customer pickup"/>
      </Field>
      <Field label="Note" className="field--full">
        <textarea required rows={2} maxLength={500} value={note}
          onChange={event=>setNote(event.target.value)}
          placeholder="Delivery location or confirmation"/>
      </Field>
      {error&&<p className="form-error field--full" role="alert">{error}</p>}
    </div>
  </Modal>;
}
