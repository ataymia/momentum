/** Shared F08 reporting scope. Recorded tests and held lots are not saleable performance. */
export function reportEligibleOrders<T extends {id:string;testOnly?:boolean}>(orders:readonly T[]):T[]{
 return orders.filter(order=>!order.testOnly);
}
/** All balances are custody ledger quantities. Quality holds must never be included in
 * sellable warehouse availability, even when the reservation-ledger balance is positive. */
export function reportSellableWarehouseCases<T extends {id:string;status:string}>(lots:readonly T[],available:(lotId:string)=>number):number{
 return lots.reduce((sum,lot)=>{
  if(lot.status==="Quality hold")return sum;
  const qty=available(lot.id);
  return sum+(Number.isFinite(qty)?Math.max(0,qty):0);
 },0);
}
