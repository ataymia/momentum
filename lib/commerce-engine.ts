import { arizonaDateKey, isValidCalendarDateKey } from "./date-time";
import type { WorkspaceData } from "./types";

export const COMMERCE_STORAGE_KEY="momentum-commerce-v1";
export type InvoiceTerms="Prepaid"|"COD"|"Net 7"|"Net 15"|"Net 30"|"Custom";
export type InvoiceStatus="Draft"|"Open"|"Partially paid"|"Paid"|"Void";
export type Invoice={id:string;number:string;orderId:string;accountId:string;issuedAt:string;dueDate?:string;terms:InvoiceTerms;total:number;status:InvoiceStatus;createdAt:string;voidReason?:string};
export type PaymentStatus="Pending"|"Cleared"|"Failed"|"Reversed";
export type PaymentMethod="Card"|"ACH"|"Wire"|"Cash"|"Other";
export type Payment={id:string;accountId:string;receivedAt:string;amount:number;method:PaymentMethod;status:PaymentStatus;processorReference?:string;note?:string;createdBy:string;createdAt:string;settledAt?:string;settledBy?:string;failedAt?:string;failedBy?:string;failureReason?:string;reversedAt?:string;reversedBy?:string;reversalReason?:string;reversalReference?:string};
export type PaymentAllocation={id:string;paymentId:string;invoiceId:string;amount:number;createdAt:string;createdBy:string};
export type CreditMemo={id:string;invoiceId:string;amount:number;reason:string;status:"Draft"|"Approved"|"Applied"|"Void";createdAt:string;createdBy:string;approvedBy?:string;approvedAt?:string;appliedAt?:string;appliedBy?:string};
export type Refund={id:string;paymentId:string;amount:number;reason:string;basis?:"Verified quality issue";evidence?:string;status:"Requested"|"Approved"|"Sent"|"Settled"|"Failed";createdAt:string;createdBy:string;approvedBy?:string;approvedAt?:string;sentReference?:string;sentAt?:string;sentBy?:string;settledAt?:string;settledBy?:string;failedAt?:string;failedBy?:string;failureReason?:string};
export type ReceivableNote={id:string;invoiceId:string;authorId:string;note:string;createdAt:string};
export type CommerceState={version:1;invoices:Invoice[];payments:Payment[];allocations:PaymentAllocation[];credits:CreditMemo[];refunds:Refund[];notes:ReceivableNote[]};

