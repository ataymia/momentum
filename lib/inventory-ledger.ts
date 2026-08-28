import type { InventoryLot, WorkspaceData } from "./types";

export const INVENTORY_LEDGER_STORAGE_KEY="momentum-inventory-ledger-v1";
export type InventoryNodeType="Warehouse"|"Bin"|"Vehicle"|"Employee custody"|"Customer"|"Quality hold"|"Disposed"|"External";
export type InventoryNode={id:string;name:string;type:InventoryNodeType;active:boolean;userId?:string;accountId?:string};
export type MovementType="Receipt"|"Transfer"|"Allocation"|"Release"|"Delivery"|"Return"|"Sample"|"Damage"|"Shrink"|"Adjustment"|"Disposal";
export type InventoryMovement={id:string;lotId:string;product:string;quantity:number;type:MovementType;fromNodeId?:string;toNodeId?:string;relatedOrderId?:string;reason:string;at:string;actorId:string};
export type InventoryReservation={id:string;orderId:string;lotId:string;quantity:number;status:"Active"|"Released"|"Fulfilled";createdAt:string;createdBy:string;releasedAt?:string;fulfilledAt?:string};
export type InventoryCount={id:string;nodeId:string;lotId:string;countedQty:number;systemQty:number;variance:number;countedAt:string;countedBy:string;status:"Open"|"Reconciled";reason?:string;reconciledAt?:string;reconciledBy?:string;adjustmentMovementId?:string};
export type InventoryLedgerState={version:1;nodes:InventoryNode[];movements:InventoryMovement[];reservations:InventoryReservation[];counts:InventoryCount[]};

const now=()=>new Date().toISOString();
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
export function warehouseAvailable(state:InventoryLedgerState,lotId:string){return Math.max(0,nodeLotBalance(state,warehouseNodeId,lotId)-reservedQuantity(state,lotId));}
export function movementCanPost(state:InventoryLedgerState,input:{lotId:string;quantity:number;type:MovementType;fromNodeId?:string;toNodeId?:string}){if(input.quantity<=0)return false;if(!input.fromNodeId&&!input.toNodeId)return false;if(input.fromNodeId&&input.fromNodeId===input.toNodeId)return false;if(input.type!=="Adjustment"&&input.fromNodeId&&state.nodes.find((node)=>node.id===input.fromNodeId)?.type!=="External"&&nodeLotBalance(state,input.fromNodeId,input.lotId)<input.quantity)return false;return true;}
export function lotById(data:WorkspaceData,lotId:string):InventoryLot|undefined{return data.inventory.find((lot)=>lot.id===lotId);}
