import { isValidCalendarDateKey } from "./date-time";
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
const positiveFiniteQuantity=(value:number)=>Number.isFinite(value)&&value>0;
const nonnegativeFiniteQuantity=(value:number)=>Number.isFinite(value)&&value>=0;
const validTimestamp=(value?:string)=>Boolean(value&&(isValidCalendarDateKey(value)||!Number.isNaN(new Date(value).getTime())));
const movementTypes=new Set<MovementType>(["Receipt","Transfer","Allocation","Release","Delivery","Return","Sample","Damage","Shrink","Adjustment","Disposal"]);
const reservationStatuses=new Set<InventoryReservation["status"]>(["Active","Released","Fulfilled"]);
const countStatuses=new Set<InventoryCount["status"]>(["Open","Reconciled"]);
const uniqueById=<T extends {id:string}>(records:T[])=>{const seen=new Set<string>();return records.filter((record)=>Boolean(record?.id)&&!seen.has(record.id)&&(seen.add(record.id),true));};

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
  }).filter((movement)=>positiveFiniteQuantity(movement.quantity)&&validTimestamp(movement.at));
  return{version:1,nodes,movements,reservations:[],counts:[]};
}
export function normalizeInventoryLedger(input:unknown,data:WorkspaceData):InventoryLedgerState{
  const seed=createInventoryLedgerSeed(data);
  if(!input||typeof input!=="object")return seed;
  const state=input as Partial<InventoryLedgerState>;
  const seedNodeIds=new Set(seed.nodes.map((node)=>node.id));
  const storedNodes=uniqueById((Array.isArray(state.nodes)?state.nodes:[]).filter((node):node is InventoryNode=>Boolean(node?.id&&seedNodeIds.has(node.id)&&node.name?.trim()&&typeof node.active==="boolean")));
  const storedNodeById=new Map(storedNodes.map((node)=>[node.id,node]));
  const nodes=seed.nodes.map((node)=>{const stored=storedNodeById.get(node.id);return stored?{...node,active:stored.active}:node;});
  const nodeById=new Map(nodes.map((node)=>[node.id,node]));
  const lotByIdMap=new Map(data.inventory.map((lot)=>[lot.id,lot]));
  const orderById=new Map(data.orders.map((order)=>[order.id,order]));
  const storedMovements=uniqueById((Array.isArray(state.movements)?state.movements:[]).filter((movement):movement is InventoryMovement=>{
    if(!movement?.id||movement.id.startsWith("opening-")||!positiveFiniteQuantity(movement.quantity)||!movementTypes.has(movement.type)||!movement.reason?.trim()||!movement.actorId||!validTimestamp(movement.at))return false;
    const lot=lotByIdMap.get(movement.lotId);if(!lot||movement.product!==lot.product)return false;
    const from=movement.fromNodeId?nodeById.get(movement.fromNodeId):undefined;const to=movement.toNodeId?nodeById.get(movement.toNodeId):undefined;
    if(movement.fromNodeId&&!from||movement.toNodeId&&!to||movement.fromNodeId&&movement.fromNodeId===movement.toNodeId)return false;
    if(movement.type==="Adjustment"){if(Boolean(movement.fromNodeId)===Boolean(movement.toNodeId))return false;}else if(!from||!to)return false;
    const order=movement.relatedOrderId?orderById.get(movement.relatedOrderId):undefined;if(movement.relatedOrderId&&!order)return false;if(order&&order.product&&order.product!==lot.product)return false;
    if(movement.type==="Receipt"&&(from?.type!=="External"||!["Warehouse","Quality hold"].includes(to?.type??"")))return false;
    if(movement.type==="Delivery"){if(!order||to?.id!==`node-account-${order.accountId}`||["Customer","External","Quality hold","Disposed"].includes(from?.type??""))return false;}
    if(movement.type==="Return"&&order&&(from?.id!==`node-account-${order.accountId}`||!["Warehouse","Quality hold"].includes(to?.type??"")))return false;
    if(["Damage","Shrink"].includes(movement.type)&&!["Quality hold","Disposed"].includes(to?.type??""))return false;
    if(movement.type==="Disposal"&&to?.type!=="Disposed")return false;
    return true;
  }));
  const movements=[...seed.movements,...storedMovements];
  const movementById=new Map(movements.map((movement)=>[movement.id,movement]));

  const reservations:InventoryReservation[]=[];const reservedByOrder=new Map<string,number>();
  for(const reservation of uniqueById((Array.isArray(state.reservations)?state.reservations:[]).filter((item):item is InventoryReservation=>Boolean(item?.id)))){
    const order=orderById.get(reservation.orderId);const lot=lotByIdMap.get(reservation.lotId);
    if(!order||!lot||order.product&&order.product!==lot.product||!positiveFiniteQuantity(reservation.quantity)||reservation.quantity>order.cases||!reservationStatuses.has(reservation.status)||!reservation.createdBy||!validTimestamp(reservation.createdAt))continue;
    if(reservation.status==="Released"&&(!reservation.releasedAt||!validTimestamp(reservation.releasedAt)))continue;
    if(reservation.status==="Fulfilled"&&(!reservation.fulfilledAt||!validTimestamp(reservation.fulfilledAt)))continue;
    if(reservation.status!=="Released"){const used=reservedByOrder.get(order.id)??0;if(used+reservation.quantity>order.cases+0.005)continue;reservedByOrder.set(order.id,used+reservation.quantity);}
    reservations.push(reservation);
  }

  const counts=uniqueById((Array.isArray(state.counts)?state.counts:[]).filter((count):count is InventoryCount=>{
    if(!count?.id||!nodeById.has(count.nodeId)||nodeById.get(count.nodeId)?.type==="External"||!lotByIdMap.has(count.lotId)||!nonnegativeFiniteQuantity(count.countedQty)||!nonnegativeFiniteQuantity(count.systemQty)||!Number.isFinite(count.variance)||Math.abs(count.variance-(count.countedQty-count.systemQty))>=0.005||!countStatuses.has(count.status)||!count.countedBy||!validTimestamp(count.countedAt))return false;
    if(count.status==="Reconciled"&&(!count.reason?.trim()||!count.reconciledAt||!count.reconciledBy||!validTimestamp(count.reconciledAt)))return false;
    if(count.status==="Reconciled"&&Math.abs(count.variance)>=0.005){const adjustment=count.adjustmentMovementId?movementById.get(count.adjustmentMovementId):undefined;if(!adjustment||adjustment.type!=="Adjustment"||adjustment.lotId!==count.lotId||adjustment.quantity!==Math.abs(count.variance)||![adjustment.fromNodeId,adjustment.toNodeId].includes(count.nodeId))return false;}
    return true;
  }));
  return{version:1,nodes,movements,reservations,counts};
}
export function nodeLotBalance(state:InventoryLedgerState,nodeId:string,lotId:string){return state.movements.filter((movement)=>movement.lotId===lotId&&positiveFiniteQuantity(movement.quantity)).reduce((balance,movement)=>balance+(movement.toNodeId===nodeId?movement.quantity:0)-(movement.fromNodeId===nodeId?movement.quantity:0),0);}
export function lotBalances(state:InventoryLedgerState,lotId:string){return state.nodes.map((node)=>({node,balance:nodeLotBalance(state,node.id,lotId)})).filter((item)=>item.balance!==0);}
export function lotSystemQuantity(state:InventoryLedgerState,lotId:string){return state.nodes.filter((node)=>node.type!=="External").reduce((sum,node)=>sum+nodeLotBalance(state,node.id,lotId),0);}
export function reservedQuantity(state:InventoryLedgerState,lotId:string){return state.reservations.filter((reservation)=>reservation.lotId===lotId&&reservation.status==="Active"&&positiveFiniteQuantity(reservation.quantity)).reduce((sum,item)=>sum+item.quantity,0);}
export function activeReservedForOrder(state:InventoryLedgerState,orderId:string,lotId?:string){return state.reservations.filter((reservation)=>reservation.orderId===orderId&&reservation.status==="Active"&&positiveFiniteQuantity(reservation.quantity)&&(!lotId||reservation.lotId===lotId)).reduce((sum,item)=>sum+item.quantity,0);}
export function fulfilledForOrder(state:InventoryLedgerState,orderId:string){return state.reservations.filter((reservation)=>reservation.orderId===orderId&&reservation.status==="Fulfilled"&&positiveFiniteQuantity(reservation.quantity)).reduce((sum,item)=>sum+item.quantity,0);}
export function warehouseAvailable(state:InventoryLedgerState,lotId:string){return Math.max(0,nodeLotBalance(state,warehouseNodeId,lotId)-reservedQuantity(state,lotId));}
export function productAvailableSellableCases(state:InventoryLedgerState,data:WorkspaceData,product:string){return data.inventory.filter((lot)=>lot.product===product&&lot.status!=="Quality hold").reduce((sum,lot)=>sum+warehouseAvailable(state,lot.id),0);}
export function productInventoryStatus(state:InventoryLedgerState,data:WorkspaceData,product:string){const available=productAvailableSellableCases(state,data,product);return{product,available,requiresManagerApproval:available<LOW_STOCK_MANAGER_APPROVAL_THRESHOLD_CASES,reorderNeeded:available<WAREHOUSE_REORDER_THRESHOLD_CASES};}
export function inventoryProductStatuses(state:InventoryLedgerState,data:WorkspaceData){return [...new Set(data.inventory.map((lot)=>lot.product))].sort().map((product)=>productInventoryStatus(state,data,product));}

