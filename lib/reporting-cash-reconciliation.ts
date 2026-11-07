import type {CommerceState} from "./commerce-engine";
/** A refund is payment-level in the current Commerce schema; it has no invoiceId.
 * When its payment covered more than one order, assigning the full refund to the
 * first invoice would fabricate per-order/per-rep net cash. Fail closed in reports.
 *
 * Output exposes IDs only for reconciliation within the caller's authorized order scope.
 * Source Commerce allocation/settlement workflow must ultimately resolve these records. */
export function ambiguousSettledRefundIds(
 state:CommerceState,visibleOrderIds:ReadonlySet<string>,from?:string,through?:string,
):string[]{
 const invoices=new Map(state.invoices.map(i=>[i.id,i]));
 const orderIdsByPayment=new Map<string,Set<string>>();
 for(const allocation of state.allocations){
  if(!Number.isFinite(allocation.amount)||allocation.amount<=0)continue;
  const invoice=invoices.get(allocation.invoiceId);
  if(!invoice||invoice.status==="Void")continue;
  const orders=orderIdsByPayment.get(allocation.paymentId)??new Set<string>();
  orders.add(invoice.orderId);orderIdsByPayment.set(allocation.paymentId,orders);
 }
 return state.refunds.filter(refund=>{
  if(refund.status!=="Settled"||!refund.settledAt)return false;
  const date=refund.settledAt.slice(0,10);
  if(from&&date<from||through&&date>through)return false;
  const orders=orderIdsByPayment.get(refund.paymentId);
  return Boolean(orders&&orders.size>1&&[...orders].some(id=>visibleOrderIds.has(id)));
 }).map(refund=>refund.id);
}
