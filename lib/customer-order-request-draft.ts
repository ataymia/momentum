import {GOLDEN_EAGLE_SKUS} from "./product-catalog";

export type CustomerRequestLine={skuId:string;cases:string};
export type CustomerOrderDraft={
 accountId:string;lines:{skuId:string;cases:number}[];note:string;
};
export type CustomerOrderValidation=
 |{ok:true;draft:CustomerOrderDraft;totalCases:number}
 |{ok:false;message:string};

/** Client-side guidance only. The authenticated backend independently enforces
 * customer location scope, catalog IDs, quantity limits and idempotency.
 * Product availability and commercial terms remain unverified.
 */
export function validateCustomerOrderDraft(
 accountId:string,authorizedAccountIds:readonly string[],
 rows:readonly CustomerRequestLine[],note:string,
):CustomerOrderValidation{
 if(!authorizedAccountIds.includes(accountId))
  return{ok:false,message:"Choose an authorized business location."};
 if(rows.length<1||rows.length>12)
  return{ok:false,message:"Include 1 to 12 product lines."};
 if(note.trim().length>1000)
  return{ok:false,message:"Notes cannot exceed 1,000 characters."};
 const allowed=new Set(GOLDEN_EAGLE_SKUS.filter(sku=>sku.active&&!sku.testOnly)
  .map(sku=>sku.id));
 const seen=new Set<string>();
 let totalCases=0;
 const lines:{skuId:string;cases:number}[]=[];
 for(const row of rows){
  if(!allowed.has(row.skuId))
   return{ok:false,message:"Choose an available catalog product."};
  if(seen.has(row.skuId))
   return{ok:false,message:"Select each product only once."};
  seen.add(row.skuId);
  if(!/^[1-9][0-9]*$/.test(row.cases))
   return{ok:false,message:"Enter positive, whole-number case quantities."};
  const cases=Number(row.cases);
  if(!Number.isSafeInteger(cases)||cases>10000)
   return{ok:false,message:"Each product must have 1 to 10,000 cases."};
  totalCases+=cases;
  if(totalCases>10000)
   return{ok:false,message:"Total cases cannot exceed 10,000 per request."};
  lines.push({skuId:row.skuId,cases});
 }
 return{ok:true,draft:{accountId,lines,note:note.trim()},totalCases};
}
