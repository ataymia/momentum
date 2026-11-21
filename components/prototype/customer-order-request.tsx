"use client";
import {useRef,useState,type FormEvent} from "react";
import {currentFirebaseSession} from "../../lib/firebase-auth-rest";
import {firebaseFunctionUrl} from "../../lib/firebase-functions";
import {GOLDEN_EAGLE_SKUS} from "../../lib/product-catalog";
import {MyConnectedOrderIntakes} from "../commerce/my-connected-order-intakes";
import {
 validateCustomerOrderDraft,type CustomerRequestLine,
} from "../../lib/customer-order-request-draft";
import type {CustomerFinanceSnapshot} from "../../functions/src/customer-commerce-projection";

type Account=CustomerFinanceSnapshot["accounts"][number];
type DraftLine=CustomerRequestLine&{key:number};
const catalog=GOLDEN_EAGLE_SKUS.filter(product=>product.active&&!product.testOnly);

export function CustomerOrderRequest({accounts,onSubmitted}:{accounts:Account[];onSubmitted?:()=>void}){
 const [accountId,setAccountId]=useState(accounts[0]?.id??"");
 const [lines,setLines]=useState<DraftLine[]>([
  {key:1,skuId:catalog[0]?.id??"",cases:"10"},
 ]);
 const nextLine=useRef(2);
 const [note,setNote]=useState("");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [receipt,setReceipt]=useState<{id:string;status:string}|null>(null);
 const [submittedFingerprint,setSubmittedFingerprint]=useState("");
 const pending=useRef<{fingerprint:string;id:string}|null>(null);
 const clear=()=>{
  setMessage("");setReceipt(null);setSubmittedFingerprint("");
  pending.current=null;
 };
 const validation=validateCustomerOrderDraft(
  accountId,accounts.map(a=>a.id),lines,note);
 const selected=new Set(lines.map(line=>line.skuId));
 const remaining=catalog.filter(product=>!selected.has(product.id));
 const updateLine=(key:number,change:Partial<CustomerRequestLine>)=>{
  setLines(current=>current.map(line=>line.key===key?{...line,...change}:line));
  clear();
 };
 const addLine=()=>{
  if(busy||!remaining.length||lines.length>=12)return;
  setLines(current=>[...current,{key:nextLine.current++,skuId:remaining[0].id,cases:""}]);
  clear();
 };
 const removeLine=(key:number)=>{
  if(busy||lines.length===1)return;
  setLines(current=>current.filter(line=>line.key!==key));clear();
 };
 const submit=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  if(busy||submittedFingerprint)return;
  if(!validation.ok){setMessage(validation.message);return;}
  const draft=validation.draft;
  const fingerprint=JSON.stringify(draft);
  if(!pending.current||pending.current.fingerprint!==fingerprint)
   pending.current={fingerprint,id:crypto.randomUUID().replaceAll("-","")};
  const requestId=pending.current.id;
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
   const sent=await post("submitOrderIntake",{draft,requestId});
   if(!sent.intakeId||!sent.status)
    throw new Error("Incomplete receipt. Check sales requests before retrying.");
   const checked=await post("reviewOrderIntake",{intakeId:sent.intakeId});
   if(checked.record?.id!==sent.intakeId||
     checked.record?.accountId!==draft.accountId||
     checked.record?.requestedByUid!==session.uid)
    throw new Error("Request submitted but source readback was not verified.");
   pending.current=null;
   setSubmittedFingerprint(fingerprint);
   setReceipt({id:sent.intakeId,status:checked.record.status??sent.status});
   onSubmitted?.();
   setMessage("Request received for review. No order, stock reservation or payment was created.");
  }catch(error){
   setMessage(error instanceof Error?error.message:
    "Request not confirmed. Check with sales before retrying.");
  }finally{setBusy(false);}
 };
 if(!accounts.length)return null;
 return <section className="prototype-panel" aria-label="Customer order request">
  <h2>Request products</h2>
  <form className="prototype-order-form" onSubmit={event=>void submit(event)}>
   <div className="form-grid">
    <label>Business location
     <select value={accountId} disabled={busy} onChange={event=>{setAccountId(event.target.value);clear();}}>
      {accounts.map(account=><option key={account.id} value={account.id}>
       {account.name} · {account.location}
      </option>)}
     </select>
    </label>
   </div>
   <h3>Products and requested cases</h3>
   {lines.map((line,index)=><div className="prototype-controls" key={line.key}>
    <label>Product {index+1}
     <select aria-label={"Requested product "+(index+1)} value={line.skuId}
      disabled={busy} onChange={event=>updateLine(line.key,{skuId:event.target.value})}>
      {catalog.map(product=><option key={product.id} value={product.id}
       disabled={product.id!==line.skuId&&selected.has(product.id)}>
       {product.shortName} · {product.casePack} cans/case
      </option>)}
     </select>
    </label>
    <label>Cases
     <input aria-label={"Requested cases "+(index+1)} required type="number"
      min="1" max="10000" step="1" value={line.cases} disabled={busy}
      onChange={event=>updateLine(line.key,{cases:event.target.value})}/>
    </label>
    <button type="button" disabled={busy||lines.length===1}
     onClick={()=>removeLine(line.key)}>Remove product</button>
   </div>)}
   <button type="button" onClick={addLine}
    disabled={busy||!remaining.length||lines.length>=12}>Add another product</button>
   <p className="prototype-note">Requested total: {validation.ok?validation.totalCases.toLocaleString("en-US"):"Check case quantities"} cases. Maximum 10,000 cases across all products.</p>
   <label>Notes
    <textarea value={note} maxLength={1000} disabled={busy}
     onChange={event=>{setNote(event.target.value);clear();}}/>
   </label>
   <p className="prototype-note">Sales must confirm pricing, availability and delivery terms before an order is created. This request does not charge you.</p>
   {!validation.ok&&<p role="status" className="prototype-note">{validation.message}</p>}
   <button type="submit" disabled={busy||!validation.ok||Boolean(submittedFingerprint)}>
    {busy?"Submitting…":submittedFingerprint?"Request verified · edit to submit another":"Submit request to sales"}
   </button>
  </form>
  {message&&<p role="status">{message}</p>}
  {receipt&&<p role="status">Request {receipt.id} · {receipt.status}</p>}
  <MyConnectedOrderIntakes key={receipt?.id??"requests"}/>
 </section>;
}
