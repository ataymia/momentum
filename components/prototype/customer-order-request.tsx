"use client";
import {useRef,useState,type FormEvent} from "react";
import {currentFirebaseSession} from "../../lib/firebase-auth-rest";
import {firebaseFunctionUrl} from "../../lib/firebase-functions";
import type {CustomerFinanceSnapshot} from "../../functions/src/customer-commerce-projection";

type Account=CustomerFinanceSnapshot["accounts"][number];
const products=[
 ["ge-original-250ml-24","Golden Eagle Original"],
 ["ge-sugarfree-250ml-24","Golden Eagle SugarFree"],
 ["ge-tropical-250ml-24","Golden Eagle Tropical"],
 ["ge-red-250ml-24","Golden Eagle RED"],
 ["ge-blue-zero-250ml-24","Golden Eagle Blue Zero"],
 ["ge-strawberry-250ml-24","Golden Eagle Strawberry"],
] as const;

export function CustomerOrderRequest({accounts,onSubmitted}:{accounts:Account[];onSubmitted?:()=>void}){
 const [accountId,setAccountId]=useState(accounts[0]?.id??"");
 const [skuId,setSkuId]=useState<string>(products[0][0]);
 const [cases,setCases]=useState("10");
 const [note,setNote]=useState("");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [receipt,setReceipt]=useState<{id:string;status:string}|null>(null);
 const pending=useRef<{fingerprint:string;id:string}|null>(null);
 const clear=()=>{setMessage("");setReceipt(null);pending.current=null;};
 const submit=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  if(busy)return;
  if(!accounts.some(a=>a.id===accountId)){setMessage("Choose an authorized location.");return;}
  const quantity=Number(cases);
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>10000){
   setMessage("Enter 1 to 10,000 whole cases.");return;
  }
  const draft={accountId,lines:[{skuId,cases:quantity}],note:note.trim()};
  const fingerprint=JSON.stringify(draft);
  if(!pending.current||pending.current.fingerprint!==fingerprint)
   pending.current={fingerprint,id:crypto.randomUUID().replaceAll("-","")};
  setBusy(true);setMessage("");
  try{
   const session=await currentFirebaseSession();
   if(!session)throw new Error("Your session expired. Sign in again.");
   const post=async(endpoint:string,body:unknown)=>{
    const response=await fetch(firebaseFunctionUrl(endpoint),{
     method:"POST",headers:{"content-type":"application/json",
      authorization:"Bearer "+session.idToken},
     body:JSON.stringify(body),cache:"no-store",
    });
    const data=await response.json().catch(()=>null) as {
     ok?:boolean;message?:string;intakeId?:string;status?:string;
     record?:{id?:string;accountId?:string;requestedByUid?:string;status?:string};
    }|null;
    if(!response.ok||data?.ok!==true)
     throw new Error(data?.message||"Sales request could not be confirmed.");
    return data;
   };
   const sent=await post("submitOrderIntake",{draft,requestId:pending.current.id});
   if(!sent.intakeId||!sent.status)throw new Error("Incomplete receipt. Check sales requests before retrying.");
   const checked=await post("reviewOrderIntake",{intakeId:sent.intakeId});
   if(checked.record?.id!==sent.intakeId||checked.record?.accountId!==accountId||
     checked.record?.requestedByUid!==session.uid)
    throw new Error("Request submitted but source readback was not verified.");
   pending.current=null;
   setReceipt({id:sent.intakeId,status:checked.record.status??sent.status});
   onSubmitted?.();
   setMessage("Request received for review. No order, stock reservation or payment was created.");
  }catch(error){
   setMessage(error instanceof Error?error.message:"Request not confirmed. Check with sales before retrying.");
  }finally{setBusy(false);}
 };
 if(!accounts.length)return null;
 return <section className="prototype-panel" aria-label="Customer order request">
  <h2>Request product</h2>
  <form className="prototype-order-form" onSubmit={e=>void submit(e)}>
   <div className="form-grid">
    <label>Business location<select value={accountId} onChange={e=>{setAccountId(e.target.value);clear();}}>
     {accounts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.location}</option>)}
    </select></label>
    <label>Product<select value={skuId} onChange={e=>{setSkuId(e.target.value);clear();}}>
     {products.map(([id,title])=><option key={id} value={id}>{title} · 24 cans per case</option>)}
    </select></label>
    <label>Cases<input required type="number" min="1" max="10000" step="1"
     value={cases} onChange={e=>{setCases(e.target.value);clear();}}/></label>
    <label>Notes<textarea value={note} maxLength={1000} onChange={e=>{setNote(e.target.value);clear();}}/></label>
   </div>
   <p className="prototype-note">Sales will confirm approved pricing, availability and delivery terms before creating an order. This request does not charge you.</p>
   <button type="submit" disabled={busy||!accountId}>{busy?"Submitting…":"Submit request to sales"}</button>
  </form>
  {message&&<p role="status">{message}</p>}
  {receipt&&<p role="status">Request {receipt.id} · {receipt.status}</p>}
 </section>;
}
