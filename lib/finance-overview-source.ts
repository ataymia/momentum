import type {CommerceState,Invoice} from "./commerce-engine";
import {invoiceBalance,invoiceCreditAmount,invoicePaidAmount,invoicePendingAmount} from "./commerce-engine";
import {invoiceReconciliationAlerts} from "./commerce-reconciliation-audit";
import {collectedCashFacts} from "./commercial-source";
import {ambiguousSettledRefundIds} from "./reporting-cash-reconciliation";
import type {Order,WorkspaceData} from "./types";

export type FinanceOverviewSource={
  netRecordedCollections:number|null;
  openReceivables:number|null;
  openInvoiceCount:number;
  invoiceReviewCount:number;
  refundReviewCount:number;
};

/**
 * Scope is supplied by authenticated workspace records. This is a source-ledger
 * preview, not an assertion of processor/bank settlement or an issued statement.
 * Any ambiguous current receivable or multi-order refund withholds totals.
 */
export function financeOverviewSource(
  data:WorkspaceData,state:CommerceState,authorizedOrders:readonly Order[],
):FinanceOverviewSource{
  const orders=new Map(authorizedOrders.filter(order=>!order.testOnly)
    .map(order=>[order.id,order]));
  const orderIds=new Set(orders.keys());
  const current=new Set(["Open","Partially paid","Paid"]);
  const candidates=state.invoices.filter(invoice=>orderIds.has(invoice.orderId)&&
    current.has(invoice.status)&&!invoice.supersededByInvoiceId);
  const priorFundingOrders=new Set(state.invoices.filter(previous=>
    previous.supersededByInvoiceId&&orders.get(previous.orderId)?.accountId===previous.accountId&&
    (state.allocations.some(a=>a.invoiceId===previous.id&&a.amount>0)||
     state.credits.some(c=>c.invoiceId===previous.id&&c.status==="Applied"&&c.amount>0)))
    .map(previous=>previous.orderId));
  const payments=new Map(state.payments.map(payment=>[payment.id,payment]));
  const review=(invoice:Invoice)=>{
    const order=orders.get(invoice.orderId);
    if(!order||invoice.accountId!==order.accountId||
      !Number.isFinite(invoice.total)||invoice.total<=0||
      order.status==="Cancelled"||priorFundingOrders.has(invoice.orderId)||
      invoiceReconciliationAlerts(state,invoice).length>0)return true;
    const allocations=state.allocations.filter(a=>a.invoiceId===invoice.id);
    if(allocations.some(a=>{
      const payment=payments.get(a.paymentId);
      return payment?.status==="Cleared"&&(!payment.settledAt||!payment.settledBy);
    }))return true;
    return invoicePaidAmount(state,invoice.id)+invoicePendingAmount(state,invoice.id)+
      invoiceCreditAmount(state,invoice.id)>invoice.total+0.005;
  };
  const verified=candidates.filter(invoice=>!review(invoice));
  const invoiceReviewCount=candidates.length-verified.length;
  const refundReviewCount=ambiguousSettledRefundIds(state,orderIds).length;
  const unsafe=invoiceReviewCount>0||refundReviewCount>0;
  const open=verified.map(invoice=>invoiceBalance(state,invoice)).filter(amount=>amount>0);
  const net=collectedCashFacts(data,state)
    .filter(fact=>orderIds.has(fact.orderId)).reduce((sum,fact)=>sum+fact.amount,0);
  return{
    netRecordedCollections:unsafe?null:net,
    openReceivables:unsafe?null:open.reduce((sum,amount)=>sum+amount,0),
    openInvoiceCount:unsafe?0:open.length,
    invoiceReviewCount,refundReviewCount,
  };
}