export function reservationCanCreate(state:InventoryLedgerState,data:WorkspaceData,orderId:string,lotId:string,quantity:number){
  if(!positiveFiniteQuantity(quantity))return false;
  const order=data.orders.find((item)=>item.id===orderId);const lot=data.inventory.find((item)=>item.id===lotId);
  if(!order||!lot||!["Approved","Allocated"].includes(order.status)||!positiveFiniteQuantity(order.cases)||lot.status==="Quality hold")return false;
  if(order.product&&order.product!==lot.product)return false;
  if(activeReservedForOrder(state,orderId)+quantity>order.cases)return false;
  if(quantity>warehouseAvailable(state,lotId))return false;
  return true;
}

export function movementCanPost(state:InventoryLedgerState,input:{lotId:string;quantity:number;type:MovementType;fromNodeId?:string;toNodeId?:string;relatedOrderId?:string}){
  if(!positiveFiniteQuantity(input.quantity)||!movementTypes.has(input.type))return false;if(!input.fromNodeId&&!input.toNodeId)return false;if(input.fromNodeId&&input.fromNodeId===input.toNodeId)return false;
  const fromNode=input.fromNodeId?state.nodes.find((node)=>node.id===input.fromNodeId):undefined;const toNode=input.toNodeId?state.nodes.find((node)=>node.id===input.toNodeId):undefined;
  if(input.fromNodeId&&!fromNode)return false;if(input.toNodeId&&!toNode)return false;
  if(input.type!=="Adjustment"&&input.fromNodeId&&fromNode?.type!=="External"){
    const balance=nodeLotBalance(state,input.fromNodeId,input.lotId);if(balance<input.quantity)return false;
    if(input.fromNodeId===warehouseNodeId){const totalReserved=reservedQuantity(state,input.lotId);const thisOrderReserved=input.relatedOrderId?activeReservedForOrder(state,input.relatedOrderId,input.lotId):0;const protectedForOtherOrders=Math.max(0,totalReserved-thisOrderReserved);if(balance-protectedForOtherOrders<input.quantity)return false;}
  }
  return true;
}

