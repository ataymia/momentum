import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {canMutatePrototypeFulfillment,nextShipmentStep,shipmentStepDescription} from "../lib/fulfillment-prototype-policy";
import type {Order} from "../lib/types";
import type {DeliveryTask} from "../lib/delivery-engine";

const order=(status:Order["status"])=>({status});
const task=(status:DeliveryTask["status"])=>({status});

test("fulfillment actions require disconnected local demo and a management role",()=>{
  const valid={isDemo:true,persistenceMode:"local" as const,hasFirebaseSession:false,role:"Administrator" as const};
  assert(canMutatePrototypeFulfillment(valid));
  assert(canMutatePrototypeFulfillment({...valid,role:"Operations"}));
  assert(!canMutatePrototypeFulfillment({...valid,role:"Warehouse"}));
  assert(!canMutatePrototypeFulfillment({...valid,role:"Sales Representative"}));
  assert(!canMutatePrototypeFulfillment({...valid,role:"Delivery Driver"}));
  assert(!canMutatePrototypeFulfillment({...valid,hasFirebaseSession:true}));
  assert(!canMutatePrototypeFulfillment({...valid,isDemo:false}));
  assert(!canMutatePrototypeFulfillment({...valid,persistenceMode:"firestore"}));
});

test("shipment flow advances in strict steps from approved order to recipient proof",()=>{
  assert.equal(nextShipmentStep(order("Approved")),"assign");
  assert.equal(nextShipmentStep(order("Approved"),task("Accepted")),"reserve");
  assert.equal(nextShipmentStep(order("Allocated"),task("Accepted")),"load");
  assert.equal(nextShipmentStep(order("Allocated"),task("Loaded")),"depart");
  assert.equal(nextShipmentStep(order("Out for delivery"),task("In transit")),"recipient-proof");
  assert.equal(nextShipmentStep(order("Delivered"),task("Delivered")),"complete");
  assert.equal(nextShipmentStep(order("Awaiting approval")),"review");
  assert.equal(nextShipmentStep(order("Approved"),task("Cancelled")),"assign");
  assert.equal(nextShipmentStep(order("Approved"),task("Loaded")),"depart");
  assert.equal(nextShipmentStep(order("Delivered")),"review");
});

test("UI defers approval, stock reservation and driver custody authorization to existing engines",()=>{
  const source=readFileSync("components/prototype/fulfillment-controls.tsx","utf8");
  assert.match(source,/useDelivery\(\)/);
  for(const action of ["assignDelivery","cancelDelivery","prepareDelivery","markLoaded","startDelivery","addDeliveryNote"]){
    assert.match(source,new RegExp("\\b"+action+"\\("));
  }
  assert.match(source,/useFirebaseSessionOptional\(\)/);
  assert.match(source,/hasFirebaseSession:Boolean\(session\?\.session\?\.uid\)/);
  assert.match(source,/momentumStorage\.mode\(\)/);
  assert.match(source,/canMutatePrototypeFulfillment\(/);
  assert.doesNotMatch(source,/markDelivered\(/);
  assert.doesNotMatch(source,/recordDeliveryCollection\(/);
  assert.doesNotMatch(source,/setOrderStatus\(/);
  assert.doesNotMatch(source,/postMovement\(/);
});

test("no invented signature or payment settlement and field actions remain separate",()=>{
  assert.match(shipmentStepDescription["recipient-proof"],/signature/);
  const source=readFileSync("components/prototype/fulfillment-controls.tsx","utf8");
  assert.match(source,/No completion, collection or fabricated proof is available here/);
  assert.match(source,/physically loaded into the assigned driver/);
  assert.match(source,/reason\.trim\(\)\.length<8/);
});
