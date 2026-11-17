import { invoicePaidAmount, refundHasSingleInvoiceAllocation, type CommerceState } from "./commerce-engine";
import {invoiceReconciliationAlerts} from "./commerce-reconciliation-audit";
import type { WorkspaceData } from "./types";

export type PaidOrderFact = {
  orderId: string;
  accountId: string;
  creditedUserId: string;
  paidAt: string;
  amount: number;
  cases: number;
};

export type CollectedCashFact = {
  id: string;
  orderId: string;
  accountId: string;
  creditedUserId: string;
  settledAt: string;
  amount: number;
  kind: "Collection" | "Refund";
};

const orderCreditUser = (order: WorkspaceData["orders"][number]) => order.creditedRepId ?? order.ownerId;
const dateKey = (value: string) => value.slice(0, 10);
const unique = <T,>(records: T[], key: (record: T) => string) => {
  const seen = new Set<string>();
  return records.filter((record) => {
    const id = key(record);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

/** True, invoice-linked order payment facts. When Commerce is provided, a
 * legacy Paid flag is never settlement evidence, and a weak or ambiguous invoice
 * does not generate sales bonuses, counts or revenue. No-Commerce callers are
 * explicitly the legacy/demo projection until their source ledgers are migrated.
 */
export function resolvedPaidOrderFacts(data: WorkspaceData, commerce?: CommerceState): PaidOrderFact[] {
  const orderById = new Map(data.orders.map((order) => [order.id, order]));
  if (!commerce) {
    return unique(data.orders.filter((order)=>!order.testOnly&&order.paymentStatus==="Paid")
      .map((order)=>({
        orderId:order.id,accountId:order.accountId,
        creditedUserId:orderCreditUser(order),
        paidAt:dateKey(order.paidAt??order.placedAt),
        amount:order.amount,cases:order.cases,
      })),(fact)=>fact.orderId);
  }
  const eligiblePayments = new Map(commerce.payments.filter((payment)=>
    payment.status==="Cleared"&&Boolean(payment.settledAt&&payment.settledBy)
    &&Number.isFinite(payment.amount)&&payment.amount>0)
    .map((payment)=>[payment.id,payment]));
  const facts:PaidOrderFact[]=[];
  for (const invoice of commerce.invoices) {
    const order = orderById.get(invoice.orderId);
    if (!order||order.testOnly||invoice.accountId!==order.accountId||
      invoice.status==="Void"||invoice.supersededByInvoiceId||
      !Number.isFinite(invoice.total)||invoice.total<=0||
      invoiceReconciliationAlerts(commerce,invoice).length>0||
      invoicePaidAmount(commerce,invoice.id)+0.005<invoice.total)continue;
    const settlementDates=commerce.allocations.filter((allocation)=>
      allocation.invoiceId===invoice.id&&eligiblePayments.has(allocation.paymentId))
      .map((allocation)=>eligiblePayments.get(allocation.paymentId)!.settledAt!)
      .sort();
    if(!settlementDates.length)continue;
    facts.push({
      orderId:order.id,accountId:order.accountId,
      creditedUserId:orderCreditUser(order),
      paidAt:dateKey(settlementDates.at(-1)!),
      amount:order.amount,cases:order.cases,
    });
  }
  return unique(facts,(fact)=>fact.orderId);
}

/** Cleared customer collections mapped through one valid invoice-to-order
 * chain. Ambiguous refunds are deliberately unallocated and must be separately
 * called out by the reporting exception guard, never assigned to the first rep.
 */
export function collectedCashFacts(data: WorkspaceData, commerce?: CommerceState): CollectedCashFact[] {
  if(!commerce){
    return resolvedPaidOrderFacts(data).map((fact)=>({
      id:fact.orderId,orderId:fact.orderId,accountId:fact.accountId,
      creditedUserId:fact.creditedUserId,settledAt:fact.paidAt,
      amount:fact.amount,kind:"Collection" as const,
    }));
  }
  const orderById=new Map(data.orders.map((order)=>[order.id,order]));
  const invoiceById=new Map(commerce.invoices.map((invoice)=>[invoice.id,invoice]));
  const paymentsById=new Map(commerce.payments.filter(payment=>
    payment.status==="Cleared"&&Boolean(payment.settledAt&&payment.settledBy)
    &&Number.isFinite(payment.amount)&&payment.amount>0)
    .map(payment=>[payment.id,payment]));
  const reconciledInvoice=new Set(commerce.invoices.filter(invoice=>
    invoice.status!=="Void"&&!invoice.supersededByInvoiceId
    &&invoiceReconciliationAlerts(commerce,invoice).length===0
    &&orderById.get(invoice.orderId)?.accountId===invoice.accountId
    &&!orderById.get(invoice.orderId)?.testOnly)
    .map(invoice=>invoice.id));
  const facts:CollectedCashFact[]=[];
  for(const allocation of commerce.allocations){
    const invoice=invoiceById.get(allocation.invoiceId);
    const payment=paymentsById.get(allocation.paymentId);
    const order=invoice?orderById.get(invoice.orderId):undefined;
    if(!invoice||!order||!payment||!reconciledInvoice.has(invoice.id)
      ||payment.accountId!==invoice.accountId||
      !Number.isFinite(allocation.amount)||allocation.amount<=0)continue;
    facts.push({
      id:allocation.id,orderId:order.id,accountId:order.accountId,
      creditedUserId:orderCreditUser(order),settledAt:dateKey(payment.settledAt!),
      amount:allocation.amount,kind:"Collection",
    });
  }
  for(const refund of commerce.refunds){
    if(refund.status!=="Settled"||!refund.settledAt||!refund.settledBy||
      !Number.isFinite(refund.amount)||refund.amount<=0||
      !refundHasSingleInvoiceAllocation(commerce,refund.paymentId))continue;
    const allocations=commerce.allocations.filter(allocation=>
      allocation.paymentId===refund.paymentId&&allocation.amount>0);
    const invoice=invoiceById.get(allocations[0].invoiceId);
    const order=invoice?orderById.get(invoice.orderId):undefined;
    const payment=paymentsById.get(refund.paymentId);
    if(!invoice||!order||!payment||!reconciledInvoice.has(invoice.id)||
      payment.accountId!==invoice.accountId)continue;
    facts.push({
      id:refund.id,orderId:order.id,accountId:order.accountId,
      creditedUserId:orderCreditUser(order),settledAt:dateKey(refund.settledAt),
      amount:-refund.amount,kind:"Refund",
    });
  }
  return unique(facts,fact=>fact.kind+":"+fact.id);
}
