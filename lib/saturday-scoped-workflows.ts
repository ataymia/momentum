import type {Account,Order} from "./types";

/**
 * Read-only export projections. Callers MUST supply their already-authorized
 * workspace scope. These functions do not replace Firestore record rules.
 */
export const accountExportColumns=["business","location","contact","stage","zip","assignedRep","nextAction"] as const;
export const contactExportColumns=["contact","business","role","email","phone","location","stage"] as const;
export const inventoryExportColumns=["lot","product","storage","bestBy","onHand","reserved","available","status"] as const;
export const customerDeliveryColumns=["order","placed","status","cases","payment"] as const;

export function accountExportRows(accounts:readonly Account[],userNames:ReadonlyMap<string,string>){
  return accounts.map(a=>({
    business:a.name,location:a.location,contact:a.contactName,stage:a.stage,
    zip:a.postalCode??"",assignedRep:userNames.get(a.ownerId)??"Unassigned",
    nextAction:a.nextActionDate??"",
  }));
}

export function contactExportRows(accounts:readonly Account[]){
  return accounts.map(a=>({
    contact:a.contactName,business:a.name,role:a.contactRole,
    email:a.email,phone:a.phone,location:a.location,stage:a.stage,
  }));
}

type VisibleLotRow={
  lot:{id:string;lotCode:string;product:string;location:string;bestBy:string;status:string};
  warehouseOnHand:number;reserved:number;sellable:number;
};
export function inventoryExportRows(rows:readonly VisibleLotRow[]){
  return rows.map(r=>({
    lot:r.lot.lotCode,product:r.lot.product,storage:r.lot.location,bestBy:r.lot.bestBy,
    onHand:r.warehouseOnHand,reserved:r.reserved,available:r.sellable,status:r.lot.status,
  }));
}

/** Defense in depth: a customer export/detail requires an explicit account-ID match,
 * even when the caller's workspace scope has already filtered its orders.
 * Never use display names or an order URL alone to infer customer ownership.
 */
export function authorizedCustomerOrders(orders:readonly Order[],authorizedAccountIds:ReadonlySet<string>):Order[]{
  return orders.filter(order=>!order.testOnly&&authorizedAccountIds.has(order.accountId))
    .sort((a,b)=>b.placedAt.localeCompare(a.placedAt)||a.id.localeCompare(b.id));
}
export function authorizedCustomerOrder(orders:readonly Order[],authorizedAccountIds:ReadonlySet<string>,id:string):Order|undefined{
  return authorizedCustomerOrders(orders,authorizedAccountIds).find(order=>order.id===id);
}
export function customerDeliveryExportRows(orders:readonly Order[]){
  return orders.map(o=>({order:o.number,placed:o.placedAt.slice(0,10),status:o.status,cases:o.cases,payment:o.paymentStatus}));
}

export type CustomerDeliverySort="newest"|"oldest"|"order"|"cases";
export type CustomerDeliveryFilters={
  query?:string;status?:string;accountId?:string;fromDate?:string;throughDate?:string;sort?:CustomerDeliverySort;
};
/** Apply view filters ONLY after authorizedCustomerOrders. Never use this as a security boundary. */
export function filterCustomerDeliveries(authorizedOrders:readonly Order[],filters:CustomerDeliveryFilters):Order[]{
  const q=(filters.query??"").trim().toLocaleLowerCase();
  const rows=authorizedOrders.filter(o=>
    (!filters.accountId||filters.accountId==="all"||o.accountId===filters.accountId)&&
    (!filters.status||filters.status==="all"||o.status===filters.status)&&
    (!filters.fromDate||o.placedAt.slice(0,10)>=filters.fromDate)&&
    (!filters.throughDate||o.placedAt.slice(0,10)<=filters.throughDate)&&
    (!q||[o.number,o.status,o.paymentStatus].some(value=>String(value??"").toLocaleLowerCase().includes(q)))
  );
  const sort=filters.sort??"newest";
  return rows.sort((a,b)=>{
    let result=0;
    if(sort==="newest")result=b.placedAt.localeCompare(a.placedAt);
    if(sort==="oldest")result=a.placedAt.localeCompare(b.placedAt);
    if(sort==="order")result=a.number.localeCompare(b.number,undefined,{numeric:true});
    if(sort==="cases")result=b.cases-a.cases;
    return result||a.id.localeCompare(b.id);
  });
}
