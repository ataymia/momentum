import type { WorkspaceData } from "./types";

export const COMMERCE_STORAGE_KEY="momentum-commerce-v1";
export type InvoiceTerms="Prepaid"|"COD"|"Net 7"|"Net 15"|"Net 30"|"Custom";
export type InvoiceStatus="Draft"|"Open"|"Partially paid"|"Paid"|"Void";
export type Invoice={id:string;number:string;orderId:string;accountId:string;issuedAt:string;dueDate?:string;terms:InvoiceTerms;total:number;status:InvoiceStatus;createdAt:string;voidReason?:string};
export type PaymentStatus="Pending"|"Cleared"|"Failed"|"Reversed";
export type PaymentMethod="Card"|"ACH"|"Wire"|"Cash"|"Other";
export type Payment={id:string;accountId:string;receivedAt:string;amount:number;method:PaymentMethod;status:PaymentStatus;processorReference?:string;note?:string;createdBy:string;createdAt:string;settledAt?:string;settledBy?:string;failedAt?:string;failedBy?:string;reversedAt?:string;reversedBy?:string};
export type PaymentAllocation={id:string;paymentId:string;invoiceId:string;amount:number;createdAt:string;createdBy:string};
export type CreditMemo={id:string;invoiceId:string;amount:number;reason:string;status:"Draft"|"Approved"|"Applied"|"Void";createdAt:string;createdBy:string;approvedBy?:string;approvedAt?:string;appliedAt?:string;appliedBy?:string};
export type Refund={id:string;paymentId:string;amount:number;reason:string;basis?:"Verified quality issue";evidence?:string;status:"Requested"|"Approved"|"Sent"|"Settled"|"Failed";createdAt:string;createdBy:string;approvedBy?:string;approvedAt?:string;sentReference?:string;sentAt?:string;sentBy?:string;settledAt?:string;settledBy?:string;failedAt?:string;failedBy?:string;failureReason?:string};
export type ReceivableNote={id:string;invoiceId:string;authorId:string;note:string;createdAt:string};
export type CommerceState={version:1;invoices:Invoice[];payments:Payment[];allocations:PaymentAllocation[];credits:CreditMemo[];refunds:Refund[];notes:ReceivableNote[]};

