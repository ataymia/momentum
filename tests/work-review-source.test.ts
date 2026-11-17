import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {createInventoryLedgerSeed} from "../lib/inventory-ledger";
import {hasRecordedDeliveryPostingGap,hasRecordedRecipientAndInventoryEvidence} from "../lib/work-review-policy";
import {canVisitRoute,requiresPrototypePage,pageForPath} from "../lib/navigation-route-registry";
import type {DeliveryTask} from "../lib/delivery-engine";
import type {Role,WorkspaceData,WorkspaceUser} from "../lib/types";

const user=(role:Role):WorkspaceUser=>({
 id:role,role,name:"Tester",firstName:"Test",initials:"TE",title:"Test",
 team:role==="Customer"?"Customer":"Operations",email:"test@example.invalid",accent:"#123",
});
const order={id:"order-1",cases:3};
const stamp="2026-11-03T19:02:00.000Z";
const signature:NonNullable<DeliveryTask["signature"]>={
 signedAt:stamp,capturedBy:"driver-1",recipientName:"Receiver",strokes:[[[1,2],[2,3]]],
};
const task:DeliveryTask={
 id:"task-1",orderId:order.id,driverId:"driver-1",status:"Delivered",acceptedAt:stamp,acceptedBy:"driver-1",deliveredAt:stamp,
 signature,history:[{id:"history-1",type:"Delivered",at:stamp,actorId:"driver-1"}],
};
const empty=createInventoryLedgerSeed({inventory:[],users:[],accounts:[],orders:[]} as unknown as WorkspaceData);
const posted={...empty,movements:[{
 id:"delivery-post",type:"Delivery" as const,lotId:"lot-1",relatedOrderId:order.id,
 product:"Golden Eagle",quantity:3,reason:"Received",at:stamp,actorId:"driver-1",
}]};

test("records incomplete customer delivery posting as an exception",()=>{
  assert(hasRecordedDeliveryPostingGap(task,order,empty));
  assert(!hasRecordedDeliveryPostingGap(task,order,posted));
  assert(!hasRecordedDeliveryPostingGap({...task,status:"In transit"},order,empty));
  assert(!hasRecordedDeliveryPostingGap(task,{...order,id:"unrelated"},empty));
});
test("completed-work evidence requires linked recipient signature and full recorded posting",()=>{
  assert(!hasRecordedRecipientAndInventoryEvidence(task,order,empty));
  assert(hasRecordedRecipientAndInventoryEvidence(task,order,posted));
  assert(!hasRecordedRecipientAndInventoryEvidence({...task,signature:{...signature,capturedBy:"other"}},order,posted));
  assert(!hasRecordedRecipientAndInventoryEvidence({...task,signature:{...signature,signedAt:"2026-11-03T20:00:00.000Z"}},order,posted));
  assert(!hasRecordedRecipientAndInventoryEvidence({...task,signature:{...signature,strokes:[]}},order,posted));
});
test("Exceptions and Completed Work are separate employee routes",()=>{
  for(const path of ["/work/exceptions","/work/completed"]){
    assert(requiresPrototypePage(path));
    assert(canVisitRoute(user("Administrator"),path));
    assert(canVisitRoute(user("Sales Representative"),path));
    assert(!canVisitRoute(user("Customer"),path));
    assert.equal(pageForPath(path),"work");
  }
});
test("work review screens do not mutate tasks, stock, approvals or payments",()=>{
  const src=readFileSync("components/prototype/work-review-experience.tsx","utf8");
  assert.match(src,/buildActionNotices\(\{data,scope,currentUser/);
  assert.match(src,/hasRecordedDeliveryPostingGap\(task,order,ledger\)/);
  assert.match(src,/hasRecordedRecipientAndInventoryEvidence\(task,order,ledger\)/);
  assert.doesNotMatch(src,/\bdecideApproval\(/);
  assert.doesNotMatch(src,/\bpostMovement\(/);
  assert.doesNotMatch(src,/\brecordPayment\(/);
});
