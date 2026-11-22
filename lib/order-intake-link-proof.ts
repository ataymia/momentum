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

export type ApprovedIntakeLink={id:string;status:string;orderId?:string;invoiceId?:string};
export type CanonicalPairAudit={checked:number;verifiedIds:string[];unresolvedIds:string[]};

/** Audit loaded approved sources in one read-only pass across both canonical registers.
 * Unprepared and half-linked requests are handled separately by the recovery workflow.
 */
export function auditCanonicalIntakePairs(
 records:readonly ApprovedIntakeLink[],
 orders:readonly SourceLinkedOrder[],
 invoices:readonly SourceLinkedInvoice[],
):CanonicalPairAudit{
 const verifiedIds:string[]=[],unresolvedIds:string[]=[];
 const checkedIds=new Set<string>();
 for(const record of records){
  if(record.status!=="Approved"||!record.orderId?.trim()||!record.invoiceId?.trim())continue;
  if(checkedIds.has(record.id)){
   // Duplicate source rows are not independently accepted evidence.
   const index=verifiedIds.indexOf(record.id);
   if(index>=0)verifiedIds.splice(index,1);
   if(!unresolvedIds.includes(record.id))unresolvedIds.push(record.id);
   continue;
  }
  checkedIds.add(record.id);
  if(canonicalOrderInvoiceLinked(orders,invoices,record.id,record.orderId,record.invoiceId))
   verifiedIds.push(record.id);
  else unresolvedIds.push(record.id);
 }
 return{checked:checkedIds.size,verifiedIds,unresolvedIds};
}
