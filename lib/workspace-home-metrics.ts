import {isValidCalendarDateKey} from "./date-time";
import {warehouseAvailable,type InventoryLedgerState,type InventoryMovement} from "./inventory-ledger";
import {orderLinesFor} from "./order-lines";
import type {Account,InventoryLot,Order} from "./types";

/** An operational home is a view of records, never a reconciliation ledger. */
export function recordedBusinessDay(value:unknown):string|undefined{
  if(typeof value!=="string"||value.length<10)return undefined;
  const day=value.slice(0,10);
  return isValidCalendarDateKey(day)?day:undefined;
}
export function eligibleHomeOrders(
  orders:readonly Order[],start:string,through:string,
):Order[]{
  return orders.filter(order=>{
    if(order.testOnly||order.status==="Cancelled"||order.status==="Draft")return false;
    const day=recordedBusinessDay(order.placedAt);
    return Boolean(day&&day>=start&&day<=through);
  });
}
export function orderedCasesByProduct(orders:readonly Order[]):[string,number][]{
  const totals=new Map<string,number>();
  for(const order of orders)for(const line of orderLinesFor(order)){
    if(!Number.isInteger(line.cases)||line.cases<1)continue;
    totals.set(line.product,(totals.get(line.product)??0)+line.cases);
  }
  return [...totals].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
}
export function orderedCasesByChannel(orders:readonly Order[],accounts:readonly Account[]):[string,number][]{
  const byId=new Map(accounts.map(account=>[account.id,account]));
  const totals=new Map<string,number>();
  for(const order of orders){
    if(!Number.isInteger(order.cases)||order.cases<1)continue;
    const channel=byId.get(order.accountId)?.channel?.trim()||"Unclassified";
    totals.set(channel,(totals.get(channel)??0)+order.cases);
  }
  return [...totals].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
}
export function warehouseCasesByProduct(ledger:InventoryLedgerState,lots:readonly InventoryLot[]):[string,number][]{
  const totals=new Map<string,number>(),seen=new Set<string>();
  for(const lot of lots){
    if(seen.has(lot.id))continue;
    seen.add(lot.id);
    const available=lot.status==="Quality hold"?0:warehouseAvailable(ledger,lot.id);
    totals.set(lot.product,(totals.get(lot.product)??0)+available);
  }
  return [...totals].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
}
export function visibleReceiptMovements(
  ledger:InventoryLedgerState,lots:readonly InventoryLot[],start:string,through:string,
):InventoryMovement[]{
  const allowed=new Set(lots.map(lot=>lot.id));
  return ledger.movements.filter(movement=>{
    if(movement.type!=="Receipt"||!allowed.has(movement.lotId))return false;
    const day=recordedBusinessDay(movement.at);
    return Boolean(day&&day>=start&&day<=through);
  }).sort((a,b)=>b.at.localeCompare(a.at)||a.id.localeCompare(b.id));
}
