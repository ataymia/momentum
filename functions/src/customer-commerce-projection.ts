/* eslint-disable max-len, comma-spacing, indent, space-before-blocks, keyword-spacing, arrow-parens, key-spacing, comma-dangle, one-var, semi-spacing, curly */
/** Server-only, account-scoped projections. No raw Firestore finance shards leave this module. */
export type Row=Record<string,unknown>;
export type DocRows={accounts:Row[];orders:Row[];invoices:Row[];payments:Row[];allocations:Row[];credits:Row[];refunds:Row[]};
export type CustomerFinanceSnapshot={
 accounts:{id:string;name:string;location:string;contactName:string;email:string;phone:string;streetAddress:string}[];
 orders:{id:string;accountId:string;number:string;placedAt:string;status:string;cases:number}[];
 statements:{id:string;accountId:string;invoice:string;date:string;due:string;status:string;amount:number;cleared:number;pending:number;credits:number;balance:number}[];
 payments:{id:string;accountId:string;invoice:string;date:string;settled:string;status:string;method:string;amount:number}[];
 truncated:boolean;
};
export const txt=(value:unknown)=>typeof value==="string"?value.trim():"";
export const num=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)&&value>=0?value:0;
export const rows=(value:unknown):Row[]=>{
 const record=value&&typeof value==="object"&&!Array.isArray(value)?value as Row:{};
 return Array.isArray(record.items)?record.items.filter((x:unknown)=>x!==null&&typeof x==="object"&&!Array.isArray(x)) as Row[]:[];
};
const price=(v:number)=>Math.round(v*100)/100;
const dates=(value:unknown)=>txt(value).slice(0,10);
const validId=(x:string)=>/^[A-Za-z0-9_-]{1,128}$/.test(x);

/**
 * Return locations authorized by two separately controlled identity records.
 * @param {Row|undefined} access Trusted access record.
 * @param {Row|undefined} directory Trusted directory profile.
 * @return {string[]} Valid authorized location IDs.
 */
export function customerAccountIds(access:Row|undefined,directory:Row|undefined):string[]{
 if(!access||!directory||txt(access.role)!=="Customer"||txt(directory.role)!=="Customer"||
   txt(access.accountState)!=="Active"||!txt(access.email)||
   txt(access.email).toLowerCase()!==txt(directory.email).toLowerCase())return[];
 const ids=directory.accountIds;
 if(!Array.isArray(ids)||!ids.length||ids.length>100||ids.some(id=>typeof id!=="string"||!validId(id)))return[];
 return [...new Set(ids as string[])];
}
/**
 * Project scoped receivables and order history without returning raw shards.
 * @param {string[]} ids Verified authorized location IDs.
 * @param {DocRows} docs Source records.
 * @param {number} limit Maximum visible entries.
 * @return {CustomerFinanceSnapshot} Sanitized record projection.
 */
