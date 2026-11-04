import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {canVisitRoute,pageForPath,requiresPrototypePage,routeLabel} from "../lib/navigation-route-registry";
import {repDeliveryCandidate,repDeliveryNextStep,repDeliveryProofRecorded,repDeliverySteps} from "../lib/rep-delivery-workspace-policy";
import type {Order,Role,WorkspaceUser} from "../lib/types";

const order=(status:Order["status"],extra:Partial<Order>={}):Order=>({
  id:"order-123",number:"GE-123",accountId:"account-1",ownerId:"rep-1",
  priceBasis:"Tier A",paymentStatus:"Not invoiced",cases:3,pricePerCase:24,amount:72,
  status,placedAt:"2026-11-03",product:"0.25L Golden Eagle (24pack)",...extra,
});
const actor=(role:Role):WorkspaceUser=>({
  id:"rep-1",name:"Rep",firstName:"Rep",initials:"RE",role,team:role==="Customer"?"Customer":"Sales",
  title:"Sales",email:"rep@example.invalid",accent:"#123456",
});
const record=(taskStatus:"Unclaimed"|"Accepted"|"Loaded"|"In transit"|"Delivered",orderStatus:string)=>({
  ok:true,orderId:"order-123",taskStatus,orderStatus,cloudConfirmed:true,
});

test("self-delivery only exposes own approved-or-later orders and retains paid history",()=>{
  assert(repDeliveryCandidate(order("Approved"),"rep-1"));
  assert(repDeliveryCandidate(order("Allocated"),"rep-1"));
  assert(repDeliveryCandidate(order("Out for delivery"),"rep-1"));
  assert(repDeliveryCandidate(order("Delivered"),"rep-1"));
  assert(repDeliveryCandidate(order("Paid"),"rep-1"));
  assert(!repDeliveryCandidate(order("Draft"),"rep-1"));
  assert(!repDeliveryCandidate(order("Awaiting approval"),"rep-1"));
  assert(!repDeliveryCandidate(order("Approved",{testOnly:true}),"rep-1"));
  assert(!repDeliveryCandidate(order("Approved",{ownerId:"other"}),"rep-1"));
});

test("steps derive only from matching cloud-confirmed order and task status",()=>{
  assert.equal(repDeliveryNextStep(record("Unclaimed","Approved"),"order-123"),"claim");
  assert.equal(repDeliveryNextStep(record("Accepted","Approved"),"order-123"),"pack");
  assert.equal(repDeliveryNextStep(record("Accepted","Allocated"),"order-123"),"load");
  assert.equal(repDeliveryNextStep(record("Loaded","Allocated"),"order-123"),"depart");
  assert.equal(repDeliveryNextStep(record("In transit","Out for delivery"),"order-123"),"complete");
  assert.equal(repDeliveryNextStep(record("Delivered","Delivered"),"order-123"),null);
  assert.equal(repDeliveryNextStep(record("Accepted","Out for delivery"),"order-123"),null);
  assert.equal(repDeliveryNextStep({...record("Accepted","Approved"),cloudConfirmed:false},"order-123"),null);
  assert.equal(repDeliveryNextStep({...record("Accepted","Approved"),orderId:"other"},"order-123"),null);
  assert.equal(repDeliveryNextStep(null,"order-123"),null);
  assert.deepEqual(repDeliverySteps,["claim","pack","load","depart","complete"]);
});
test("recorded completion is never assumed from an unverified server state",()=>{
  assert(repDeliveryProofRecorded(record("Delivered","Delivered"),"order-123"));
  assert(repDeliveryProofRecorded(record("Delivered","Paid"),"order-123"));
  assert(!repDeliveryProofRecorded(record("In transit","Out for delivery"),"order-123"));
  assert(!repDeliveryProofRecorded({...record("Delivered","Delivered"),cloudConfirmed:false},"order-123"));
  assert(!repDeliveryProofRecorded({...record("Delivered","Delivered"),orderId:"other"},"order-123"));
});
test("rep has own mobile route, shareable record links and no other role can enter",()=>{
  for(const path of ["/crm/self-delivery","/crm/self-delivery/order-123"]){
    assert.equal(pageForPath(path),"orders");
    assert(requiresPrototypePage(path));
    assert(canVisitRoute(actor("Sales Representative"),path));
    for(const role of ["Administrator","Sales Manager","Operations","Customer","Delivery Driver"] as Role[])
      assert.equal(canVisitRoute(actor(role),path),false,role+" "+path);
  }
  assert.equal(routeLabel("/crm/self-delivery/order-123"),"Self-delivery details");
});
test("dedicated rep screen delegates to existing atomic server workflow with readback",()=>{
  const ui=readFileSync("components/prototype/rep-self-delivery-workspace.tsx","utf8");
  const api=readFileSync("lib/rep-delivery-workspace-client.ts","utf8");
  const backend=readFileSync("functions/src/rep-self-delivery.ts","utf8");
  const hub=readFileSync("components/prototype/operations-hub.tsx","utf8");
  assert.match(hub,/<RepSelfDeliveryWorkspace/);
  assert.match(ui,/DeliverySignaturePad strokes=\{strokes\} onChange=\{setStrokes\}/);
  assert.match(ui,/const fresh=await getState\(idToken\)/);
  assert.match(ui,/fresh\.taskStatus!==ack\.taskStatus/);
  assert.match(ui,/momentumStorage\.refreshKeys\(\[COMMERCIAL_KEY\]\)/);
  assert.match(api,/firebaseFunctionUrl\("repSelfDelivery"\)/);
  assert.match(api,/value\.orderId!==orderId\|\|value\.cloudConfirmed!==true/);
  assert.match(backend,/db\.runTransaction\(/);
  assert.match(backend,/access\?\.role/);
  assert.doesNotMatch(ui,/\bsetOrderStatus\(/);
  assert.doesNotMatch(ui,/\bpostMovement\(/);
  assert.doesNotMatch(ui,/\bmarkDelivered\(/);
  assert.doesNotMatch(ui,/\brecordPayment\(/);
});
