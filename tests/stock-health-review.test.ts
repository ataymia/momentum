import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {compareFefo,daysUntilBestBy,reviewInventoryLot} from "../lib/stock-health-review";
const asOf="2026-11-06";
const lot=(override:Partial<{bestBy:string;status:string;warehouseOnHand:number;reserved:number}>={})=>({bestBy:"2027-06-01",status:"Available",warehouseOnHand:20,reserved:4,...override});
test("healthy warehouse lot stays unflagged and best-by cannot silently dispose cases",()=>{
  const h=reviewInventoryLot(lot(),asOf);assert.equal(h.reviewRequired,false);assert.equal(h.summary,"No flagged exceptions");
});
test("best-by assessment catches past and near dates, and treats today as review-needed",()=>{
  assert.equal(daysUntilBestBy("2026-11-05",asOf),-1);
  assert.equal(daysUntilBestBy("2026-11-06",asOf),0);
  assert.equal(daysUntilBestBy("2026-12-07",asOf),31);
  assert.equal(reviewInventoryLot(lot({bestBy:"2026-11-05"}),asOf).issues.includes("Past best-by"),true);
  assert.equal(reviewInventoryLot(lot({bestBy:"2026-12-06"}),asOf).issues.includes("Best-by within 30 days"),true);
  assert.equal(reviewInventoryLot(lot({bestBy:"2026-12-07"}),asOf).reviewRequired,false);
});
test("invalid or absent best-by dates flag review instead of throwing or fabricating stock movement",()=>{
  for(const bestBy of ["","2026-13-01","2026-02-30","bogus"]){
    assert.equal(daysUntilBestBy(bestBy,asOf),null);
    assert.equal(reviewInventoryLot(lot({bestBy}),asOf).issues.includes("Missing best-by"),true);
  }
});
test("quality hold, negative custody and excess reservations are distinct exceptions",()=>{
  const h=reviewInventoryLot(lot({status:"Quality hold",warehouseOnHand:-2,reserved:3}),asOf);
  assert.deepEqual(h.issues,["Quality hold","Negative custody","Over-reserved"]);
  const excess=reviewInventoryLot(lot({warehouseOnHand:10,reserved:11}),asOf);
  assert.equal(excess.issues.includes("Over-reserved"),true);
});
test("FEFO advisory sorts earliest valid best-by first, undefined dates last",()=>{
  const a={lotCode:"A",bestBy:"2026-12-01"},b={lotCode:"B",bestBy:"2027-01-01"},missing={lotCode:"C",bestBy:""};
  assert.equal(compareFefo(a,b)<0,true);assert.equal(compareFefo(missing,a)>0,true);
});
test("inventory and driver views use source-linked ledger without privileged actions",()=>{
  const inventory=readFileSync("components/prototype/inventory-experience.tsx","utf8");
  const stops=readFileSync("components/prototype/driver-route-board.tsx","utf8");
  const shell=readFileSync("components/delivery-driver-shell.tsx","utf8");
  assert.match(inventory,/reviewInventoryLot/);
  assert.match(inventory,/nodeLotBalance/);
  assert.match(stops,/task\.driverId===currentUser\.id/);
  assert.match(stops,/orderDeliveryQuantity/);
  assert.match(stops,/Signature not yet verified/);
  assert.match(shell,/<DriverRouteBoard\/>/);
  assert.doesNotMatch(stops,/navigator\.geolocation/);
});

test("E05-E07 delivery exception queue is sortable while established self-delivery and dispatch remain available",()=>{
  const review=readFileSync("components/prototype/fulfillment-experience.tsx","utf8");
  const routes=readFileSync("lib/navigation-route-registry.ts","utf8");
  assert.match(review,/deliveryReconciliationIssue\(order,task,delivered,override\)/);
  assert.match(review,/exceptionsOnly/);
  assert.match(review,/DateFilter start=\{from\}/);
  assert.match(review,/const sort=useTableSort\("placedAt"\)/);
  assert.match(routes,/Rep Self-Delivery/);
  assert.match(routes,/\/crm\/self-delivery/);
  assert.match(routes,/\/operations\/legacy-dispatch/);
});
