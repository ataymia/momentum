import assert from "node:assert/strict";
import test from "node:test";
import { createInventoryLedgerSeed, warehouseNodeId } from "../lib/inventory-ledger";
import { nextVerifiedDeliveryOrderStatus } from "../lib/delivery-status-reconciliation";
import type { DeliveryTask } from "../lib/delivery-engine";
import type { WorkspaceData, Order, InventoryLot } from "../lib/types";

const driver={id:"driver-1",role:"Delivery Driver",name:"Driver One"} as WorkspaceData["users"][number];
const location={id:"store-1",name:"Store One"} as WorkspaceData["accounts"][number];
const lot={id:"lot-1",lotCode:"LOT-1",product:"Golden Eagle Original",receivedAt:"2026-09-01",bestBy:"2027-09-01",onHand:20,reserved:0,available:20,location:"Warehouse",status:"Available"} as InventoryLot;
const order={id:"ord-1",number:"ORD-1",accountId:location.id,ownerId:driver.id,status:"Allocated",cases:4,amount:96,pricePerCase:24,product:lot.product,placedAt:"2026-10-09T10:00:00.000Z"} as Order;
const data={users:[driver],accounts:[location],orders:[order],inventory:[lot]} as WorkspaceData;
const load={id:"movement-load",lotId:lot.id,product:lot.product,quantity:4,type:"Transfer" as const,fromNodeId:warehouseNodeId,toNodeId:`node-user-${driver.id}`,relatedOrderId:order.id,reason:"Driver loaded",at:"2026-10-09T10:02:00.000Z",actorId:driver.id};
const task={id:"task-1",orderId:order.id,driverId:driver.id,status:"In transit",acceptedAt:"2026-10-09T10:00:00.000Z",acceptedBy:driver.id,loadedAt:"2026-10-09T10:01:00.000Z",departedAt:"2026-10-09T10:03:00.000Z",history:[]} as DeliveryTask;

test("restore exactly one legal order stage when driver loaded inventory matches",()=>{
 const ledger=createInventoryLedgerSeed(data);ledger.movements.push(load);
 assert.equal(nextVerifiedDeliveryOrderStatus(task,order,ledger,data),"Out for delivery");
 assert.equal(nextVerifiedDeliveryOrderStatus(task,{...order,status:"Approved"},ledger,data),"Allocated");
 assert.equal(nextVerifiedDeliveryOrderStatus({...task,status:"Loaded"},order,ledger,data),undefined);
});
test("cannot advance from in-transit task flags without verifiable driver custody",()=>{
 const ledger=createInventoryLedgerSeed(data);
 assert.equal(nextVerifiedDeliveryOrderStatus(task,order,ledger,data),undefined);
 ledger.movements.push({...load,toNodeId:"node-user-other"});
 assert.equal(nextVerifiedDeliveryOrderStatus(task,order,ledger,data),undefined);
});
test("do not rewrite paid/cancelled orders or infer delivery without signed stock movement",()=>{
 const ledger=createInventoryLedgerSeed(data);ledger.movements.push(load);
 assert.equal(nextVerifiedDeliveryOrderStatus(task,{...order,status:"Paid"},ledger,data),undefined);
 assert.equal(nextVerifiedDeliveryOrderStatus(task,{...order,status:"Cancelled"},ledger,data),undefined);
 assert.equal(nextVerifiedDeliveryOrderStatus({...task,status:"Delivered"},{...order,status:"Out for delivery"},ledger,data),undefined);
 ledger.movements.push({id:"movement-delivery",lotId:lot.id,product:lot.product,quantity:4,type:"Delivery",fromNodeId:`node-user-${driver.id}`,toNodeId:`node-account-${location.id}`,relatedOrderId:order.id,reason:"Delivered",at:"2026-10-09T10:05:00.000Z",actorId:driver.id});
 const signature={strokes:[[[12,20],[30,50]]],signedAt:"2026-10-09T10:05:00.000Z",capturedBy:driver.id};
 assert.equal(nextVerifiedDeliveryOrderStatus({...task,status:"Delivered",signature},{...order,status:"Out for delivery"},ledger,data),"Delivered");
});
