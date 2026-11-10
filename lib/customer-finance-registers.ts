import type {Order} from "./types";
import type {CommerceState,Invoice} from "./commerce-engine";
import {invoiceBalance,computedInvoiceStatus} from "./commerce-engine";

export const customerStatementColumns=["date","location","reference","type","status","debit","credit"] as const;
export const customerPaymentColumns=["date","location","reference","method","status","amount"] as const;
type CustomerStatementRow={date:string;location:string;reference:string;type:"Invoice"|"Cleared payment"|"Applied credit"|"Settled refund";status:string;debit:number;credit:number};
type CustomerPaymentRow={date:string;location:string;reference:string;method:string;status:string;amount:number};

/** A presentation projection only: the caller must first enforce authenticated
 * customer account linkage and server record permissions. Never expose raw
 * CommerceState to the browser on connected customer sessions. */
export function projectCustomerFinance(
 state:CommerceState,authorizedOrders:readonly Order[],
 authorizedAccountIds:ReadonlySet<string>,locations:ReadonlyMap<string,string>
):{invoices:Invoice[];payments:CustomerPaymentRow[];statement:CustomerStatementRow[];openBalance:number;reconciliationRequired:number}{
 const orders=new Map(authorizedOrders.filter(o=>!o.testOnly&&authorizedAccountIds.has(o.accountId)&&["Delivered","Paid"].includes(o.status)).map(o=>[o.id,o]));
 // Invoice corrections create a new current revision, not a second demand.
 // Duplicate current invoices or unreconciled funds on older revisions must
 // be reviewed, never advertised as a clean customer receivable.
 const issued=new Set(["Open","Partially paid","Paid"]);
 const candidates=state.invoices.filter(i=>issued.has(i.status)&&!i.supersededByInvoiceId&&
   Number.isFinite(i.total)&&i.total>0&&authorizedAccountIds.has(i.accountId)&&
   orders.get(i.orderId)?.accountId===i.accountId);
 const perOrder=new Map<string,number>();
 for(const invoice of candidates)perOrder.set(invoice.orderId,(perOrder.get(invoice.orderId)??0)+1);
 const priorFunds=new Set(state.invoices.filter(previous=>previous.supersededByInvoiceId&&
   (state.allocations.some(a=>a.invoiceId===previous.id&&Number.isFinite(a.amount)&&a.amount>0)||
    state.credits.some(c=>c.invoiceId===previous.id&&c.status==="Applied"&&
      Number.isFinite(c.amount)&&c.amount>0))).map(previous=>previous.orderId));
 const paymentById=new Map(state.payments.map(p=>[p.id,p]));
 const allocatedByPayment=new Map<string,number>();
 const invoicesByPayment=new Map<string,Set<string>>();
 for(const allocation of state.allocations){
   if(!Number.isFinite(allocation.amount)||allocation.amount<=0)continue;
   allocatedByPayment.set(allocation.paymentId,(allocatedByPayment.get(allocation.paymentId)??0)+allocation.amount);
   const linked=invoicesByPayment.get(allocation.paymentId)??new Set<string>();
   linked.add(allocation.invoiceId);
   invoicesByPayment.set(allocation.paymentId,linked);
 }
 const unsafeInvoiceIds=new Set<string>();
 for(const invoice of candidates){
   const allocations=state.allocations.filter(a=>a.invoiceId===invoice.id&&
     Number.isFinite(a.amount)&&a.amount>0);
   const appliedCredits=state.credits.filter(c=>c.invoiceId===invoice.id&&
     c.status==="Applied"&&Number.isFinite(c.amount)&&c.amount>0);
   let cleared=0,pending=0,refunded=0,invalid=false;
   for(const allocation of allocations){
     const p=paymentById.get(allocation.paymentId);
     if(!p||p.accountId!==invoice.accountId||
       (allocatedByPayment.get(p.id)??0)>p.amount+0.005){invalid=true;break;}
     if(p.status==="Cleared"){
       if(!p.settledAt||!p.settledBy){invalid=true;break;}
       cleared+=allocation.amount;
     }else if(p.status==="Pending")pending+=allocation.amount;
     const related=state.refunds.filter(r=>r.paymentId===p.id&&r.status==="Settled");
     if(related.length&&((invoicesByPayment.get(p.id)?.size??0)!==1||
       related.some(r=>!r.settledAt||!Number.isFinite(r.amount)||r.amount<=0))){
       invalid=true;break;
     }
     refunded+=related.reduce((sum,r)=>sum+r.amount,0);
   }
   // Refunds are payment-level events. They are only unambiguous for an
   // invoice with one allocation per payment, not split or duplicate rows.
   const allocatedIds=allocations.map(a=>a.paymentId);
   if(new Set(allocatedIds).size!==allocatedIds.length)invalid=true;
   if(refunded>cleared+0.005||
     cleared-refunded+pending+appliedCredits.reduce((sum,c)=>sum+c.amount,0)>invoice.total+0.005||
     appliedCredits.some(c=>!c.appliedAt))invalid=true;
   if(invalid)unsafeInvoiceIds.add(invoice.id);
 }
 const invoices=candidates.filter(i=>perOrder.get(i.orderId)===1&&
   !priorFunds.has(i.orderId)&&!unsafeInvoiceIds.has(i.id));
 const reconciliationRequired=candidates.length-invoices.length;
 const byInvoice=new Map(invoices.map(i=>[i.id,i]));
 const cleared=new Map(state.payments.filter(p=>p.status==="Cleared"&&authorizedAccountIds.has(p.accountId)&&Boolean(p.settledAt&&p.settledBy)).map(p=>[p.id,p]));
 const statement:CustomerStatementRow[]=[];
 const paymentRows=new Map<string,CustomerPaymentRow>();
 for(const invoice of invoices)statement.push({date:invoice.issuedAt.slice(0,10),location:locations.get(invoice.accountId)??"Authorized location",reference:invoice.number,type:"Invoice",status:computedInvoiceStatus(state,invoice),debit:invoice.total,credit:0});
 const validAllocations=new Map<string,number>();
 const seenAllocationIds=new Set<string>();
 for(const allocation of state.allocations){
   const invoice=byInvoice.get(allocation.invoiceId),payment=cleared.get(allocation.paymentId);
   if(!invoice||!payment||invoice.accountId!==payment.accountId||!Number.isFinite(allocation.amount)||allocation.amount<=0||seenAllocationIds.has(allocation.id))continue;
   const used=validAllocations.get(payment.id)??0;
   if(used+allocation.amount>payment.amount+0.005)continue;
   seenAllocationIds.add(allocation.id);
   validAllocations.set(payment.id,used+allocation.amount);
   statement.push({date:payment.settledAt!.slice(0,10),location:locations.get(invoice.accountId)??"Authorized location",reference:invoice.number,type:"Cleared payment",status:"Cleared",debit:0,credit:allocation.amount});
   paymentRows.set(payment.id,{date:payment.settledAt!.slice(0,10),location:locations.get(payment.accountId)??"Authorized location",reference:payment.processorReference??payment.id,method:payment.method,status:"Cleared",amount:used+allocation.amount});
 }
 const seenCreditIds=new Set<string>();
 for(const credit of state.credits){
   const invoice=byInvoice.get(credit.invoiceId);
   if(!invoice||credit.status!=="Applied"||!Number.isFinite(credit.amount)||credit.amount<=0||!credit.appliedAt||seenCreditIds.has(credit.id))continue;
   seenCreditIds.add(credit.id);
   statement.push({date:credit.appliedAt.slice(0,10),location:locations.get(invoice.accountId)??"Authorized location",reference:invoice.number,type:"Applied credit",status:"Applied",debit:0,credit:credit.amount});
 }
 const refundedByPayment=new Map<string,number>();
 const seenRefundIds=new Set<string>();
 for(const refund of state.refunds){
   const payment=cleared.get(refund.paymentId);
   if(!payment||refund.status!=="Settled"||!refund.settledAt||!Number.isFinite(refund.amount)||refund.amount<=0||seenRefundIds.has(refund.id))continue;
   const allocated=validAllocations.get(payment.id)??0;
   const alreadyRefunded=refundedByPayment.get(payment.id)??0;
   if(allocated<=0||alreadyRefunded+refund.amount>allocated+0.005)continue;
   seenRefundIds.add(refund.id);
   refundedByPayment.set(payment.id,alreadyRefunded+refund.amount);
   statement.push({date:refund.settledAt.slice(0,10),location:locations.get(payment.accountId)??"Authorized location",reference:payment.processorReference??payment.id,type:"Settled refund",status:"Settled",debit:refund.amount,credit:0});
 }
 statement.sort((a,b)=>b.date.localeCompare(a.date)||a.reference.localeCompare(b.reference)||a.type.localeCompare(b.type));
 const payments=[...paymentRows.values()].sort((a,b)=>b.date.localeCompare(a.date)||a.reference.localeCompare(b.reference));
 return {invoices,payments,statement,openBalance:invoices.reduce((total,invoice)=>total+invoiceBalance(state,invoice),0),reconciliationRequired};
}