const now=()=>new Date().toISOString();const today=()=>new Date().toISOString().slice(0,10);const validDateKey=(value?:string)=>Boolean(value&&/^\d{4}-\d{2}-\d{2}$/.test(value));
const eligibleForInvoice=(status:string)=>["Approved","Allocated","Out for delivery","Delivered","Paid"].includes(status);
const invoiceNumber=(orderNumber:string)=>`INV-${orderNumber.replace(/^GE-/,"")}`;
export function createCommerceSeed(data:WorkspaceData):CommerceState{
  const invoices:Invoice[]=data.orders.filter((order)=>eligibleForInvoice(order.status)||order.paymentStatus!=="Not invoiced").map((order)=>{const createdAt=now();return{id:`invoice-${order.id}`,number:invoiceNumber(order.number),orderId:order.id,accountId:order.accountId,issuedAt:createdAt,terms:"Prepaid",total:order.amount,status:order.paymentStatus==="Paid"?"Paid":order.paymentStatus==="Partially paid"?"Partially paid":"Open",createdAt};});
  const payments:Payment[]=[];const allocations:PaymentAllocation[]=[];
  for(const order of data.orders.filter((item)=>item.paymentStatus==="Paid")){const invoice=invoices.find((item)=>item.orderId===order.id);if(!invoice)continue;const paymentId=`payment-${order.id}-seed`;const settledAt=order.firstSettledAt??order.paidAt??order.placedAt;payments.push({id:paymentId,accountId:order.accountId,receivedAt:settledAt,settledAt,settledBy:"system",amount:order.amount,method:"Other",status:"Cleared",note:"Seeded from paid demo order",createdBy:"system",createdAt:now()});allocations.push({id:`allocation-${order.id}-seed`,paymentId,invoiceId:invoice.id,amount:order.amount,createdAt:now(),createdBy:"system"});}
  return{version:1,invoices,payments,allocations,credits:[],refunds:[],notes:[]};
}
export function normalizeCommerceState(input:unknown,data:WorkspaceData):CommerceState{const seed=createCommerceSeed(data);if(!input||typeof input!=="object")return seed;const state=input as Partial<CommerceState>;const invoices=Array.isArray(state.invoices)?state.invoices:[];const existingOrders=new Set(invoices.map((invoice)=>invoice.orderId));for(const invoice of seed.invoices)if(!existingOrders.has(invoice.orderId))invoices.push(invoice);const payments=(Array.isArray(state.payments)?state.payments:seed.payments).map((payment)=>payment.status==="Cleared"&&!payment.settledAt?{...payment,settledAt:payment.receivedAt,settledBy:payment.settledBy??payment.createdBy}:payment);const refunds=(Array.isArray(state.refunds)?state.refunds:[]).map((refund)=>({...refund,basis:"Verified quality issue" as const,evidence:refund.evidence??refund.reason}));return{version:1,invoices,payments,allocations:Array.isArray(state.allocations)?state.allocations:seed.allocations,credits:Array.isArray(state.credits)?state.credits:[],refunds,notes:Array.isArray(state.notes)?state.notes:[]};}
export function paymentSettlementDate(payment:Payment){return payment.settledAt?.slice(0,10)??(payment.status==="Cleared"?payment.receivedAt.slice(0,10):undefined);}
export function invoicePaidAmount(state:CommerceState,invoiceId:string){
  const clearedPaymentIds=new Set(state.payments.filter((payment)=>payment.status==="Cleared").map((payment)=>payment.id));
  const allocations=state.allocations.filter((allocation)=>allocation.invoiceId===invoiceId&&clearedPaymentIds.has(allocation.paymentId));
  const allocated=allocations.reduce((sum,item)=>sum+item.amount,0);
  const paymentIds=new Set(allocations.map((allocation)=>allocation.paymentId));
  const settledRefunds=state.refunds.filter((refund)=>paymentIds.has(refund.paymentId)&&refund.status==="Settled").reduce((sum,refund)=>sum+refund.amount,0);
  return Math.max(0,allocated-settledRefunds);
}
export function invoicePendingAmount(state:CommerceState,invoiceId:string){const pendingIds=new Set(state.payments.filter((payment)=>payment.status==="Pending").map((payment)=>payment.id));return state.allocations.filter((allocation)=>allocation.invoiceId===invoiceId&&pendingIds.has(allocation.paymentId)).reduce((sum,item)=>sum+item.amount,0);}
export function invoiceCreditAmount(state:CommerceState,invoiceId:string){return state.credits.filter((credit)=>credit.invoiceId===invoiceId&&credit.status==="Applied").reduce((sum,item)=>sum+item.amount,0);}
export function invoiceBalance(state:CommerceState,invoice:Invoice){return Math.max(0,invoice.total-invoicePaidAmount(state,invoice.id)-invoiceCreditAmount(state,invoice.id));}
export function invoiceRecordableAmount(state:CommerceState,invoice:Invoice){return Math.max(0,invoiceBalance(state,invoice)-invoicePendingAmount(state,invoice.id));}
export function computedInvoiceStatus(state:CommerceState,invoice:Invoice):InvoiceStatus{if(invoice.status==="Void")return"Void";const balance=invoiceBalance(state,invoice);if(balance<=0)return"Paid";if(balance<invoice.total)return"Partially paid";return invoice.status==="Draft"?"Draft":"Open";}
export function arAgingBucket(invoice:Invoice,balance:number,asOf=today()){if(balance<=0)return"Paid";if(!invoice.dueDate)return"No due date";const days=Math.floor((new Date(`${asOf}T12:00:00`).getTime()-new Date(`${invoice.dueDate}T12:00:00`).getTime())/86400000);if(days<=0)return"Current";if(days<=30)return"1–30";if(days<=60)return"31–60";if(days<=90)return"61–90";return"90+";}
export function openReceivables(state:CommerceState){return state.invoices.map((invoice)=>({invoice,balance:invoiceBalance(state,invoice),status:computedInvoiceStatus(state,invoice)})).filter((item)=>item.balance>0&&item.status!=="Void");}
export function canRecordSettlementDate(value?:string){return validDateKey(value)&&value!>today();}
export function refundRemainingAmount(state:CommerceState,paymentId:string){const payment=state.payments.find((item)=>item.id===paymentId);if(!payment)return 0;const committed=state.refunds.filter((refund)=>refund.paymentId===paymentId&&refund.status!=="Failed").reduce((sum,refund)=>sum+refund.amount,0);return Math.max(0,payment.amount-committed);}
export function refundCanRequest(state:CommerceState,paymentId:string,amount:number,reason:string,evidence:string){const payment=state.payments.find((item)=>item.id===paymentId);return Boolean(payment&&payment.status==="Cleared"&&amount>0&&amount<=refundRemainingAmount(state,paymentId)&&reason.trim()&&evidence.trim());}
export function creditCanApprove(credit:CreditMemo,actorId:string){return credit.status==="Draft"&&Boolean(actorId)&&credit.createdBy!==actorId;}
export function creditCanApply(state:CommerceState,credit:CreditMemo){if(credit.status!=="Approved")return false;const invoice=state.invoices.find((item)=>item.id===credit.invoiceId);return Boolean(invoice&&computedInvoiceStatus(state,invoice)!=="Void"&&credit.amount>0&&credit.amount<=invoiceRecordableAmount(state,invoice));}
export function refundCanApprove(refund:Refund,actorId:string){return refund.status==="Requested"&&Boolean(actorId)&&refund.createdBy!==actorId;}
export function refundCanSend(refund:Refund,reference:string){return refund.status==="Approved"&&Boolean(reference.trim());}
export function refundCanSettle(refund:Refund,settlementDate:string){if(refund.status!=="Sent"||!refund.sentAt||!canRecordSettlementDate(settlementDate))return false;return settlementDate>=refund.sentAt.slice(0,10);}
export function refundCanFail(refund:Refund,reason:string){return ["Requested","Approved","Sent"].includes(refund.status)&&Boolean(reason.trim());}
export function invoiceCanVoid(state:CommerceState,invoiceId:string){const invoice=state.invoices.find((item)=>item.id===invoiceId);if(!invoice||computedInvoiceStatus(state,invoice)==="Paid"||invoicePaidAmount(state,invoice.id)>0||invoicePendingAmount(state,invoice.id)>0)return false;return !state.credits.some((credit)=>credit.invoiceId===invoice.id&&credit.status!=="Void");}
