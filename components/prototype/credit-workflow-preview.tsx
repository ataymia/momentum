"use client";
import {useState} from "react";
import {useWorkspace} from "../../lib/workspace-context";
import {useCommerce} from "../../lib/commerce-context";
import {useRuntimeMode} from "../../lib/runtime-mode";
import {momentumStorage} from "../../lib/persistence";
import {creditCanApprove,creditCanApply,invoiceRecordableAmount} from "../../lib/commerce-engine";
import {navigateToRoute} from "../../lib/navigation-store";
const demoAdmin=(isDemo:boolean,role?:string)=>isDemo&&momentumStorage.mode()==="local"&&role==="Administrator";

export function CreditCreatePanel({invoiceId}:{invoiceId:string}){
 const {scope,currentUser}=useWorkspace(),{commerce,createCredit}=useCommerce(),{isDemo}=useRuntimeMode();
 const [amount,setAmount]=useState(""),[reason,setReason]=useState(""),[error,setError]=useState("");
 const invoice=commerce.invoices.find(i=>i.id===invoiceId&&scope.accounts.some(a=>a.id===i.accountId));
 if(!demoAdmin(isDemo,currentUser?.role)||!invoice)return null;
 const max=invoiceRecordableAmount(commerce,invoice);
 const create=()=>{
   const value=Number(amount);
   if(!/^\d+(\.\d{1,2})?$/.test(amount)||value<=0||value>max||!reason.trim()){
     setError("Enter a positive amount no greater than the available invoice balance and an evidence-backed reason.");return;
   }
   const id=createCredit(invoice.id,value,reason.trim());
   if(!id){setError("Credit draft was not created; review the invoice and permissions.");return;}
   setError("");navigateToRoute("/sales/credit-notes/"+encodeURIComponent(id));
 };
 return <section className="prototype-panel"><h2>Draft invoice credit</h2>
  <p className="prototype-note">Local demonstration only. Creating a draft cannot apply the credit, refund cash or return inventory. Separate Administrator approval is required.</p>
  <div className="prototype-commerce-filters">
   <label>Credit amount<input type="number" min="0.01" step="0.01" aria-label="Draft credit amount" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
   <label>Evidence-backed reason<input aria-label="Credit reason" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason and evidence reference"/></label>
  </div>
  <p className="prototype-note">Available invoice amount after pending allocations: ${max.toFixed(2)}</p>
  <button type="button" disabled={max<=0} onClick={create}>Create draft credit</button>
  {error&&<p role="alert" className="prototype-note">{error}</p>}
 </section>;
}
export function CreditDecisionPanel({creditId}:{creditId:string}){
 const {scope,currentUser}=useWorkspace(),{commerce,approveCredit,applyCredit}=useCommerce(),{isDemo}=useRuntimeMode();
 const [message,setMessage]=useState("");
 const credit=commerce.credits.find(c=>c.id===creditId);
 const invoice=credit&&commerce.invoices.find(i=>i.id===credit.invoiceId&&scope.accounts.some(a=>a.id===i.accountId));
 if(!demoAdmin(isDemo,currentUser?.role)||!currentUser||!credit||!invoice)return null;
 const mayApprove=creditCanApprove(credit,currentUser.id),mayApply=creditCanApply(commerce,credit);
 return <section className="prototype-panel"><h2>Credit approval and application</h2>
   <p className="prototype-note">Local demonstration only. The credit creator cannot approve the draft; approval and application are separate events. Neither event issues a cash refund.</p>
   <div className="prototype-page-actionbar">
    <button type="button" disabled={!mayApprove} onClick={()=>setMessage(approveCredit(credit.id)?"Draft approved.":"Approval denied by ledger control.")}>Approve draft</button>
    <button type="button" disabled={!mayApply} onClick={()=>setMessage(applyCredit(credit.id)?"Credit applied.":"Application denied by ledger control.")}>Apply approved credit</button>
   </div>
   {credit.status==="Draft"&&credit.createdBy===currentUser.id&&<p className="prototype-note">A different Administrator must approve this credit.</p>}
   {message&&<p role="status" className="prototype-note">{message}</p>}
 </section>;
}
