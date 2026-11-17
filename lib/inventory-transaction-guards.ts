import type {WorkspaceData} from "./types";
import {
 type InventoryLedgerState,type InventoryMovement,orderLotWarehouseNetOutbound,
 orderOutboundQuantity,nodeLotBalance,
} from "./inventory-ledger";

/** A reservation release is safe only before any physical stock movement. */
export function releaseEditableOrderReservations(
 state:InventoryLedgerState,orderId:string,releasedAt:string,
):{ok:boolean;state:InventoryLedgerState}{
 if(!orderId.trim()||Number.isNaN(Date.parse(releasedAt))||
  orderOutboundQuantity(state,orderId)>0)return{ok:false,state};
 const active=state.reservations.filter(item=>item.orderId===orderId&&item.status==="Active");
 if(active.some(item=>orderLotWarehouseNetOutbound(state,orderId,item.lotId)>0))
  return{ok:false,state};
 if(!active.length)return{ok:true,state};
 return{ok:true,state:{
  ...state,reservations:state.reservations.map(item=>
   item.orderId===orderId&&item.status==="Active"
    ?{...item,status:"Released" as const,releasedAt}:item),
 }};
}

/** Two-person count approval: reject stale system quantity and invalid cases.
 * No adjustment may overwrite movements recorded since the physical count.
 */
export function reconcileInventoryCount(
 state:InventoryLedgerState,data:Pick<WorkspaceData,"inventory">,input:{
  countId:string;reviewerId:string;reason:string;at:string;adjustmentMovementId:string;
 },
):{ok:boolean;state:InventoryLedgerState;blocker?:string}{
 const count=state.counts.find(row=>row.id===input.countId&&row.status==="Open");
 if(!count)return{ok:false,state,blocker:"Count was already reconciled or missing."};
 if(!input.reviewerId.trim()||count.countedBy===input.reviewerId)
  return{ok:false,state,blocker:"The counter cannot independently approve their own count."};
 if(input.reason.trim().length<5||Number.isNaN(Date.parse(input.at)))
  return{ok:false,state,blocker:"A dated reconciliation reason is required."};
 if(!Number.isSafeInteger(count.countedQty)||
  !Number.isSafeInteger(count.systemQty)||
  !Number.isSafeInteger(count.variance)||
  count.systemQty<0||count.countedQty<0||
  count.countedQty-count.systemQty!==count.variance)
  return{ok:false,state,blocker:"Count values are invalid."};
 const lot=data.inventory.find(item=>item.id===count.lotId);
 const node=state.nodes.find(item=>item.id===count.nodeId&&item.active&&item.type!=="External");
 if(!lot||!node)return{ok:false,state,blocker:"The lot or physical stock location is unavailable."};
 const live=nodeLotBalance(state,count.nodeId,count.lotId);
 if(!Number.isSafeInteger(live)||live!==count.systemQty)
  return{ok:false,state,blocker:"Stock moved after this count. Recount against the current ledger."};
 if(count.variance!==0&&!/^[A-Za-z0-9_-]{6,128}$/.test(input.adjustmentMovementId))
  return{ok:false,state,blocker:"Adjustment movement ID is invalid."};
 const movement:InventoryMovement|undefined=count.variance===0?undefined:{
  id:input.adjustmentMovementId,lotId:count.lotId,product:lot.product,
  quantity:Math.abs(count.variance),type:"Adjustment",
  fromNodeId:count.variance<0?count.nodeId:undefined,
  toNodeId:count.variance>0?count.nodeId:undefined,
  reason:"Count reconciliation: "+input.reason.trim(),
  at:input.at,actorId:input.reviewerId,
 };
 return{ok:true,state:{
  ...state,movements:movement?[movement,...state.movements]:state.movements,
  counts:state.counts.map(row=>row.id===count.id?{
   ...row,status:"Reconciled" as const,reason:input.reason.trim(),
   reconciledAt:input.at,reconciledBy:input.reviewerId,
   adjustmentMovementId:movement?.id,
  }:row),
 }};
}
