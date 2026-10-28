/* eslint-disable max-len,comma-spacing,key-spacing,object-curly-spacing */
type Row=Record<string,unknown>;
const str=(v:unknown)=>typeof v==="string"?v.trim():"";
const amount=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)&&v>=0?v:NaN;
const cents=(v:number)=>Math.round(v*100);
export type FinancialCarryResult={ok:true;allocations:Row[];credits:Row[];
  paidNet:number;pending:number;appliedCredits:number;creditDue:number;
  status:"Open"|"Partially paid"|"Paid"}|{ok:false;message:string};

/** Allocate existing receipts to an amended invoice, without editing actual
 * payment, refund or bank-settlement records. Any surplus becomes a distinct
 * account credit due. This function is pure and safe to recompute at approval. */
export function planFinancialCarry(input:{
  oldInvoiceId:string;newInvoiceId:string;accountId:string;
  newTotal:number;allocations:Row[];payments:Row[];credits:Row[];refunds:Row[];
}):FinancialCarryResult{
  const {oldInvoiceId,newInvoiceId,accountId,newTotal}=input;
  if(!oldInvoiceId||!newInvoiceId||oldInvoiceId===newInvoiceId||
     !Number.isFinite(newTotal)||newTotal<=0)
    return{ok:false,message:"Invoice revision or amount is invalid."};
  const original=input.allocations.filter(a=>str(a.invoiceId)===oldInvoiceId);
  const relevantCredits=input.credits.filter(c=>str(c.invoiceId)===oldInvoiceId&&str(c.status)!=="Void");
  const activeCreditTotal=relevantCredits.filter(c=>str(c.status)==="Applied")
    .reduce((sum,c)=>sum+amount(c.amount),0);
  if(!Number.isFinite(activeCreditTotal)||cents(activeCreditTotal)>cents(newTotal))
    return{ok:false,message:"Existing applied credits exceed amended amount. A credit adjustment is required."};
  const paymentMap=new Map(input.payments.map(p=>[str(p.id),p]));
  const rows:Array<{item:Row;payment:Row}>= [];
  const unique=new Set<string>();
  for(const item of original){
    const id=str(item.id),payment=paymentMap.get(str(item.paymentId)),value=amount(item.amount);
    if(!id||unique.has(id)||!payment||str(payment.accountId)!==accountId||
       !Number.isFinite(value)||value<=0||
       !["Cleared","Pending"].includes(str(payment.status)))
      return{ok:false,message:"Payment application requires correction before invoice replacement."};
    unique.add(id);
    rows.push({item,payment});
  }
  // Allocate cleared money before uncollected pending payments. Preserve
  // payment IDs and receipts; do not create a fake payment for the correction.
  rows.sort((a,b)=>Number(str(a.payment.status)==="Pending")-Number(str(b.payment.status)==="Pending"));
  const allocations:Row[]=[];let available=cents(newTotal-activeCreditTotal);
  let credited=0,paid=0,pending=0;
  const remainingSettled=new Map<string,number>();
  const remainingCommitted=new Map<string,number>();
  const paymentTotals=new Map<string,number>();
  for(const entry of rows){const id=str(entry.payment.id);
    paymentTotals.set(id,(paymentTotals.get(id)||0)+cents(amount(entry.item.amount)));
  }
  for(const [paymentId,total] of paymentTotals){
    const refundRows=input.refunds.filter(r=>str(r.paymentId)===paymentId&&str(r.status)!=="Failed");
    const committed=refundRows.reduce((sum,r)=>sum+amount(r.amount),0);
    const settled=refundRows.filter(r=>str(r.status)==="Settled").reduce((sum,r)=>sum+amount(r.amount),0);
    if(!Number.isFinite(committed)||cents(committed)>total)
      return{ok:false,message:"Refund claims exceed the original payment application."};
    remainingSettled.set(paymentId,cents(settled));
    remainingCommitted.set(paymentId,cents(committed));
  }
  for(const entry of rows){
    const key=str(entry.payment.id);
    const value=cents(amount(entry.item.amount));
    const clearing=str(entry.payment.status)==="Cleared";
    const settledPortion=Math.min(value,remainingSettled.get(key)||0);
    const committedPortion=Math.min(value,remainingCommitted.get(key)||0);
    remainingSettled.set(key,(remainingSettled.get(key)||0)-settledPortion);
    remainingCommitted.set(key,(remainingCommitted.get(key)||0)-committedPortion);
    const net=Math.max(0,value-(clearing?settledPortion:0));
    const keptNet=Math.min(Math.max(available,0),net);
    const newCents=keptNet+(clearing?settledPortion:0);
    if(newCents<committedPortion)return{ok:false,message:"Open or completed refunds require their original payment coverage."};
    if(newCents>0)allocations.push({...entry.item,invoiceId:newInvoiceId,amount:newCents/100});
    const unused=value-newCents;
    if(clearing)credited+=Math.max(0,unused);
    if(clearing)paid+=keptNet;else pending+=keptNet;
    available-=keptNet;
  }
  const newCredits=relevantCredits.map(c=>({...c,invoiceId:newInvoiceId}));
  const settledPaid=paid/100,appliedCredits=activeCreditTotal;
  const status=cents(settledPaid+appliedCredits)>=cents(newTotal)?"Paid":
    cents(settledPaid+appliedCredits)>0?"Partially paid":"Open";
  return{ok:true,allocations,credits:newCredits,paidNet:settledPaid,
    pending:pending/100,appliedCredits,creditDue:credited/100,status};
}
