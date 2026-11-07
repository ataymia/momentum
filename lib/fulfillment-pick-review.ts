/**
 * E02 read-only picking review of order lines against the authoritative stock
 * ledger. This does NOT prove physical packing, post movements, or allocate stock.
 * Supplying a snapshot cannot serve as authorization to release a lot.
 */
import {nodeLotBalance,reservedQuantity,warehouseNodeId,type InventoryLedgerState} from "./inventory-ledger";
import {orderLinesFor,productKey,productsEquivalent} from "./order-lines";
import {compareFefo,reviewInventoryLot} from "./stock-health-review";
import type {InventoryLot,Order} from "./types";

export type PickReservationReview={
  reservationId:string;lotId:string;lotCode:string;cases:number;
  warehouseCases:number;allActiveReservedCases:number;bestBy:string;issues:string[];
};
export type PickLineReview={
  product:string;orderedCases:number;reservedCases:number;unallocatedCases:number;
  reservations:PickReservationReview[];issues:string[];
  status:"Needs allocation"|"Partially allocated"|"Exact reservation · review lots"|"Over-allocated"|"Lot exception";
};
export type PickListReview={orderId:string;lines:PickLineReview[];unmatchedReservationIds:string[];hasExceptions:boolean;description:string};

export function buildPickListReview(order:Order,lots:readonly InventoryLot[],ledger:InventoryLedgerState,asOf:string):PickListReview{
  const grouped=new Map<string,{product:string;orderedCases:number}>();
  for(const line of orderLinesFor(order)){
    const key=productKey(line.product);
    const current=grouped.get(key);
    if(current)current.orderedCases+=line.cases;
    else grouped.set(key,{product:line.product,orderedCases:line.cases});
  }
  const active=ledger.reservations.filter(r=>r.orderId===order.id&&r.status==="Active");
  const lotById=new Map(lots.map(lot=>[lot.id,lot]));
  const matchedIds=new Set<string>();
  const lines=[...grouped.values()].map(group=>{
    const relevant=active.filter(reservation=>{
      const lot=lotById.get(reservation.lotId);
      return Boolean(lot&&productsEquivalent(group.product,lot.product));
    });
    const reservations=relevant.map(reservation=>{
      matchedIds.add(reservation.id);
      const lot=lotById.get(reservation.lotId)!;
      const warehouseCases=nodeLotBalance(ledger,warehouseNodeId,lot.id);
      const allActiveReservedCases=reservedQuantity(ledger,lot.id);
      const health=reviewInventoryLot({bestBy:lot.bestBy,status:lot.status,warehouseOnHand:warehouseCases,reserved:allActiveReservedCases},asOf);
      const issues:string[]=[...health.issues];
      if(!Number.isSafeInteger(reservation.quantity)||reservation.quantity<=0)issues.push("Invalid reserved case quantity");
      if(!Number.isSafeInteger(warehouseCases)||warehouseCases<reservation.quantity)issues.push("Reserved cases exceed recorded warehouse custody");
      return {
        reservationId:reservation.id,lotId:lot.id,lotCode:lot.lotCode,cases:reservation.quantity,
        warehouseCases,allActiveReservedCases,bestBy:lot.bestBy,issues,
      };
    }).sort((a,b)=>compareFefo(a,b));
    const reservedCases=reservations.reduce((n,r)=>n+r.cases,0);
    const unallocatedCases=Math.max(0,group.orderedCases-reservedCases);
    const issues:string[]=[];
    if(reservedCases>group.orderedCases)issues.push("Active reservations exceed ordered cases for this SKU");
    if(reservedCases<group.orderedCases)issues.push("Full SKU quantity has not been reserved");
    if(reservations.some(r=>r.issues.length))issues.push("One or more reserved lots require warehouse review");
    const status:PickLineReview["status"]=
      reservations.some(r=>r.issues.length)?"Lot exception":
      reservedCases>group.orderedCases?"Over-allocated":
      reservedCases===0?"Needs allocation":
      reservedCases<group.orderedCases?"Partially allocated":"Exact reservation · review lots";
    return {...group,reservedCases,unallocatedCases,reservations,issues,status};
  });
  const unmatchedReservationIds=active.filter(r=>!matchedIds.has(r.id)).map(r=>r.id);
  const hasExceptions=Boolean(unmatchedReservationIds.length||lines.some(line=>line.issues.length));
  return {
    orderId:order.id,lines,unmatchedReservationIds,hasExceptions,
    description:"Read-only active reservation review. No physical pick, pack, shipment or receiving evidence is created.",
  };
}
