/* Order archival eligibility is pure so its financial/fulfillment gates are regression-tested. */
export type ArchiveRecord = Record<string,unknown>;
const s=(v:unknown)=>typeof v==="string"?v.trim():"";
const n=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)?v:0;
export type ArchiveEvidence={
 order:ArchiveRecord;
 tasks:ArchiveRecord[];
 overrides:ArchiveRecord[];
 invoices:ArchiveRecord[];
 allocations:ArchiveRecord[];
 credits:ArchiveRecord[];
 refunds:ArchiveRecord[];
 payments:ArchiveRecord[];
 journals:ArchiveRecord[];
 movements:ArchiveRecord[];
 reservations:ArchiveRecord[];
 correctionRequests:ArchiveRecord[];
};
export function orderArchiveBlocker(e:ArchiveEvidence):string|undefined{
 const order=e.order;
 if(s(order.archivedAt))return "This order has already been archived.";
 if(e.correctionRequests.some(r=>!["Rejected","Withdrawn"].includes(s(r.state))))
  return "Resolve the outstanding historical correction request before archiving.";
 if(!order.testOnly&&["Allocated","Out for delivery","Delivered","Paid"].includes(s(order.status)))
  return "Fulfillment or delivery has begun. Reconcile the physical custody and financial records before archival.";
 if(!order.testOnly&&s(order.status)==="Cancelled"&&s(order.paymentStatus)==="Paid")
  return "Paid orders cannot be archived as unfulfilled mistakes.";
 if(e.movements.length)return "Posted physical stock movements exist. Inventory and custody must be reconciled first.";
 if(e.reservations.some(r=>["Active","Reserved","Allocated","Loaded","In transit"].includes(s(r.status))||n(r.quantity)>0&&s(r.status)!=="Released"&&s(r.status)!=="Cancelled"))
  return "Physical inventory is reserved. Release it through the normal inventory workflow first.";
 if(e.overrides.length)return "An Administrator delivery override exists and must be reconciled.";
 if(e.tasks.some(t=>["Loaded","In transit","Delivered"].includes(s(t.status))||
  Boolean(t.signature)||Array.isArray(t.collections)&&t.collections.length>0))
  return "A driver load, signature or collection exists. Preserve delivery evidence and reconcile before archival.";
 if(e.payments.length||e.allocations.length||e.credits.length||e.refunds.length||
    e.journals.length)return "A payment, credit, refund or accounting entry exists. Reconcile financial records before archival.";
 if(e.invoices.some(i=>["Paid","Partially paid"].includes(s(i.status))))
  return "A paid or partially paid invoice cannot be archived without Finance reconciliation.";
 if(s(order.paymentStatus)==="Paid"||s(order.paymentStatus)==="Partially paid"||s(order.firstSettledAt)||s(order.paidAt))
  return "Payment or settlement evidence exists. Finance reconciliation is required.";
 if(!order.testOnly&&n(order.amount)<=0)
  return "Only verified $0 internal QA orders may have a zero total.";
 return undefined;
}
