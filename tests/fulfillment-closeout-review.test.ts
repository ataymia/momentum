import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {reviewDeliveryCloseout} from "../lib/fulfillment-closeout-review";
import type {DeliveryTask} from "../lib/delivery-engine";
import type {Order} from "../lib/types";

const time="2026-11-07T15:00:00.000Z";
const order=(status:Order["status"]="Delivered")=>({status,cases:4});
const signedTask=():DeliveryTask=>({
  id:"test-delivery",orderId:"test-order",driverId:"test-driver",
  status:"Delivered",acceptedAt:time,acceptedBy:"test-driver",
  signature:{signedAt:time,capturedBy:"test-driver",strokes:[[[10,10],[20,20]]],recipientName:"Test Only"},
  history:[{id:"test-event",type:"Delivered",at:time,actorId:"test-driver"}],
});
const evidence=(changes:Partial<Parameters<typeof reviewDeliveryCloseout>[0]>={})=>({
  order:order(),task:signedTask(),deliveredCases:4,outboundCases:4,administratorOverride:false,...changes,
});
test("only matching terminal order, exact stock and recipient proof can close ordinarily",()=>{
  const result=reviewDeliveryCloseout(evidence());
  assert.equal(result.complete,true);
  assert.equal(result.recipientProofRecorded,true);
  assert.equal(result.issueText,undefined);
});
test("administrator override cannot close an open order even with exact inventory",()=>{
  const r=reviewDeliveryCloseout(evidence({order:order("Out for delivery"),administratorOverride:true}));
  assert.equal(r.complete,false);
  assert(r.issues.some(x=>x.includes("not terminal")));
});
test("overposted quantities are a discrepancy under both signed delivery and override",()=>{
  for(const administratorOverride of [false,true]){
    const r=reviewDeliveryCloseout(evidence({deliveredCases:5,administratorOverride}));
    assert.equal(r.complete,false);
    assert(r.issues.some(x=>x.includes("exceeds the ordered cases")));
  }
});
test("loaded or departing with custody below ordered quantity is an exception",()=>{
  for(const status of ["Loaded","In transit","Delivered"] as const){
    const task={...signedTask(),status};
    const r=reviewDeliveryCloseout(evidence({order:order(status==="Delivered"?"Delivered":"Out for delivery"),task,outboundCases:3}));
    assert.equal(r.complete,false);
    assert(r.issues.some(x=>x.includes("warehouse outbound")));
  }
});
test("signature without recorded matched Delivered event is not recipient proof",()=>{
  const task={...signedTask(),history:[]};
  const r=reviewDeliveryCloseout(evidence({task}));
  assert.equal(r.recipientProofRecorded,false);
  assert.equal(r.complete,false);
  assert(r.issues.some(x=>x.includes("matched recipient signature")));
});
test("terminal order without delivery task, signature or override must be reviewed",()=>{
  const r=reviewDeliveryCloseout(evidence({task:undefined}));
  assert.equal(r.complete,false);
  assert(r.issueText?.includes("task is not completed"));
});
test("explicit administrator override with terminal order and exact ledger can complete without signed driver",()=>{
  const r=reviewDeliveryCloseout(evidence({task:undefined,administratorOverride:true}));
  assert.equal(r.complete,true);
  assert.equal(r.recipientProofRecorded,false);
  assert.equal(r.issueText,undefined);
});
test("override without inventory postings is never a completed delivery",()=>{
  const r=reviewDeliveryCloseout(evidence({task:undefined,administratorOverride:true,deliveredCases:0}));
  assert.equal(r.complete,false);
  assert(r.issues.some(x=>x.includes("missing the recorded delivery inventory")));
});
test("invalid and negative stock quantities never mark a delivery complete",()=>{
  for(const deliveredCases of [Number.NaN,-1,Infinity]){
    const r=reviewDeliveryCloseout(evidence({deliveredCases}));
    assert.equal(r.complete,false);
    assert(r.issueText?.includes("invalid"));
  }
});
test("pending tasks may be pending without fabricated error or success",()=>{
  const task={...signedTask(),status:"Accepted" as const,signature:undefined,history:[]};
  const r=reviewDeliveryCloseout(evidence({order:order("Approved"),task,deliveredCases:0,outboundCases:0}));
  assert.equal(r.complete,false);
  assert.equal(r.issueText,undefined);
});
test("driver and Ops screens use the same audited rule and source-linked posted movements",()=>{
  const driver=readFileSync("components/prototype/driver-route-board.tsx","utf8");
  const operations=readFileSync("components/prototype/fulfillment-experience.tsx","utf8");
  assert.match(driver,/reviewDeliveryCloseout/);
  assert.match(driver,/orderOutboundQuantity\(ledger,order\.id\)/);
  assert.match(operations,/reviewDeliveryCloseout/);
  assert.match(operations,/orderOutboundQuantity\(ledger,order\.id\)/);
  assert.match(operations,/summary\.filter\(x=>x\.complete&&x\.proof\)/);
  assert.doesNotMatch(driver,/postMovement\(/);
});
