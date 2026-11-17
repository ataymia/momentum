import test from "node:test";
import assert from "node:assert/strict";
import {reconcileInventoryCount,releaseEditableOrderReservations} from "../lib/inventory-transaction-guards";
import type {InventoryLedgerState} from "../lib/inventory-ledger";
import type {WorkspaceData} from "../lib/types";
const stamp="2026-11-15T17:00:00.000Z";
const lot={id:"lot-1",product:"Golden Eagle Original",onHand:10,reserved:5,available:5} as WorkspaceData["inventory"][number];
const snapshot=():InventoryLedgerState=>({
 version:1,nodes:[{id:"warehouse",name:"Warehouse",type:"Warehouse",active:true}],
 movements:[{id:"received",lotId:lot.id,product:lot.product,quantity:10,
  type:"Receipt",fromNodeId:"outside",toNodeId:"warehouse",
  at:stamp,reason:"Purchase receipt",actorId:"warehouse-uid"}],
 reservations:[{id:"res-1",orderId:"order-1",lotId:lot.id,quantity:5,
  status:"Active",createdAt:stamp,createdBy:"ops"}],
 counts:[{id:"count-1",nodeId:"warehouse",lotId:lot.id,
  countedQty:8,systemQty:10,variance:-2,countedAt:stamp,countedBy:"counter",status:"Open"}],
});
const args={countId:"count-1",reviewerId:"reviewer",
 reason:"Warehouse recount confirmed",at:stamp,adjustmentMovementId:"adjustment-1"};
test("editing order releases only unshipped reservations, keeping original snapshot intact",()=>{
 const before=snapshot();
 const result=releaseEditableOrderReservations(before,"order-1",stamp);
 assert.equal(result.ok,true);
 assert.equal(before.reservations[0].status,"Active");
 assert.equal(result.state.reservations[0].status,"Released");
 assert.equal(releaseEditableOrderReservations(result.state,"order-1",stamp).state,result.state);
 const shipped=snapshot();
 shipped.movements.push({id:"load-1",lotId:lot.id,product:lot.product,quantity:1,
  type:"Transfer",fromNodeId:"node-warehouse-main",toNodeId:"driver",
  relatedOrderId:"order-1",at:stamp,reason:"Loaded",actorId:"ops"});
 assert.equal(releaseEditableOrderReservations(shipped,"order-1",stamp).ok,false);
});
test("count approval requires independent reviewer and unchanged stock balance",()=>{
 const before=snapshot();
 const data={inventory:[lot]};
 assert.equal(reconcileInventoryCount(before,data,{...args,reviewerId:"counter"}).ok,false);
 const result=reconcileInventoryCount(before,data,args);
 assert.equal(result.ok,true);
 assert.equal(before.counts[0].status,"Open");
 assert.equal(result.state.counts[0].status,"Reconciled");
 assert.equal(result.state.movements[0].quantity,2);
 assert.equal(result.state.movements[0].fromNodeId,"warehouse");
 assert.equal(reconcileInventoryCount(result.state,data,args).ok,false);
 const changed=snapshot();
 changed.movements.push({id:"late-receipt",lotId:lot.id,product:lot.product,quantity:2,
  type:"Receipt",fromNodeId:"outside",toNodeId:"warehouse",
  at:stamp,reason:"Later receipt",actorId:"warehouse-uid"});
 const stale=reconcileInventoryCount(changed,data,args);
 assert.equal(stale.ok,false);
 assert.match(stale.blocker??"",/Stock moved/);
 assert.equal(stale.state,changed);
});
test("fractional count, mismatched variance and missing lot fail closed",()=>{
 const data={inventory:[lot]};
 for(const mutate of [
  (s:InventoryLedgerState)=>{s.counts[0].countedQty=8.5;},
  (s:InventoryLedgerState)=>{s.counts[0].variance=1;},
  (s:InventoryLedgerState)=>{s.counts[0].systemQty=-2;},
 ]){
  const state=snapshot();mutate(state);
  assert.equal(reconcileInventoryCount(state,data,args).ok,false);
 }
 assert.equal(reconcileInventoryCount(snapshot(),{inventory:[]},args).ok,false);
});