const now=()=>new Date().toISOString();const today=()=>arizonaDateKey();
const finitePositive=(value:number)=>Number.isFinite(value)&&value>0;
const finiteNonNegative=(value:number)=>Number.isFinite(value)&&value>=0;
const validDateOrInstant=(value?:string)=>Boolean(value&&(isValidCalendarDateKey(value)||!Number.isNaN(new Date(value).getTime())));
const businessDateKey=(value:string)=>isValidCalendarDateKey(value)?value:arizonaDateKey(value);
const eligibleForInvoice=(status:string)=>["Approved","Allocated","Out for delivery","Delivered","Paid"].includes(status);
const invoiceNumber=(orderNumber:string)=>`INV-${orderNumber.replace(/^GE-/,"")}`;
const invoiceTerms=new Set<InvoiceTerms>(["Prepaid","COD","Net 7","Net 15","Net 30","Custom"]);
const invoiceStatuses=new Set<InvoiceStatus>(["Draft","Open","Partially paid","Paid","Void"]);
const paymentStatuses=new Set<PaymentStatus>(["Pending","Cleared","Failed","Reversed"]);
const paymentMethods=new Set<PaymentMethod>(["Card","ACH","Wire","Cash","Other"]);
const creditStatuses=new Set<CreditMemo["status"]>(["Draft","Approved","Applied","Void"]);
const refundStatuses=new Set<Refund["status"]>(["Requested","Approved","Sent","Settled","Failed"]);
const uniqueById=<T extends {id:string}>(records:T[])=>{const seen=new Set<string>();return records.filter((record)=>Boolean(record?.id)&&!seen.has(record.id)&&(seen.add(record.id),true));};
const paymentEvidenceValid=(payment:Payment)=>{
  if(payment.status==="Cleared")return Boolean(payment.settledAt&&payment.settledBy&&validDateOrInstant(payment.settledAt));
  if(payment.status==="Failed")return Boolean(payment.failedAt&&payment.failedBy&&payment.failureReason?.trim()&&validDateOrInstant(payment.failedAt));
  if(payment.status==="Reversed")return Boolean(payment.settledAt&&payment.settledBy&&payment.reversedAt&&payment.reversedBy&&payment.reversalReason?.trim()&&validDateOrInstant(payment.settledAt)&&validDateOrInstant(payment.reversedAt));
  return true;
};
const creditEvidenceValid=(credit:CreditMemo)=>{
  if(["Approved","Applied"].includes(credit.status)&&(!credit.approvedAt||!credit.approvedBy||!validDateOrInstant(credit.approvedAt)))return false;
  if(credit.status==="Applied"&&(!credit.appliedAt||!credit.appliedBy||!validDateOrInstant(credit.appliedAt)))return false;
  return true;
};
const refundEvidenceValid=(refund:Refund)=>{
  if(refund.basis!=="Verified quality issue"||!refund.evidence?.trim())return false;
  if(["Approved","Sent","Settled"].includes(refund.status)&&(!refund.approvedAt||!refund.approvedBy||!validDateOrInstant(refund.approvedAt)))return false;
  if(["Sent","Settled"].includes(refund.status)&&(!refund.sentReference?.trim()||!refund.sentAt||!refund.sentBy||!validDateOrInstant(refund.sentAt)))return false;
  if(refund.status==="Settled"&&(!refund.settledAt||!refund.settledBy||!validDateOrInstant(refund.settledAt)))return false;
  if(refund.status==="Failed"&&(!refund.failedAt||!refund.failedBy||!refund.failureReason?.trim()||!validDateOrInstant(refund.failedAt)))return false;
  return true;
};

export function createCommerceSeed(data:WorkspaceData):CommerceState{
  const invoices:Invoice[]=data.orders.filter((order)=>eligibleForInvoice(order.status)||order.paymentStatus!=="Not invoiced").filter((order)=>finiteNonNegative(order.amount)).map((order)=>{const createdAt=now();return{id:`invoice-${order.id}`,number:invoiceNumber(order.number),orderId:order.id,accountId:order.accountId,issuedAt:createdAt,terms:"Prepaid",total:order.amount,status:order.paymentStatus==="Paid"?"Paid":order.paymentStatus==="Partially paid"?"Partially paid":"Open",createdAt};});
  const payments:Payment[]=[];const allocations:PaymentAllocation[]=[];
  for(const order of data.orders.filter((item)=>item.paymentStatus==="Paid"&&finitePositive(item.amount))){const invoice=invoices.find((item)=>item.orderId===order.id);if(!invoice)continue;const paymentId=`payment-${order.id}-seed`;const settledAt=order.firstSettledAt??order.paidAt??order.placedAt;payments.push({id:paymentId,accountId:order.accountId,receivedAt:settledAt,settledAt,settledBy:"system",amount:order.amount,method:"Other",status:"Cleared",note:"Seeded from paid demo order",createdBy:"system",createdAt:now()});allocations.push({id:`allocation-${order.id}-seed`,paymentId,invoiceId:invoice.id,amount:order.amount,createdAt:now(),createdBy:"system"});}
  return{version:1,invoices,payments,allocations,credits:[],refunds:[],notes:[]};
}

