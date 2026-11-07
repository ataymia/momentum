import type {CommerceState,Invoice} from "./commerce-engine";
import {invoicePaidAmount,invoiceCreditAmount} from "./commerce-engine";
/**
 * Defensive, source-ledger reconciliation only. A healthy ledger does not
 * independently prove bank settlement, but inconsistent evidence must never
 * be summarized as confirmed paid customer cash.
 */
export function invoiceReconciliationAlerts(state:CommerceState,invoice:Invoice):string[]{
 const alerts:string[]=[];
 const allocations=state.allocations.filter(a=>a.invoiceId===invoice.id);
 const others=state.invoices.filter(i=>i.orderId===invoice.orderId&&
   i.accountId===invoice.accountId&&i.status!=="Void"&&!i.supersededByInvoiceId);
 if(others.length!==1)alerts.push("Multiple or missing active invoices for the source sales order.");
 const seen=new Set<string>();
 for(const allocation of allocations){
   if(seen.has(allocation.id))alerts.push("Duplicate payment allocation identity on this invoice.");
   seen.add(allocation.id);
   const payment=state.payments.find(p=>p.id===allocation.paymentId);
   if(!payment||payment.accountId!==invoice.accountId){
     alerts.push("Payment allocation has no matching payment on this customer account.");
     continue;
   }
   const allAllocations=state.allocations.filter(a=>a.paymentId===payment.id&&a.amount>0);
   const allocated=allAllocations.reduce((n,a)=>n+a.amount,0);
   if(allocated>payment.amount+0.005)alerts.push("Payment allocations exceed the source payment face amount.");
   if(payment.status==="Cleared"&&!payment.settledAt)
     alerts.push("Payment is recorded Cleared without a settlement date.");
   if(state.refunds.some(r=>r.paymentId===payment.id&&r.status==="Settled"&&r.amount>0)&&
      new Set(allAllocations.map(a=>a.invoiceId)).size>1)
     alerts.push("A settled payment refund spans multiple invoices without invoice-specific refund allocation.");
   const settledRefunds=state.refunds.filter(r=>r.paymentId===payment.id&&r.status==="Settled")
     .reduce((n,r)=>n+r.amount,0);
   if(settledRefunds>allocated+0.005)alerts.push("Settled refunds exceed the associated payment allocation.");
 }
 if(invoicePaidAmount(state,invoice.id)+invoiceCreditAmount(state,invoice.id)>invoice.total+0.005)
   alerts.push("Applied credits and cleared allocations exceed invoice total.");
 return [...new Set(alerts)];
}
