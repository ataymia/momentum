"use client";
import {useRef,useState,type FormEvent} from "react";
import {GOLDEN_EAGLE_SKUS} from "../../lib/product-catalog";
import {useWorkspace} from "../../lib/workspace-context";
import {useFirebaseSessionOptional} from "../../lib/firebase-session-context";
import {submitConnectedOrderIntake,type OrderIntakeDraft} from "../../lib/firebase-order-intake";
import {navigateToRoute} from "../../lib/navigation-store";
import {MyConnectedOrderIntakes} from "./my-connected-order-intakes";

const catalog=GOLDEN_EAGLE_SKUS.filter(s=>s.active&&!s.testOnly);
type DraftLine={key:number;skuId:string;cases:string};
const firstSku=catalog[0]?.id??"";

/** Connected intake is NOT an order. No prices, tax, credit, delivery or stock posted. */
export function ConnectedOrderIntakeForm({initialAccountId=""}:{initialAccountId?:string}={}){
 const {scope,currentUser}=useWorkspace();
 const firebase=useFirebaseSessionOptional();
 const [accountId,setAccountId]=useState(initialAccountId);
 const [search,setSearch]=useState("");
 const [lines,setLines]=useState<DraftLine[]>([{key:1,skuId:firstSku,cases:""}]);
 const [nextLine,setNextLine]=useState(2);
 const [note,setNote]=useState("");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [completedId,setCompletedId]=useState("");
 const pending=useRef<{fingerprint:string;requestId:string}|null>(null);
 const account=scope.accounts.find(item=>item.id===accountId);
 const accounts=scope.accounts.filter(item=>
  [item.name,item.location,item.postalCode].join(" ").toLowerCase().includes(search.toLowerCase()))
  .sort((a,b)=>a.name.localeCompare(b.name));
 const seen=new Set(lines.map(line=>line.skuId));
 const validLines=lines.length>0&&lines.length<=12&&seen.size===lines.length&&lines.every(line=>
  catalog.some(s=>s.id===line.skuId)&&/^[1-9]\d*$/.test(line.cases)&&
  Number.isSafeInteger(Number(line.cases))&&Number(line.cases)<=10000)&&
  lines.reduce((sum,line)=>sum+Number(line.cases),0)<=10000;
 const allowed=Boolean(firebase?.session&&currentUser&&
  ["Administrator","Sales Manager","Sales Representative"].includes(currentUser.role));
 const valid=Boolean(allowed&&account&&validLines&&!completedId);
 const submit=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  if(busy||!valid||!firebase?.session||!account)return;
  const draft:OrderIntakeDraft={
   accountId:account.id,
   lines:lines.map(line=>({skuId:line.skuId,cases:Number(line.cases)})),
   note:note.trim(),
  };
  const fingerprint=JSON.stringify(draft);
  if(!pending.current||pending.current.fingerprint!==fingerprint)
   pending.current={fingerprint,requestId:crypto.randomUUID().replaceAll("-","")};
  setBusy(true);setMessage("");
  try{
   const receipt=await submitConnectedOrderIntake(firebase.session,draft,pending.current.requestId);
   if(!receipt.readbackVerified){
    setMessage("A server receipt exists, but the source record was not independently verified. Leave this form unchanged and inspect the intake before retrying.");
    return;
   }
   setCompletedId(receipt.intakeId);
   setMessage("Intake "+receipt.intakeId+" verified. Submitted for commercial review only. No order, quote, invoice, payment, inventory reservation or commission was created.");
  }catch(error){
   setMessage(error instanceof Error?error.message:
    "Order intake not confirmed. Review the source before retrying.");
  }finally{setBusy(false);}
 };
 if(!allowed)return <section className="prototype-panel"><h1>Order intake unavailable</h1>
  <p>Sign in as an authorized sales employee to submit a connected commercial review request.</p></section>;
 return <div className="prototype-order-editor">
  <header className="prototype-heading"><h1>Request commercial order review</h1>
   <p>Capture what the buyer requested. This is not a binding purchase order or quote.</p>
  </header>
  <section className="prototype-panel">
   <strong>Connected workflow: secure, nonbinding intake</strong>
   <p className="prototype-note">Pricing, distribution authority, inventory, customer terms, tax status and delivery readiness are not verified by this form. Administrator review is required before converting this into an accepted order.</p>
  </section>
  <form className="prototype-order-form" onSubmit={event=>void submit(event)}>
   <section className="prototype-panel"><h2>1. Customer location</h2>
    <label className="prototype-search">Find customer <input aria-label="Find order intake customer" value={search}
     onChange={event=>setSearch(event.target.value)} placeholder="Search account or ZIP"/></label>
    <label className="prototype-form-field">Requested for
     <select aria-label="Order intake account" value={accountId} onChange={event=>setAccountId(event.target.value)}>
      <option value="">Select an accessible location</option>
      {accounts.map(item=><option key={item.id} value={item.id}>{item.name} · {item.location}</option>)}
     </select>
    </label>
    {account&&<p className="prototype-note">Account ID: {account.id}. The system will verify that you are allowed to submit a request for this location.</p>}
   </section>
   <section className="prototype-panel"><h2>2. Catalog products and requested cases</h2>
    {lines.map(line=><div className="prototype-controls" key={line.key}>
     <label>Product <select aria-label={"Intake SKU "+line.key} value={line.skuId}
       onChange={e=>setLines(rows=>rows.map(r=>r.key===line.key?{...r,skuId:e.target.value}:r))}>
       {catalog.map(s=><option key={s.id} value={s.id}>{s.shortName} · {s.casePack}-pack</option>)}
      </select></label>
     <label>Cases <input type="number" min="1" max="10000" step="1"
       aria-label={"Intake cases "+line.key} value={line.cases}
       onChange={e=>setLines(rows=>rows.map(r=>r.key===line.key?{...r,cases:e.target.value}:r))}/></label>
     <button type="button" disabled={lines.length===1} onClick={()=>setLines(rows=>rows.filter(r=>r.key!==line.key))}>Remove line</button>
    </div>)}
    <button type="button" disabled={lines.length>=12||completedId!==""}
     onClick={()=>{setLines(rows=>[...rows,{key:nextLine,skuId:firstSku,cases:""}]);setNextLine(n=>n+1);}}>
     Add another product</button>
    {!validLines&&<p className="prototype-note">Use distinct catalog products with whole-number positive case counts. Maximum 12 lines and 10,000 total cases per request.</p>}
   </section>
   <section className="prototype-panel"><h2>3. Commercial review notes</h2>
    <label>Buyer request details <textarea aria-label="Nonbinding order intake note" rows={3}
     maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}
     placeholder="Buyer request and follow-up context. No tax IDs, card details or sensitive personal data."/></label>
    <p className="prototype-note">Financial amount: not quoted. Status: Needs commercial review. This request must not appear in sales, cash, inventory, commission or invoice totals.</p>
    {message&&<p role="status" className="prototype-note">{message}</p>}
    <div className="prototype-form-actions">
     <button type="button" onClick={()=>navigateToRoute("/sales/orders")}>Back to orders</button>
     <button type="submit" disabled={busy||!valid}>{busy?"Submitting…":completedId?"Source intake recorded":"Submit nonbinding review request"}</button>
    </div>
   </section>
  </form>
  <MyConnectedOrderIntakes key={completedId||"requests"}/>
 </div>;
}
