"use client";

import {useRef,useState} from "react";
import {currentFirebaseSession} from "../../lib/firebase-auth-rest";
import {firebaseFunctionUrl} from "../../lib/firebase-functions";
import {useFirebaseSessionOptional} from "../../lib/firebase-session-context";
import {useWorkspace} from "../../lib/workspace-context";

export function SendCustomerInvoice({invoiceId,orderId,invoiceNumber}:{invoiceId:string;orderId:string;invoiceNumber:string}){
  const {currentUser}=useWorkspace();
  const firebase=useFirebaseSessionOptional();
  const [busy,setBusy]=useState(false);
  const [feedback,setFeedback]=useState("");
  const pending=useRef<string|null>(null);
  const locked=useRef(false);
  const allowed=Boolean(firebase?.session&&firebase.status==="ready"&&currentUser&&["Administrator","Sales Manager","Sales Representative"].includes(currentUser.role));
  const send=async()=>{
    if(!allowed||locked.current)return;
    if(!window.confirm("Email invoice "+invoiceNumber+" to the customer billing address on record?"))return;
    locked.current=true;setBusy(true);setFeedback("");
    const requestId=pending.current??crypto.randomUUID();
    pending.current=requestId;
    try{
      const session=await currentFirebaseSession();
      if(!session||session.uid!==firebase?.session?.uid)throw new Error("Sign in again to send the invoice.");
      const response=await fetch(firebaseFunctionUrl("sendCustomerInvoice"),{
        method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+session.idToken},
        body:JSON.stringify({invoiceId,orderId,requestId}),
      });
      const result=await response.json().catch(()=>null) as {ok?:boolean;message?:string;outboxId?:string;status?:string}|null;
      if(!response.ok||!result?.ok||!result.outboxId)throw new Error(result?.message??"Invoice send could not be confirmed.");
      pending.current=null;
      setFeedback("Invoice email request recorded. Status: "+(result.status||"Unknown")+". This is not proof of inbox delivery.");
    }catch(error){setFeedback(error instanceof Error?error.message:"Send not confirmed. Retry the same request.");}
    finally{locked.current=false;setBusy(false);}
  };
  return <div><button type="button" className="prototype-secondary-action" disabled={!allowed||busy} onClick={()=>void send()}>{busy?"Requesting email…":"Send invoice"}</button>{feedback&&<p role="status" className="prototype-note">{feedback}</p>}</div>;
}
