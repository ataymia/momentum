import assert from "node:assert/strict";
import test from "node:test";
import { createInventoryLedgerSeed, normalizeInventoryLedger, planDriverDeliveryPosting, warehouseNodeId } from "../lib/inventory-ledger";
import type { WorkspaceData, Order } from "../lib/types";

const driver={id:"driver-one",name:"Driver One",role:"Delivery Driver"} as WorkspaceData["users"][number];
const account={id:"account-one",name:"Store One"} as WorkspaceData["accounts"][number];
const lotA={id:"lot-a",product:"Golden Eagle Original",onHand:30,reserved:0,available:30,lotCode:"LOT",location:"Main warehouse",receivedAt:"2026-09-10",bestBy:"2027-06-01",status:"Available"} as WorkspaceData["inventory"][number];
const lotB={id:"lot-b",product:"Golden Eagle Tropical",onHand:30,reserved:0,available:30,lotCode:"LOT",location:"Main warehouse",receivedAt:"2026-09-10",bestBy:"2027-06-01",status:"Available"} as WorkspaceData["inventory"][number];
const order={id:"order-one",number:"ORD-ONE",accountId:account.id,ownerId:driver.id,status:"Out for delivery",cases:10,amount:240,pricePerCase:24,product:lotA.product,placedAt:"2026-10-09T10:00:00.000Z"} as Order;
const data={users:[driver],accounts:[account],orders:[order],inventory:[lotA,lotB]} as WorkspaceData;
const driverNode=`node-user-${driver.id}`;
const accountNode=`node-account-${account.id}`;
const load=(lotId:string,quantity:number,id:string)=>({id,lotId,product:lotId===lotA.id?lotA.product:lotB.product,quantity,type:"Transfer" as const,fromNodeId:warehouseNodeId,toNodeId:driverNode,relatedOrderId:order.id,reason:"Loaded",at:"2026-10-09T10:10:00.000Z",actorId:driver.id});
const delivered=(lotId:string,quantity:number,id:string)=>({id,lotId,product:lotId===lotA.id?lotA.product:lotB.product,quantity,type:"Delivery" as const,fromNodeId:driverNode,toNodeId:accountNode,relatedOrderId:order.id,reason:"Delivered",at:"2026-10-09T11:10:00.000Z",actorId:driver.id});

test("fully loaded delivery posts with no active reservation when transfer evidence exists",()=>{
 const ledger=createInventoryLedgerSeed(data);
 ledger.movements.push(load(lotA.id,10,"loaded-a"));
 const plan=planDriverDeliveryPosting(ledger,data,order,driver.id);
 assert.deepEqual(plan,{ok:true,movements:[{lotId:lotA.id,quantity:10}]});
});

test("never complete a delivery just because its order status says In transit",()=>{
 const ledger=createInventoryLedgerSeed(data);
 const plan=planDriverDeliveryPosting(ledger,data,order,driver.id);
 assert.equal(plan.ok,false);
 if(!plan.ok)assert.match(plan.message,/No recorded load/);
});

test("a load into a different driver's custody cannot authorize completion",()=>{
 const ledger=createInventoryLedgerSeed(data);
 ledger.movements.push({...load(lotA.id,10,"wrong-driver"),toNodeId:"node-user-another"});
 assert.equal(planDriverDeliveryPosting(ledger,data,order,driver.id).ok,false);
});

test("partial deliveries post only remaining cases; a second attempt is idempotent",()=>{
 const ledger=createInventoryLedgerSeed(data);
 ledger.movements.push(load(lotA.id,10,"loaded-a"),delivered(lotA.id,4,"delivery-a"));
 assert.deepEqual(planDriverDeliveryPosting(ledger,data,order,driver.id),{ok:true,movements:[{lotId:lotA.id,quantity:6}]});
 ledger.movements.push(delivered(lotA.id,6,"delivery-b"));
 assert.deepEqual(planDriverDeliveryPosting(ledger,data,order,driver.id),{ok:true,movements:[]});
});

test("do not consume another order's custody or silently forgive missing cases",()=>{
 const ledger=createInventoryLedgerSeed(data);
 ledger.movements.push(load(lotA.id,10,"loaded-a"),{
   ...load(lotA.id,5,"unrelated"),id:"other-outgoing",type:"Transfer",fromNodeId:driverNode,toNodeId:warehouseNodeId,relatedOrderId:"another-order",
 });
 const plan=planDriverDeliveryPosting(ledger,data,order,driver.id);
 assert.equal(plan.ok,false);
 if(!plan.ok)assert.match(plan.message,/stock balance/);
});

test("full SKU mix required, not just total number of cases",()=>{
 const split={...order,cases:10,lines:[{id:"line-a",product:lotA.product,cases:5,pricePerCase:24,amount:120},{id:"line-b",product:lotB.product,cases:5,pricePerCase:24,amount:120}]} as Order;
 const sample={...data,orders:[split]};
 const ledger=createInventoryLedgerSeed(sample);
 ledger.movements.push(load(lotA.id,10,"all-one-sku"));
 const plan=planDriverDeliveryPosting(ledger,sample,split,driver.id);
 assert.equal(plan.ok,false);
 if(!plan.ok)assert.match(plan.message,/loaded/);
});

test("normalizing during partial data hydration preserves driver transfers and reservations",()=>{
 const ledger=createInventoryLedgerSeed(data);
 ledger.movements.push(load(lotA.id,10,"loaded-a"));
 ledger.reservations.push({id:"reserve-a",orderId:order.id,lotId:lotA.id,quantity:10,status:"Active",createdAt:"2026-10-09T10:01:00.000Z",createdBy:driver.id});
 const emptyScope={...data,users:[],accounts:[],orders:[],inventory:[]} as WorkspaceData;
 const duringLoad=normalizeInventoryLedger(ledger,emptyScope);
 assert.equal(duringLoad.movements.some((movement)=>movement.id==="loaded-a"),true);
 assert.equal(duringLoad.reservations.some((item)=>item.id==="reserve-a"),true);
 assert.equal(duringLoad.nodes.some((node)=>node.id===driverNode),true);
 const restored=normalizeInventoryLedger(duringLoad,data);
 assert.deepEqual(planDriverDeliveryPosting(restored,data,order,driver.id),{ok:true,movements:[{lotId:lotA.id,quantity:10}]});
});
