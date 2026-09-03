import type { InventoryLot, Order, WorkspaceData } from "./types";

export const INVENTORY_LEDGER_STORAGE_KEY="momentum-inventory-ledger-v1";
export const LOW_STOCK_MANAGER_APPROVAL_THRESHOLD_CASES=50;
export const WAREHOUSE_REORDER_THRESHOLD_CASES=500;
export type InventoryNodeType="Warehouse"|"Bin"|"Vehicle"|"Employee custody"|"Customer"|"Quality hold"|"Disposed"|"External";
export type InventoryNode={id:string;name:string;type:InventoryNodeType;active:boolean;userId?:string;accountId?:string};
export type MovementType="Receipt"|"Transfer"|"Allocation"|"Release"|"Delivery"|"Return"|"Sample"|"Damage"|"Shrink"|"Adjustment"|"Disposal";
export type InventoryMovement={id:string;lotId:string;product:string;quantity:number;type:MovementType;fromNodeId?:string;toNodeId?:string;relatedOrderId?:string;reason:string;at:string;actorId:string};
export type InventoryReservation={id:string;orderId:string;lotId:string;quantity:number;status:"Active"|"Released"|"Fulfilled";createdAt:string;createdBy:string;releasedAt?:string;fulfilledAt?:string};
export type InventoryCount={id:string;nodeId:string;lotId:string;countedQty:number;systemQty:number;variance:number;countedAt:string;countedBy:string;status:"Open"|"Reconciled";reason?:string;reconciledAt?:string;reconciledBy?:string;adjustmentMovementId?:string};
export type InventoryLedgerState={version:1;nodes:InventoryNode[];movements:InventoryMovement[];reservations:InventoryReservation[];counts:InventoryCount[]};

export const warehouseNodeId="node-warehouse-main";
export const holdNodeId="node-quality-hold";
export const disposedNodeId="node-disposed";
const externalNodeId="node-external";

export function createInventoryLedgerSeed(data:WorkspaceData):InventoryLedgerState{
  const nodes:InventoryNode[]=[
    {id:warehouseNodeId,name:"Phoenix warehouse",type:"Warehouse",active:true},
    {id:holdNodeId,name:"Quality hold",type:"Quality hold",active:true},
    {id:disposedNodeId,name:"Disposed / written off",type:"Disposed",active:true},
    {id:externalNodeId,name:"Outside source",type:"External",active:true},
    ...data.users.filter((user)=>user.role!=="Customer").map((user)=>({id:`node-user-${user.id}`,name:`${user.name} custody`,type:"Employee custody" as const,active:true,userId:user.id})),
    ...data.accounts.map((account)=>({id:`node-account-${account.id}`,name:`${account.locationName??account.name} customer location`,type:"Customer" as const,active:true,accountId:account.id})),
  ];
  const movements:InventoryMovement[]=data.inventory.flatMap((lot):InventoryMovement[]=>{
    if(lot.status==="Quality hold")return[{id:`opening-${lot.id}`,lotId:lot.id,product:lot.product,quantity:lot.onHand,type:"Receipt",fromNodeId:externalNodeId,toNodeId:holdNodeId,reason:"Opening demo balance on quality hold",at:lot.receivedAt,actorId:"system"}];
    return[{id:`opening-${lot.id}`,lotId:lot.id,product:lot.product,quantity:lot.onHand,type:"Receipt",fromNodeId:externalNodeId,toNodeId:warehouseNodeId,reason:"Opening demo warehouse balance",at:lot.receivedAt,actorId:"system"}];
  });
  return{version:1,nodes,movements,reservations:[],counts:[]};
}
export function normalizeInventoryLedger(input:unknown,data:WorkspaceData):InventoryLedgerState{const seed=createInventoryLedgerSeed(data);if(!input||typeof input!=="object")return seed;const state=input as Partial<InventoryLedgerState>;const nodes=Array.isArray(state.nodes)?state.nodes:seed.nodes;const nodeIds=new Set(nodes.map((node)=>node.id));for(const node of seed.nodes)if(!nodeIds.has(node.id))nodes.push(node);const movements=Array.isArray(state.movements)?state.movements:[];const movementIds=new Set(movements.map((movement)=>movement.id));for(const movement of seed.movements)if(!movementIds.has(movement.id))movements.push(movement);return{version:1,nodes,movements,reservations:Array.isArray(state.reservations)?state.reservations:[],counts:Array.isArray(state.counts)?state.counts:[]};}
export function nodeLotBalance(state:InventoryLedgerState,nodeId:string,lotId:string){return state.movements.filter((movement)=>movement.lotId===lotId).reduce((balance,movement)=>balance+(movement.toNodeId===nodeId?movement.quantity:0)-(movement.fromNodeId===nodeId?movement.quantity:0),0);}
export function lotBalances(state:InventoryLedgerState,lotId:string){return state.nodes.map((node)=>({node,balance:nodeLotBalance(state,node.id,lotId)})).filter((item)=>item.balance!==0);}
export function lotSystemQuantity(state:InventoryLedgerState,lotId:string){return state.nodes.filter((node)=>node.type!=="External").reduce((sum,node)=>sum+nodeLotBalance(state,node.id,lotId),0);}
export function reservedQuantity(state:InventoryLedgerState,lotId:string){return state.reservations.filter((reservation)=>reservation.lotId===lotId&&reservation.status==="Active").reduce((sum,item)=>sum+item.quantity,0);}
export function activeReservedForOrder(state:InventoryLedgerState,orderId:string,lotId?:string){return state.reservations.filter((reservation)=>reservation.orderId===orderId&&reservation.status==="Active"&&(!lotId||reservation.lotId===lotId)).reduce((sum,item)=>sum+item.quantity,0);}
export function fulfilledForOrder(state:InventoryLedgerState,orderId:string){return state.reservations.filter((reservation)=>reservation.orderId===orderId&&reservation.status==="Fulfilled").reduce((sum,item)=>sum+item.quantity,0);}
export function warehouseAvailable(state:InventoryLedgerState,lotId:string){return Math.max(0,nodeLotBalance(state,warehouseNodeId,lotId)-reservedQuantity(state,lotId));}
export function productAvailableSellableCases(state:InventoryLedgerState,data:WorkspaceData,product:string){return data.inventory.filter((lot)=>lot.product===product&&lot.status!=="Quality hold").reduce((sum,lot)=>sum+warehouseAvailable(state,lot.id),0);}
export function productInventoryStatus(state:InventoryLedgerState,data:WorkspaceData,product:string){const available=productAvailableSellableCases(state,data,product);return{product,available,requiresManagerApproval:available<LOW_STOCK_MANAGER_APPROVAL_THRESHOLD_CASES,reorderNeeded:available<WAREHOUSE_REORDER_THRESHOLD_CASES};}
export function inventoryProductStatuses(state:InventoryLedgerState,data:WorkspaceData){return [...new Set(data.inventory.map((lot)=>lot.product))].sort().map((product)=>productInventoryStatus(state,data,product));}

