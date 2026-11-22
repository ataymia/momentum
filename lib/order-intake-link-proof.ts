/** Independent, read-only proof that an intake created one coherent canonical pair. */
export type SourceLinkedOrder={
 id:string;sourceIntakeId?:string;accountId:string;amount:number;
};
export type SourceLinkedInvoice={
 id:string;sourceIntakeId?:string;accountId:string;orderId:string;total:number;
};
const cents=(value:number)=>Number.isFinite(value)&&value>=0&&
 Math.abs(value*100-Math.round(value*100))<0.0001
 ?Math.round(value*100):null;

/**
 * Fail closed when either record is missing, references do not match, totals
 * conflict, or multiple canonical records claim the same approved intake.
 */
export function canonicalOrderInvoiceLinked(
 orders:readonly SourceLinkedOrder[]|undefined,
 invoices:readonly SourceLinkedInvoice[]|undefined,
 intakeId:string,orderId:string,invoiceId:string,
):boolean{
 if(!orders||!invoices||!intakeId||!orderId||!invoiceId)return false;
 const bySource=orders.filter(order=>order.sourceIntakeId===intakeId);
 const invoicesBySource=invoices.filter(invoice=>invoice.sourceIntakeId===intakeId);
 if(bySource.length!==1||invoicesBySource.length!==1)return false;
 const order=bySource[0],invoice=invoicesBySource[0];
 const total=cents(order.amount);
 return order.id===orderId&&invoice.id===invoiceId&&
  invoice.orderId===order.id&&invoice.accountId===order.accountId&&
  Boolean(order.accountId)&&total!==null&&total===cents(invoice.total);
}