export function projectCustomerFinance(ids:readonly string[],docs:DocRows,limit=500):CustomerFinanceSnapshot{
 const accountIds=new Set(ids.filter(validId));
 if(!accountIds.size)throw new Error("Customer has no verified account scope.");
 const accounts=docs.accounts.filter(a=>accountIds.has(txt(a.id))).map(a=>({
  id:txt(a.id),name:txt(a.name)||"Authorized business",location:txt(a.location),
  contactName:txt(a.contactName),email:txt(a.email),phone:txt(a.phone),streetAddress:txt(a.streetAddress)
 }));
 const accessible=new Set(accounts.map(a=>a.id));
 if(!accessible.size)throw new Error("No authorized customer location exists in company records.");
 const orders=new Map<string,Row>();
 for(const o of docs.orders){
  if(accessible.has(txt(o.accountId))&&["Delivered","Paid"].includes(txt(o.status))&&o.testOnly!==true){
   // Duplicates must not create alternate financial ownership.
   const id=txt(o.id);
   if(id&&!orders.has(id))orders.set(id,o);
  }
 }
 const allowedStates=new Set(["Awaiting approval","Approved","Allocated","Out for delivery","Delivered","Paid","Cancelled"]);
 const sourceOrders=docs.orders.filter(o=>accessible.has(txt(o.accountId))&&
   o.testOnly!==true&&allowedStates.has(txt(o.status))&&txt(o.id)&&txt(o.number)&&
   Number.isSafeInteger(o.cases)&&num(o.cases)>0)
   .sort((a,b)=>txt(b.placedAt).localeCompare(txt(a.placedAt))||txt(a.id).localeCompare(txt(b.id)));
 const uniqueCustomerOrders=new Map<string,Row>();
 for(const order of sourceOrders)if(!uniqueCustomerOrders.has(txt(order.id)))uniqueCustomerOrders.set(txt(order.id),order);
 const visibleOrders=[...uniqueCustomerOrders.values()].slice(0,limit).map(o=>({
   id:txt(o.id),accountId:txt(o.accountId),number:txt(o.number),
   placedAt:dates(o.placedAt),status:txt(o.status),cases:num(o.cases),
 }));
 // Superseded invoice revisions are historical documents, not current balances.
 // Include only issued states; never turn an unknown raw status into a receivable.
 const issuedStates=new Set(["Open","Partially paid","Paid"]);
 const eligible=docs.invoices.filter(i=>accessible.has(txt(i.accountId))&&
   issuedStates.has(txt(i.status))&&!txt(i.supersededByInvoiceId)&&
   txt(orders.get(txt(i.orderId))?.accountId)===txt(i.accountId)&&
   txt(i.id)&&num(i.total)>0);
 const perOrder=new Map<string,number>();
 for(const i of eligible)perOrder.set(txt(i.orderId),(perOrder.get(txt(i.orderId))??0)+1);
 const unique=eligible.filter(i=>perOrder.get(txt(i.orderId))===1)
   .sort((a,b)=>txt(b.issuedAt).localeCompare(txt(a.issuedAt))||txt(a.id).localeCompare(txt(b.id)));
 // An allocation shared by several invoices makes a payment-level refund
 // impossible to attribute to a single receivable without explicit refund
 // allocation evidence. Never subtract the same refund from multiple invoices.
 const paymentInvoices=new Map<string,Set<string>>();
 const paymentTotals=new Map<string,number>();
 for(const allocation of docs.allocations){
   const paymentId=txt(allocation.paymentId),invoiceId=txt(allocation.invoiceId);
   if(!paymentId||!invoiceId||num(allocation.amount)<=0)continue;
   const set=paymentInvoices.get(paymentId)??new Set<string>();
   set.add(invoiceId);paymentInvoices.set(paymentId,set);
   paymentTotals.set(paymentId,(paymentTotals.get(paymentId)??0)+num(allocation.amount));
 }
 const paymentIndex=new Map(docs.payments.map(p=>[txt(p.id),p]));
 const disputedPayments=new Set<string>();
 for(const refund of docs.refunds){
   if(txt(refund.status)==="Settled"&&num(refund.amount)>0&&
      (paymentInvoices.get(txt(refund.paymentId))?.size??0)>1)
     disputedPayments.add(txt(refund.paymentId));
 }
 for(const [id,total] of paymentTotals){
   const payment=paymentIndex.get(id);
   if(!payment||total>num(payment.amount)+0.005)disputedPayments.add(id);
 }
 const ambiguousInvoiceIds=new Set(docs.allocations.filter(a=>disputedPayments.has(txt(a.paymentId))).map(a=>txt(a.invoiceId)));
 // A replacement invoice is not safely payable while an older revision of the
 // same order still holds applied credits or payment allocations. Do not
 // silently discard those funds and show the replacement at its full balance.
 const unreconciledRevisionOrders=new Set<string>();
 for(const old of docs.invoices){
   if(!txt(old.supersededByInvoiceId))continue;
   const priorAllocations=docs.allocations.some(a=>txt(a.invoiceId)===txt(old.id)&&num(a.amount)>0);
   const priorCredits=docs.credits.some(c=>txt(c.invoiceId)===txt(old.id)&&
     txt(c.status)==="Applied"&&num(c.amount)>0);
   if(priorAllocations||priorCredits)unreconciledRevisionOrders.add(txt(old.orderId));
 }
 const safeInvoices=unique.filter(i=>!ambiguousInvoiceIds.has(txt(i.id))&&
   !unreconciledRevisionOrders.has(txt(i.orderId)));
 const selected=safeInvoices.slice(0,limit);
 const statements:CustomerFinanceSnapshot["statements"]=[];
 const payments:CustomerFinanceSnapshot["payments"]=[];
 let excludedForUnbalancedFunds=false;
 for(const invoice of selected){
  const paymentRowStart=payments.length;
  const allocations=docs.allocations.filter(a=>txt(a.invoiceId)===txt(invoice.id)&&num(a.amount)>0);
  let cleared=0,pending=0;
  for(const allocation of allocations){
   const payment=paymentIndex.get(txt(allocation.paymentId));
   if(!payment||txt(payment.accountId)!==txt(invoice.accountId))continue;
   const amount=num(allocation.amount);
   if(txt(payment.status)==="Cleared")cleared+=amount;
   if(txt(payment.status)==="Pending")pending+=amount;
   payments.push({id:txt(allocation.id),accountId:txt(invoice.accountId),invoice:txt(invoice.number),
    date:dates(payment.receivedAt),settled:txt(payment.status)==="Cleared"?dates(payment.settledAt):"",
    status:txt(payment.status),method:txt(payment.method),amount:price(amount)});
  }
  const clearedIds=new Set(allocations.filter(a=>txt(paymentIndex.get(txt(a.paymentId))?.status)==="Cleared"&&
    txt(paymentIndex.get(txt(a.paymentId))?.accountId)===txt(invoice.accountId)).map(a=>txt(a.paymentId)));
  const settledRefunds=docs.refunds.filter(r=>clearedIds.has(txt(r.paymentId))&&txt(r.status)==="Settled")
    .reduce((n,r)=>n+num(r.amount),0);
  const appliedCredits=docs.credits.filter(c=>txt(c.invoiceId)===txt(invoice.id)&&txt(c.status)==="Applied")
    .reduce((n,c)=>n+num(c.amount),0);
  const amount=num(invoice.total);
  if(settledRefunds>cleared+0.005){
    excludedForUnbalancedFunds=true;
    payments.splice(paymentRowStart);
    continue;
  }
  cleared=Math.max(0,cleared-settledRefunds);
  // Pending allocations also reserve invoice capacity. Checking them
  // separately can display overlapping funds as a valid customer balance.
  if(cleared+pending+appliedCredits>amount+0.005){
    excludedForUnbalancedFunds=true;
    // A zeroed, overpaid or overcredited balance without an exception trail
    // must not be advertised as paid to the customer.
    payments.splice(paymentRowStart);
    continue;
  }
  const balance=Math.max(0,amount-cleared-appliedCredits);
  // A browser-originated ledger flag is not independent bank settlement proof.
  const status=balance===0?"Zero balance recorded (not bank verified)":
    balance<amount?"Partial allocations recorded":"Open";
  statements.push({id:txt(invoice.id),accountId:txt(invoice.accountId),invoice:txt(invoice.number),
   date:dates(invoice.issuedAt),due:dates(invoice.dueDate),
   status,amount:price(amount),cleared:price(cleared),pending:price(pending),
   credits:price(appliedCredits),balance:price(balance)});
 }
 return{accounts,orders:visibleOrders,statements,payments,truncated:eligible.length>limit||unique.length!==eligible.length||safeInvoices.length!==unique.length||excludedForUnbalancedFunds||sourceOrders.length>limit};
}