export function normalizeCommerceState(input:unknown,data:WorkspaceData):CommerceState{
  const seed=createCommerceSeed(data);if(!input||typeof input!=="object")return seed;const state=input as Partial<CommerceState>;
  const orderById=new Map(data.orders.map((order)=>[order.id,order]));
  const accountIds=new Set(data.accounts.map((account)=>account.id));
  const storedInvoices=uniqueById((Array.isArray(state.invoices)?state.invoices:[]).filter((invoice):invoice is Invoice=>{const order=invoice&&orderById.get(invoice.orderId);return Boolean(order&&invoice.accountId===order.accountId&&accountIds.has(invoice.accountId)&&invoice.number?.trim()&&validDateOrInstant(invoice.issuedAt)&&validDateOrInstant(invoice.createdAt)&&(!invoice.dueDate||isValidCalendarDateKey(invoice.dueDate))&&invoiceTerms.has(invoice.terms)&&invoiceStatuses.has(invoice.status)&&finiteNonNegative(invoice.total)&&finiteNonNegative(order.amount)&&Math.abs(invoice.total-order.amount)<0.005&&(invoice.status!=="Void"||invoice.voidReason?.trim()));}));
  const invoiceIds=new Set(storedInvoices.map((invoice)=>invoice.id));
  const invoices=[...storedInvoices];for(const invoice of seed.invoices)if(!invoiceIds.has(invoice.id)&&!invoices.some((item)=>item.orderId===invoice.orderId))invoices.push(invoice);
  const invoiceById=new Map(invoices.map((invoice)=>[invoice.id,invoice]));

  const storedPayments=uniqueById((Array.isArray(state.payments)?state.payments:[]).filter((payment):payment is Payment=>Boolean(payment&&accountIds.has(payment.accountId)&&finitePositive(payment.amount)&&paymentMethods.has(payment.method)&&paymentStatuses.has(payment.status)&&payment.createdBy&&validDateOrInstant(payment.receivedAt)&&validDateOrInstant(payment.createdAt)&&paymentEvidenceValid(payment))));
  const paymentIds=new Set(storedPayments.map((payment)=>payment.id));
  const payments=[...storedPayments];for(const payment of seed.payments)if(!paymentIds.has(payment.id)){payments.push(payment);paymentIds.add(payment.id);}
  const paymentById=new Map(payments.map((payment)=>[payment.id,payment]));

  const rawAllocations=uniqueById([...(Array.isArray(state.allocations)?state.allocations:[]),...seed.allocations]);
  const allocations:PaymentAllocation[]=[];const paymentInvoice=new Map<string,string>();const allocatedAmount=new Map<string,number>();
  for(const allocation of rawAllocations){const payment=paymentById.get(allocation.paymentId);const invoice=invoiceById.get(allocation.invoiceId);if(!payment||!invoice||payment.accountId!==invoice.accountId||!finitePositive(allocation.amount)||!allocation.createdBy||!validDateOrInstant(allocation.createdAt))continue;const linkedInvoice=paymentInvoice.get(payment.id);if(linkedInvoice&&linkedInvoice!==invoice.id)continue;const used=allocatedAmount.get(payment.id)??0;if(used+allocation.amount>payment.amount+0.005)continue;paymentInvoice.set(payment.id,invoice.id);allocatedAmount.set(payment.id,used+allocation.amount);allocations.push(allocation);}

  const credits=uniqueById((Array.isArray(state.credits)?state.credits:[]).filter((credit):credit is CreditMemo=>{const invoice=credit&&invoiceById.get(credit.invoiceId);return Boolean(invoice&&finitePositive(credit.amount)&&credit.amount<=invoice.total+0.005&&credit.reason?.trim()&&credit.createdBy&&creditStatuses.has(credit.status)&&validDateOrInstant(credit.createdAt)&&creditEvidenceValid(credit));}));
  const allocatedByPayment=new Map<string,number>();for(const allocation of allocations)allocatedByPayment.set(allocation.paymentId,(allocatedByPayment.get(allocation.paymentId)??0)+allocation.amount);
  const refunds=uniqueById((Array.isArray(state.refunds)?state.refunds:[]).filter((refund):refund is Refund=>{const payment=refund&&paymentById.get(refund.paymentId);const allocated=refund?allocatedByPayment.get(refund.paymentId)??0:0;return Boolean(payment&&payment.status!=="Pending"&&finitePositive(refund.amount)&&refund.amount<=Math.min(payment.amount,allocated)+0.005&&refund.reason?.trim()&&refund.createdBy&&refundStatuses.has(refund.status)&&validDateOrInstant(refund.createdAt)&&refundEvidenceValid(refund));})).map((refund)=>({...refund,evidence:refund.evidence!.trim()}));
  const notes=uniqueById((Array.isArray(state.notes)?state.notes:[]).filter((note):note is ReceivableNote=>Boolean(note&&invoiceById.has(note.invoiceId)&&note.authorId&&note.note?.trim()&&validDateOrInstant(note.createdAt))));
  return{version:1,invoices,payments,allocations,credits,refunds,notes};
}

