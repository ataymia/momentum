import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {compareFefo,daysUntilBestBy,reviewInventoryLot} from "../lib/stock-health-review";
import {canVisitRoute,requiresPrototypePage,routeLabel,permissionForPath} from "../lib/navigation-route-registry";
import type {WorkspaceUser} from "../lib/types";
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
  assert.match(review,/reviewDeliveryCloseout/);
  assert.match(review,/exceptionsOnly/);
  assert.match(review,/DateFilter start=\{from\}/);
  assert.match(review,/const sort=useTableSort\("placedAt"\)/);
  assert.match(routes,/Rep Self-Delivery/);
  assert.match(routes,/\/crm\/self-delivery/);
  assert.match(routes,/\/operations\/legacy-dispatch/);
});

test("warehouse location route supports deep links without exposing company stock to drivers, reps or customers",()=>{
  const role=(role:WorkspaceUser["role"]):WorkspaceUser=>({id:"role-"+role,name:"Test",firstName:"Test",email:"test@example.invalid",initials:"TT",title:"Test",role,team:"Operations",accent:"#333"});
  for(const allowed of ["Administrator","Operations","Warehouse"] as const){
    assert.equal(canVisitRoute(role(allowed),"/inventory/locations"),true);
    assert.equal(canVisitRoute(role(allowed),"/inventory/locations/node-warehouse-main"),true);
  }
  for(const forbidden of ["Customer","Sales Representative","Sales Manager","Delivery Driver","Marketing","Brand Ambassador"] as const){
    assert.equal(canVisitRoute(role(forbidden),"/inventory/locations"),false);
    assert.equal(canVisitRoute(role(forbidden),"/inventory/locations/node-warehouse-main"),false);
  }
  assert.equal(requiresPrototypePage("/inventory/locations"),true);
  assert.equal(requiresPrototypePage("/inventory/locations/node-warehouse-main"),true);
  assert.equal(permissionForPath("/inventory/locations/node-warehouse-main"),"inventory");
  assert.equal(routeLabel("/inventory/locations/node-warehouse-main"),"Warehouse location details");
});
test("warehouse record detail reads existing movements, counts and lot identifiers without posting",()=>{
  const source=readFileSync("components/prototype/inventory-locations-experience.tsx","utf8");
  assert.match(source,/nodeLotBalance\(ledger,node\.id,lot\.id\)/);
  assert.match(source,/ledger\.movements\.filter/);
  assert.match(source,/ledger\.counts\.filter/);
  assert.match(source,/reservedQuantity\(ledger,lot\.id\)/);
  assert.doesNotMatch(source,/postMovement|reconcileCount|setItem|createReceipt/);
});

test("E06 self-delivery redesign preserves the trusted server-only workflow and recipient signature",()=>{
  const view=readFileSync("components/orders/rep-self-delivery.tsx","utf8");
  const routes=readFileSync("lib/navigation-route-registry.ts","utf8");
  const hub=readFileSync("components/prototype/operations-hub.tsx","utf8");
  assert.match(view,/firebaseFunctionUrl\("repSelfDelivery"\)/);
  assert.match(view,/authorization:"Bearer "/);
  assert.match(view,/cloudConfirmed===true/);
  assert.match(view,/DeliverySignaturePad/);
  assert.match(view,/getState\(selected\.id\)/);
  assert.match(view,/prototype-heading/);
  assert.match(view,/prototype-table/);
  assert.doesNotMatch(view,/postMovement\(/);
  assert.doesNotMatch(view,/createDeliveryTask\(/);
  assert.match(hub,/if\(path==="\/crm\/self-delivery"\)return currentUser\?\.role==="Sales Representative"/);
  assert.match(hub,/<RepSelfDelivery\/>/);
  assert.match(hub,/Administrator delivery oversight/);
  assert.match(routes,/Rep Self-Delivery.*state: "prototype"/);
  assert.equal(requiresPrototypePage("/crm/self-delivery"),true);
});

test("E07 prevents premature office Dispatch retirement before scheduling parity",()=>{
  const registry=readFileSync("lib/navigation-route-registry.ts","utf8");
  const dispatch=readFileSync("components/pages/dispatch-board.tsx","utf8");
  const review=readFileSync("components/prototype/fulfillment-experience.tsx","utf8");
  assert.match(registry,/dispatch: "\/operations\/legacy-dispatch"/);
  assert.match(dispatch,/createAppointment/);
  assert.match(dispatch,/reassignAppointment/);
  assert.match(dispatch,/moveAppointment/);
  assert.match(dispatch,/canManageSchedule/);
  assert.match(review,/Legacy office Dispatch must stay available/);
});

test("E05 distinguishes posted over-delivery and missing warehouse custody from legitimate completion",()=>{
  const ops=readFileSync("components/prototype/fulfillment-experience.tsx","utf8");
  const driver=readFileSync("components/prototype/driver-route-board.tsx","utf8");
  assert.match(ops,/reviewDeliveryCloseout/);
  assert.match(ops,/orderOutboundQuantity\(ledger,order\.id\)/);
  assert.match(readFileSync("lib/fulfillment-closeout-review.ts","utf8"),/Loaded or departed without full recorded warehouse outbound/);
  assert.match(driver,/reviewDeliveryCloseout/);
  assert.match(driver,/state\.overrides\.some/);
  assert.match(driver,/const complete=review\.complete/);
  assert.match(readFileSync("lib/fulfillment-closeout-review.ts","utf8"),/deliveredCases<=order\.cases\+0\.005/);
  assert.match(ops,/Overposted: reconciliation required/);
  assert.match(ops,/summary\.filter\(x=>x\.complete&&x\.proof\)/);
});
