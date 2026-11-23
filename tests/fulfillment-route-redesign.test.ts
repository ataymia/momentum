import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {
  pageForPath,routeLabel,canVisitRoute,requiresPrototypePage,
} from "../lib/navigation-route-registry";
import type {Role,WorkspaceUser} from "../lib/types";

const user=(role:Role):WorkspaceUser=>({
  id:"id-"+role,name:"Test",firstName:"Test",initials:"TE",title:"Test",
  role,team:role==="Customer"?"Customer":"Operations",email:"test@example.invalid",accent:"#123",
});
test("fulfillment areas have separate addressable routes and inventory-linked shipment details",()=>{
  for(const path of ["/inventory/packages","/inventory/shipments","/inventory/shipments/order-123","/operations/deliveries"]){
    assert(requiresPrototypePage(path),path);
    assert(canVisitRoute(user("Administrator"),path),path);
    assert(!canVisitRoute(user("Customer"),path),path);
  }
  assert.equal(pageForPath("/inventory/shipments/order-123"),"inventory");
  assert.equal(routeLabel("/inventory/shipments/order-123"),"Shipment details");
});
test("company-wide delivery operations are hidden from ordinary sales reps",()=>{
  assert.equal(canVisitRoute(user("Sales Representative"),"/operations/deliveries"),false);
  assert.equal(canVisitRoute(user("Marketing"),"/operations/deliveries"),false);
  assert.equal(canVisitRoute(user("Administrator"),"/operations/deliveries"),true);
});
test("fulfillment screens do not invent tracking numbers or mutate deliveries",()=>{
  const source=readFileSync("components/prototype/fulfillment-experience.tsx","utf8");
  assert.match(source,/activeReservedForOrder\(ledger,o\.id\)/);
  assert.match(source,/orderOutboundQuantity\(ledger,o\.id\)/);
  assert.match(source,/orderDeliveryQuantity\(ledger,order\.id\)/);
  assert.match(source,/deliveryStatusForOrder\(state,order\)/);
  assert.match(source,/signature/);
  assert.doesNotMatch(source,/createDeliveryTask\(/);
  assert.doesNotMatch(source,/postMovement\(/);
  assert.doesNotMatch(source,/recordPayment\(/);
});
test("route registry renders all fulfillment pages from the prototype hub",()=>{
  const source=readFileSync("components/prototype/operations-hub.tsx","utf8");
  for(const component of ["PackagesDirectory","ShipmentsDirectory","ShipmentDetail","DeliveryOperationsDirectory"]){
    assert.match(source,new RegExp("<"+component+"\\b"));
  }
});
