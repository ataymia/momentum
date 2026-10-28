/* eslint-disable max-len, comma-spacing, key-spacing, object-curly-spacing */
export type CorrectionLine={product:string;cases:number;pricePerCase:number};
type Raw=Record<string,unknown>;
const object=(value:unknown):value is Raw=>Boolean(value&&typeof value==="object"&&!Array.isArray(value));
export const text=(value:unknown)=>typeof value==="string"?value.trim():"";
const positive=(value:unknown)=>typeof value==="number"&&Number.isInteger(value)&&value>0;

export function canonicalLines(order:Raw):CorrectionLine[]{
  const raw=Array.isArray(order.lines)&&order.lines.length?order.lines:[order];
  // Never silently drop a malformed historic line and then rewrite a partial order.
  if(!raw.every(object))return[];
  const lines=raw.map(item=>({
    product:text(item.product),
    cases:item.cases,
    pricePerCase:item.pricePerCase,
  }));
  if(lines.some(item=>!item.product||!positive(item.cases)||
      typeof item.pricePerCase!=="number"||!Number.isFinite(item.pricePerCase)||
      item.pricePerCase<=0))return[];
  return lines as CorrectionLine[];
}

/** Preserve every existing order line. If its stored totals disagree with the
 * order header, stop instead of silently recalculating a historic invoice. */
export function orderLinesReconcile(order:Raw,lines:CorrectionLine[]):boolean{
  if(!lines.length||typeof order.cases!=="number"||typeof order.amount!=="number")return false;
  const cases=lines.reduce((sum,line)=>sum+line.cases,0);
  const total=lines.reduce((sum,line)=>sum+line.cases*line.pricePerCase,0);
  return Number.isFinite(total)&&cases===order.cases&&Math.abs(total-order.amount)<0.005;
}

export function correctionDiff(original:CorrectionLine[],proposal:unknown):{
  ok:boolean;message:string;lines:CorrectionLine[];quantityChanged:boolean;total:number;
}{
  if(!Array.isArray(proposal)||!proposal.length||proposal.length>20)
    return{ok:false,message:"Supply 1 to 20 valid SKU lines.",lines:[],quantityChanged:false,total:0};
  if(original.length!==proposal.length||!original.length)
    return{ok:false,message:"Each existing SKU must remain. SKU substitutions require inventory reconciliation.",lines:[],quantityChanged:false,total:0};
  const proposed:CorrectionLine[]=[];
  for(let i=0;i<original.length;i++){
    const row=proposal[i];const before=original[i];
    if(!object(row)||text(row.product)!==before.product||!positive(row.cases))
      return{ok:false,message:"Use existing SKUs with whole-number positive case quantities.",lines:[],quantityChanged:false,total:0};
    proposed.push({product:before.product,cases:Number(row.cases),pricePerCase:before.pricePerCase});
  }
  const total=proposed.reduce((sum,line)=>sum+line.cases*line.pricePerCase,0);
  return{ok:Number.isFinite(total)&&total>0,message:"",lines:proposed,
    quantityChanged:proposed.some((item,index)=>item.cases!==original[index].cases),total};
}

export function correctionApprovalGate(input:{
  requesterUid:string;approverUid:string;activeAdministrator:boolean;
  originalRevision:string;currentRevision:string;quantityChanged:boolean;
  hasFinancialActivity:boolean;hasInventoryReconciliation:boolean;
}):string|null{
  if(!input.activeAdministrator)return"Only an active Administrator may approve.";
  if(!input.approverUid||input.approverUid===input.requesterUid)return"Another Administrator must approve this correction.";
  if(input.originalRevision!==input.currentRevision)return"The order or invoice changed. Review the new records and resubmit.";
  if(input.hasFinancialActivity)return"Payment, credit, or refund activity requires Finance reconciliation before revision.";
  if(input.quantityChanged&&!input.hasInventoryReconciliation)return"Quantity corrections require verified inventory custody reconciliation before approval.";
  return null;
}


/** Closing a pending proposal must not bypass a separate Administrator's approval.
 * The requester can withdraw; another Administrator can reject with a reason. */
export function correctionCloseGate(input:{
  actorUid:string;requesterUid:string;activeAdministrator:boolean;
  decision:"Withdraw"|"Reject";
}):string|null{
  if(!input.activeAdministrator)return"Only an active Administrator may close a correction.";
  if(input.decision==="Withdraw"&&input.actorUid!==input.requesterUid)
    return"Only the requester can withdraw this correction.";
  if(input.decision==="Reject"&&input.actorUid===input.requesterUid)
    return"Another Administrator must reject the correction.";
  return null;
}
