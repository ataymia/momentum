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
