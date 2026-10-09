import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Workforce Live uses real buttons, modal drill-down, and Google Maps links",()=>{
  const source=readFileSync("components/pages/workforce-live.tsx","utf8");
  assert.match(source,/page--workforce-live/);
  assert.match(source,/workforce-roster/);
  assert.match(source,/<Button[\s\S]{0,240}>View<\/Button>/);
  assert.match(source,/<Modal[\s\S]*workforce detail/);
  assert.match(source,/Open route in Google Maps/);
  assert.match(source,/googleMapsPointUrl/);
  assert.match(source,/googleMapsEmbedUrl/);
  assert.doesNotMatch(source,/routeProjection/);
  assert.doesNotMatch(source,/<svg/);
});

test("Workforce Live has dedicated three-column roster layout",()=>{
  const css=readFileSync("app/visual-polish-v2.css","utf8");
  assert.match(css,/\.workforce-roster article[\s\S]*grid-template-columns:44px minmax\(0,1fr\) max-content/);
  assert.match(css,/\.workforce-map iframe[\s\S]*height:300px/);
});

test("Order review hides internal approval-rule copy",()=>{
  const work=readFileSync("components/pages/work-v2.tsx","utf8");
  const orders=readFileSync("components/pages/orders-v3.tsx","utf8");
  assert.doesNotMatch(work,/Approval rule/);
  assert.doesNotMatch(work,/One Administrator decision/);
  assert.doesNotMatch(orders,/One Administrator approval required/);
  assert.match(orders,/Awaiting Administrator review/);
});

test("Delivered driver task reconciles and immediately displays as Delivered in Orders",()=>{
  const delivery=readFileSync("lib/delivery-context.tsx","utf8");
  const orders=readFileSync("components/pages/orders-v3.tsx","utf8");
  assert.match(delivery,/nextVerifiedDeliveryOrderStatus/);
  assert.match(delivery,/currentUser\.role!=="Delivery Driver"\|\|task\.driverId===currentUser\.id/);
  assert.ok(delivery.includes("setOrderStatus(candidate.order.id,next)"));
  assert.match(orders,/taskForOrder\(order\.id\)\?\.status==="Delivered"/);
  assert.match(orders,/selectedDisplayStatus/);
});
