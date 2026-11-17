/* eslint-disable max-len, comma-spacing, key-spacing, indent, object-curly-spacing, curly, brace-style, keyword-spacing, arrow-parens, space-before-blocks, operator-linebreak */
export type InvoicePdfLine={product:string;cases:number;pricePerCase:number;amount:number};
export type InvoiceLineReconciliation=
 |{ok:true;lines:InvoicePdfLine[];source:"Invoice snapshot"|"Order fallback"}
 |{ok:false;reason:string};

const row=(value:unknown):value is Record<string,unknown>=>
 Boolean(value&&typeof value==="object"&&!Array.isArray(value));
const string=(value:unknown)=>typeof value==="string"?value.trim():"";
const money=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)&&value>=0;

/** Reconcile the immutable invoice lines first; never print a different order total.
 * Legacy invoices without snapshots may use complete order lines, but only
 * when the saved invoiced total exactly reconciles to the resulting line items.
 * No product labels, discounts, fees or tax figures are invented.
 * @param {unknown} rawInvoice Persisted invoice record.
 * @param {unknown} rawOrder Persisted underlying order record.
 * @return {InvoiceLineReconciliation} Complete trusted line items or hold reason.
 */
export function reconcileInvoicePdfLines(
 rawInvoice:unknown,rawOrder:unknown,
):InvoiceLineReconciliation{
 if(!row(rawInvoice)||!row(rawOrder)||!money(rawInvoice.total))
  return{ok:false,reason:"Missing or invalid saved invoice total."};
 const hasSnapshot=Object.prototype.hasOwnProperty.call(rawInvoice,"linesSnapshot");
 const snapshot=hasSnapshot?rawInvoice.linesSnapshot:undefined;
 if(hasSnapshot&&(!Array.isArray(snapshot)||!snapshot.length))
  return{ok:false,reason:"Saved invoice line snapshot is empty or malformed."};
 const fallback=Array.isArray(rawOrder.lines)&&rawOrder.lines.length?
  rawOrder.lines:[rawOrder];
 const candidates=hasSnapshot?snapshot:fallback;
 if(!Array.isArray(candidates)||!candidates.length||candidates.length>80)
  return{ok:false,reason:"Invalid number of invoice line items."};
 const lines:InvoicePdfLine[]=[];
 let casesTotal=0;
 let lineCents=0;
 for(const candidate of candidates){
  if(!row(candidate)||!string(candidate.product)||
    !Number.isSafeInteger(candidate.cases)||Number(candidate.cases)<1||
    Number(candidate.cases)>10000||
    !money(candidate.pricePerCase)||!money(candidate.amount))
   return{ok:false,reason:"A product, case count or line amount is missing or invalid."};
  const cases=Number(candidate.cases);
  const unit=Number(candidate.pricePerCase);
  const amount=Number(candidate.amount);
  if(Math.abs(cases*unit-amount)>0.011)
   return{ok:false,reason:"A saved line amount differs from cases multiplied by unit price."};
  const cents=Math.round(amount*100);
  if(!Number.isSafeInteger(cents))
   return{ok:false,reason:"A line amount is too large to reconcile safely."};
  casesTotal+=cases;
  lineCents+=cents;
  lines.push({product:string(candidate.product),cases,pricePerCase:unit,amount});
 }
 const totalCents=Math.round(Number(rawInvoice.total)*100);
 if(casesTotal>10000||!Number.isSafeInteger(totalCents)||!Number.isSafeInteger(lineCents))
  return{ok:false,reason:"Invoice exceeds supported case or currency limits."};
 if(lineCents!==totalCents)
  return{ok:false,reason:"Saved invoice total does not match the authoritative invoice line items."};
 return{ok:true,lines,source:hasSnapshot?"Invoice snapshot":"Order fallback"};
}