export function orderDeliveryQuantity(state:InventoryLedgerState,orderId:string){return state.movements.filter((movement)=>movement.relatedOrderId===orderId&&movement.type==="Delivery"&&positiveFiniteQuantity(movement.quantity)).reduce((sum,movement)=>sum+movement.quantity,0);}
export function orderLotWarehouseNetOutbound(state:InventoryLedgerState,orderId:string,lotId:string){return Math.max(0,state.movements.filter((movement)=>movement.relatedOrderId===orderId&&movement.lotId===lotId&&positiveFiniteQuantity(movement.quantity)).reduce((sum,movement)=>sum+(movement.fromNodeId===warehouseNodeId?movement.quantity:0)-(movement.toNodeId===warehouseNodeId?movement.quantity:0),0));}
export function orderOutboundQuantity(state:InventoryLedgerState,orderId:string){const lots=[...new Set(state.movements.filter((movement)=>movement.relatedOrderId===orderId).map((movement)=>movement.lotId))];return lots.reduce((sum,lotId)=>sum+orderLotWarehouseNetOutbound(state,orderId,lotId),0);}
export function orderCanAdvanceInventory(state:InventoryLedgerState,order:Order,nextStatus:"Allocated"|"Out for delivery"|"Delivered"){
  if(!positiveFiniteQuantity(order.cases))return false;
  if(nextStatus==="Allocated")return activeReservedForOrder(state,order.id)>=order.cases;
  if(nextStatus==="Out for delivery")return activeReservedForOrder(state,order.id)+fulfilledForOrder(state,order.id)>=order.cases&&orderOutboundQuantity(state,order.id)>=order.cases;
  return orderDeliveryQuantity(state,order.id)>=order.cases;
}
export function lotById(data:WorkspaceData,lotId:string):InventoryLot|undefined{return data.inventory.find((lot)=>lot.id===lotId);}
