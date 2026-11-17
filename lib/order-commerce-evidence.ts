import type {Order} from "./types";
import type {CommerceState,Invoice,Payment} from "./commerce-engine";
import {computedInvoiceStatus,invoiceBalance,invoiceCreditAmount,invoicePaidAmount,invoicePendingAmount} from "./commerce-engine";
import type {InventoryLedgerState,InventoryMovement} from "./inventory-ledger";
import {invoiceReconciliationAlerts} from "./commerce-reconciliation-audit";

/**
 * Order-side read model. Never posts funds or converts statuses.
 * One active invoice is mandatory before showing invoice/collection proof.
 */
export type OrderCommerceEvidence={
  activeInvoice:Invoice|null;
  unresolvedInvoiceIds:string[];
  paymentRecords:Array<{payment:Payment;allocatedAmount:number}>;
  receivableBalance:number|null;
  clearedAmount:number|null;
  pendingAmount:number|null;
  appliedCredits:number|null;
  invoiceStatus:string;
  activeReservations:number;
  deliveredToCustomerCases:number;
  returnedFromCustomerCases:number;
  custodyEvents:InventoryMovement[];
  warnings:string[];
};
export function buildOrderCommerceEvidence(
  order:Order,commerce:CommerceState,ledger:InventoryLedgerState,
):OrderCommerceEvidence{
  const active=commerce.invoices.filter(i=>i.orderId===order.id&&i.accountId===order.accountId&&i.status!=="Void"&&!i.supersededByInvoiceId);
  const invoice=active.length===1?active[0]:null;
  const invoiceIds=active.map(i=>i.id).sort();
  const paymentRecords:OrderCommerceEvidence["paymentRecords"]=[];
  if(invoice){
    for(const allocation of commerce.allocations.filter(a=>a.invoiceId===invoice.id)){
      const payment=commerce.payments.find(p=>p.id===allocation.paymentId&&p.accountId===order.accountId);
      if(payment&&Number.isFinite(allocation.amount)&&allocation.amount>0){
        paymentRecords.push({payment,allocatedAmount:allocation.amount});
      }
    }
  }
  const nodes=new Map(ledger.nodes.map(n=>[n.id,n.type]));
  const custodyEvents=ledger.movements.filter(m=>m.relatedOrderId===order.id)
    .sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
  const deliveries=custodyEvents.filter(m=>m.type==="Delivery"&&nodes.get(m.toNodeId??"")==="Customer")
    .reduce((sum,m)=>sum+m.quantity,0);
  const returns=custodyEvents.filter(m=>m.type==="Return"&&nodes.get(m.fromNodeId??"")==="Customer")
    .reduce((sum,m)=>sum+m.quantity,0);
  const activeReservations=ledger.reservations.filter(r=>r.orderId===order.id&&r.status==="Active")
    .reduce((sum,r)=>sum+r.quantity,0);
  const financeAlerts=invoice?invoiceReconciliationAlerts(commerce,invoice):[];
  const balance=invoice&&!financeAlerts.length?invoiceBalance(commerce,invoice):null;
  const paid=invoice&&!financeAlerts.length?invoicePaidAmount(commerce,invoice.id):null;
  const pending=invoice?invoicePendingAmount(commerce,invoice.id):null;
  const credits=invoice?invoiceCreditAmount(commerce,invoice.id):null;
  const warnings:string[]=[...financeAlerts];
  if(active.length>1)warnings.push("Multiple active invoices require finance review before collection evidence can be summarized.");
  if(active.length===0)warnings.push("No single active invoice is linked to this order. Order status is not proof of invoice issuance.");
  if(invoice&&invoice.total!==order.amount)warnings.push("Order amount and active invoice amount differ. Review revisions and credits before reconciliation.");
  if(invoice&&order.paymentStatus==="Paid"&&balance!==null&&balance>0)
    warnings.push("Order marked Paid while the linked invoice ledger still has an unpaid balance.");
  if(invoice&&order.paymentStatus!=="Paid"&&balance===0)
    warnings.push("The invoice ledger shows a zero balance while the order payment status is not Paid.");
  if(order.status==="Delivered"&&deliveries===0)warnings.push("Delivered order status has no linked customer-custody posting in this inventory read.");
  if(deliveries>order.cases)warnings.push("Customer-custody delivery movements exceed the order case quantity.");
  if(returns>deliveries)warnings.push("Linked physical returns exceed delivered customer custody; reconciliation required.");
  return{
    activeInvoice:invoice,unresolvedInvoiceIds:invoiceIds,paymentRecords,
    receivableBalance:balance,clearedAmount:paid,pendingAmount:pending,appliedCredits:credits,
    invoiceStatus:invoice?(financeAlerts.length?"Review required":computedInvoiceStatus(commerce,invoice)):"Not reconciled",
    activeReservations,deliveredToCustomerCases:deliveries,
    returnedFromCustomerCases:returns,custodyEvents,warnings,
  };
}
