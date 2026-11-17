"use client";
import {useState} from "react";
import {useWorkspace} from "../../lib/workspace-context";
import {useCommerce} from "../../lib/commerce-context";
import {arizonaDateKey} from "../../lib/date-time";
import {invoiceBalance,computedInvoiceStatus} from "../../lib/commerce-engine";
import {prepareRequest,previewChargeDates,type ChargeCadence,type ChargeRail,type RequestDraft} from "../../lib/payment-request-contract";

export function PaymentRequestPreview({invoiceId}:{invoiceId:string}){
 const {scope,currentUser}=useWorkspace();const {commerce}=useCommerce();
 const [cadence,setCadence]=useState<ChargeCadence>("once"),[rail,setRail]=useState<ChargeRail>("ACH");
 const [amount,setAmount]=useState(""),[start,setStart]=useState(arizonaDateKey()),[draft,setDraft]=useState<RequestDraft|null>(null),[error,setError]=useState("");
 const invoice=commerce.invoices.find(i=>i.id===invoiceId&&scope.accounts.some(a=>a.id===i.accountId));
 const authorized=Boolean(currentUser&&["Administrator","Sales Manager","Sales Representative"].includes(currentUser.role));
 if(!invoice||!authorized)return null;
 const due=invoiceBalance(commerce,invoice);
 const validate=()=>{
   const result=prepareRequest({invoiceId:invoice.id,accountId:invoice.accountId,amount:Number(amount||due),cadence,rail,firstDate:start},{
     actorAuthorized:authorized,invoiceAccountId:invoice.accountId,unpaidBalance:due,
     invoiceState:computedInvoiceStatus(commerce,invoice),today:arizonaDateKey()});
   if(result.ok){setDraft(result.value);setError("");}else{setDraft(null);setError(result.error);}
 };
 return <section className="prototype-panel"><h2>Payment request preparation</h2>
   <p className="prototype-note">Validate the proposed payment terms without charging or contacting a customer. A merchant provider, consent workflow, webhook and reconciliation must be approved before activation.</p>
   <div className="prototype-commerce-filters">
     <label>Preferred method<select aria-label="Payment request rail" value={rail} onChange={e=>{setRail(e.target.value as ChargeRail);setDraft(null);}}><option value="ACH">ACH bank debit</option><option value="Card">Credit or debit card</option></select></label>
     <label>Schedule<select aria-label="Payment request cadence" value={cadence} onChange={e=>{setCadence(e.target.value as ChargeCadence);setDraft(null);}}><option value="once">One-time invoice payment</option><option value="monthly">Monthly future invoices</option><option value="quarterly">Quarterly future invoices</option></select></label>
     <label>{cadence==="once"?"Invoice payment amount":"Maximum per future invoice"}<input type="number" min="0.01" step="0.01" aria-label="Amount per requested charge" placeholder={due.toFixed(2)} value={amount} onChange={e=>{setAmount(e.target.value);setDraft(null);}}/></label>
     <label>First proposed date<input type="date" aria-label="First requested payment date" value={start} onChange={e=>{setStart(e.target.value);setDraft(null);}}/></label>
   </div>
   <button type="button" disabled={due<=0||invoice.status==="Void"||invoice.status==="Draft"} onClick={validate}>Validate draft terms</button>
   {error&&<p role="alert" className="prototype-note">{error}</p>}
   {draft&&<div className="prototype-work-list"><div><strong>Draft only · NOT SENT</strong>
     <p>{draft.rail} · {draft.cadence} · {(draft.amountCents/100).toFixed(2)} per charge</p>
     <p>Proposed dates: {previewChargeDates(draft.firstDate,draft.cadence).join(" · ")}</p>
     {draft.cadence!=="once"&&<p>Recurring terms apply only to future approved invoices, never repeated charges against the same invoice. Explicit customer consent and a provider-held mandate remain required.</p>}
   </div></div>}
 </section>;
}