export function reservationCanCreate(state:InventoryLedgerState,data:WorkspaceData,orderId:string,lotId:string,quantity:number){
  if(quantity<=0)return false;
  const order=data.orders.find((item)=>item.id===orderId);const lot=data.inventory.find((item)=>item.id===lotId);
  if(!order||!lot||!["Approved","Allocated"].includes(order.status)||lot.status==="Quality hold")return false;
  if(order.product&&order.product!==lot.product)return false;
  if(activeReservedForOrder(state,orderId)+quantity>order.cases)return false;
  if(quantity>warehouseAvailable(state,lotId))return false;
  return true;
}

export function movementCanPost(state:InventoryLedgerState,input:{lotId:string;quantity:number;type:MovementType;fromNodeId?:string;toNodeId?:string;relatedOrderId?:string}){
  if(input.quantity<=0)return false;if(!input.fromNodeId&&!input.toNodeId)return false;if(input.fromNodeId&&input.fromNodeId===input.toNodeId)return false;
  const fromNode=input.fromNodeId?state.nodes.find((node)=>node.id===input.fromNodeId):undefined;const toNode=input.toNodeId?state.nodes.find((node)=>node.id===input.toNodeId):undefined;
  if(input.fromNodeId&&!fromNode)return false;if(input.toNodeId&&!toNode)return false;
  if(input.type!=="Adjustment"&&input.fromNodeId&&fromNode?.type!=="External"){
    const balance=nodeLotBalance(state,input.fromNodeId,input.lotId);if(balance<input.quantity)return false;
    if(input.fromNodeId===warehouseNodeId){const totalReserved=reservedQuantity(state,input.lotId);const thisOrderReserved=input.relatedOrderId?activeReservedForOrder(state,input.relatedOrderId,input.lotId):0;const protectedForOtherOrders=Math.max(0,totalReserved-thisOrderReserved);if(balance-protectedForOtherOrders<input.quantity)return false;}
  }
  return true;
}

export function orderDeliveryQuantity(state:InventoryLedgerState,orderId:string){return state.movements.filter((movement)=>movement.relatedOrderId===orderId&&movement.type==="Delivery").reduce((sum,movement)=>sum+movement.quantity,0);}
export function orderOutboundQuantity(state:InventoryLedgerState,orderId:string){return state.movements.filter((movement)=>movement.relatedOrderId===orderId&&["Transfer","Delivery"].includes(movement.type)&&movement.fromNodeId===warehouseNodeId).reduce((sum,movement)=>sum+movement.quantity,0);}
export function orderCanAdvanceInventory(state:InventoryLedgerState,order:Order,nextStatus:"Allocated"|"Out for delivery"|"Delivered"){
  if(nextStatus==="Allocated")return activeReservedForOrder(state,order.id)>=order.cases;
  if(nextStatus==="Out for delivery")return activeReservedForOrder(state,order.id)+fulfilledForOrder(state,order.id)>=order.cases&&orderOutboundQuantity(state,order.id)>=order.cases;
  return orderDeliveryQuantity(state,order.id)>=order.cases;
}
export function lotById(data:WorkspaceData,lotId:string):InventoryLot|undefined{return data.inventory.find((lot)=>lot.id===lotId);}
