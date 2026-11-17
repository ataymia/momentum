/**
 * E01/E03 inventory exception assessment from recorded lot and custody evidence.
 * Best-by dates trigger review rather than automatic write-offs, because the
 * Company's disposition/release policy has not been approved.
 */
export type LotReviewInput={bestBy:string;status:string;warehouseOnHand:number;reserved:number};
export type StockIssue="Quality hold"|"Negative custody"|"Over-reserved"|"Missing best-by"|"Past best-by"|"Best-by within 30 days";
export function daysUntilBestBy(bestBy:string,asOf:string):number|null{
  const valid=(s:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+"T12:00:00Z");return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;};
  if(!valid(bestBy)||!valid(asOf))return null;
  return Math.round((Date.parse(bestBy+"T12:00:00Z")-Date.parse(asOf+"T12:00:00Z"))/86_400_000);
}
export function reviewInventoryLot(lot:LotReviewInput,asOf:string){
  const issues:StockIssue[]=[];
  const days=daysUntilBestBy(lot.bestBy,asOf);
  if(lot.status==="Quality hold")issues.push("Quality hold");
  if(!Number.isFinite(lot.warehouseOnHand)||lot.warehouseOnHand<0)issues.push("Negative custody");
  if(!Number.isFinite(lot.reserved)||lot.reserved<0||lot.reserved>lot.warehouseOnHand)issues.push("Over-reserved");
  if(days===null)issues.push("Missing best-by");
  else if(days<0)issues.push("Past best-by");
  else if(days<=30)issues.push("Best-by within 30 days");
  return {days,issues,reviewRequired:issues.length>0,summary:issues.length?issues.join("; "):"No flagged exceptions"};
}
/** FEFO is an advisory warehouse picking order, not a substitute for allocation permission. */
export function compareFefo(a:{bestBy:string;lotCode:string},b:{bestBy:string;lotCode:string}){
  const va=daysUntilBestBy(a.bestBy,"2026-01-01")!==null?a.bestBy:"9999-12-31";
  const vb=daysUntilBestBy(b.bestBy,"2026-01-01")!==null?b.bestBy:"9999-12-31";
  return va.localeCompare(vb)||a.lotCode.localeCompare(b.lotCode);
}