export function paymentSettlementDate(payment:Payment){return payment.settledAt&&validDateOrInstant(payment.settledAt)?businessDateKey(payment.settledAt):payment.status==="Cleared"&&validDateOrInstant(payment.receivedAt)?businessDateKey(payment.receivedAt):undefined;}
export function invoicePaidAmount(state:CommerceState,invoiceId:string){
  const clearedPaymentIds=new Set(state.payments.filter((payment)=>payment.status==="Cleared"&&finitePositive(payment.amount)).map((payment)=>payment.id));
  const allocations=state.allocations.filter((allocation)=>allocation.invoiceId===invoiceId&&clearedPaymentIds.has(allocation.paymentId)&&finitePositive(allocation.amount));
  const allocated=allocations.reduce((sum,item)=>sum+item.amount,0);
  const paymentIds=new Set(allocations.map((allocation)=>allocation.paymentId));
  const settledRefunds=state.refunds.filter((refund)=>paymentIds.has(refund.paymentId)&&refund.status==="Settled"&&finitePositive(refund.amount)).reduce((sum,refund)=>sum+refund.amount,0);
  return Math.max(0,allocated-settledRefunds);
}
export function invoicePendingAmount(state:CommerceState,invoiceId:string){const pendingIds=new Set(state.payments.filter((payment)=>payment.status==="Pending"&&finitePositive(payment.amount)).map((payment)=>payment.id));return state.allocations.filter((allocation)=>allocation.invoiceId===invoiceId&&pendingIds.has(allocation.paymentId)&&finitePositive(allocation.amount)).reduce((sum,item)=>sum+item.amount,0);}
export function invoiceCreditAmount(state:CommerceState,invoiceId:string){return state.credits.filter((credit)=>credit.invoiceId===invoiceId&&credit.status==="Applied"&&finitePositive(credit.amount)).reduce((sum,item)=>sum+item.amount,0);}
export function invoiceBalance(state:CommerceState,invoice:Invoice){return Math.max(0,(finiteNonNegative(invoice.total)?invoice.total:0)-invoicePaidAmount(state,invoice.id)-invoiceCreditAmount(state,invoice.id));}
export function invoiceRecordableAmount(state:CommerceState,invoice:Invoice){return Math.max(0,invoiceBalance(state,invoice)-invoicePendingAmount(state,invoice.id));}
export function computedInvoiceStatus(state:CommerceState,invoice:Invoice):InvoiceStatus{if(invoice.status==="Void")return"Void";const balance=invoiceBalance(state,invoice);if(balance<=0)return"Paid";if(balance<invoice.total)return"Partially paid";return invoice.status==="Draft"?"Draft":"Open";}
export function arAgingBucket(invoice:Invoice,balance:number,asOf=today()){if(balance<=0)return"Paid";if(!invoice.dueDate||!isValidCalendarDateKey(invoice.dueDate)||!isValidCalendarDateKey(asOf))return"No due date";const days=Math.floor((new Date(`${asOf}T12:00:00`).getTime()-new Date(`${invoice.dueDate}T12:00:00`).getTime())/86400000);if(days<=0)return"Current";if(days<=30)return"1–30";if(days<=60)return"31–60";if(days<=90)return"61–90";return"90+";}
export function openReceivables(state:CommerceState){return state.invoices.map((invoice)=>({invoice,balance:invoiceBalance(state,invoice),status:computedInvoiceStatus(state,invoice)})).filter((item)=>item.balance>0&&item.status!=="Void");}
export function canRecordSettlementDate(value?:string){return Boolean(value&&isValidCalendarDateKey(value)&&value<=today());}
export function paymentCanFail(payment:Payment,reason:string){return payment.status==="Pending"&&Boolean(reason.trim());}
export function paymentCanReverse(state:CommerceState,payment:Payment,reason:string){return payment.status==="Cleared"&&Boolean(reason.trim())&&!state.refunds.some((refund)=>refund.paymentId===payment.id&&refund.status!=="Failed");}
export function refundRemainingAmount(state:CommerceState,paymentId:string){const payment=state.payments.find((item)=>item.id===paymentId);if(!payment||!finitePositive(payment.amount))return 0;const allocated=Math.min(payment.amount,state.allocations.filter((allocation)=>allocation.paymentId===paymentId&&finitePositive(allocation.amount)).reduce((sum,item)=>sum+item.amount,0));const committed=state.refunds.filter((refund)=>refund.paymentId===paymentId&&refund.status!=="Failed"&&finitePositive(refund.amount)).reduce((sum,refund)=>sum+refund.amount,0);return Math.max(0,allocated-committed);}
export function refundCanRequest(state:CommerceState,paymentId:string,amount:number,reason:string,evidence:string){const payment=state.payments.find((item)=>item.id===paymentId);return Boolean(payment&&payment.status==="Cleared"&&finitePositive(amount)&&amount<=refundRemainingAmount(state,paymentId)&&reason.trim()&&evidence.trim());}
export function creditCanApprove(credit:CreditMemo,actorId:string){return credit.status==="Draft"&&Boolean(actorId)&&credit.createdBy!==actorId;}
export function creditCanApply(state:CommerceState,credit:CreditMemo){if(credit.status!=="Approved"||!finitePositive(credit.amount))return false;const invoice=state.invoices.find((item)=>item.id===credit.invoiceId);return Boolean(invoice&&computedInvoiceStatus(state,invoice)!=="Void"&&credit.amount<=invoiceRecordableAmount(state,invoice));}
export function refundCanApprove(refund:Refund,actorId:string){return refund.status==="Requested"&&Boolean(actorId)&&refund.createdBy!==actorId;}
export function refundCanSend(refund:Refund,reference:string){return refund.status==="Approved"&&Boolean(reference.trim());}
export function refundCanSettle(refund:Refund,settlementDate:string){if(refund.status!=="Sent"||!refund.sentAt||!canRecordSettlementDate(settlementDate)||!validDateOrInstant(refund.sentAt))return false;return settlementDate>=businessDateKey(refund.sentAt);}
export function refundCanFail(refund:Refund,reason:string){return ["Requested","Approved","Sent"].includes(refund.status)&&Boolean(reason.trim());}
export function invoiceCanVoid(state:CommerceState,invoiceId:string){const invoice=state.invoices.find((item)=>item.id===invoiceId);if(!invoice||computedInvoiceStatus(state,invoice)==="Paid"||invoicePaidAmount(state,invoice.id)>0||invoicePendingAmount(state,invoice.id)>0)return false;return !state.credits.some((credit)=>credit.invoiceId===invoice.id&&credit.status!=="Void");}
