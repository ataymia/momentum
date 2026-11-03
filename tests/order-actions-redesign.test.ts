import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {canCreateOrder,canReviewApproval} from "../lib/access";
import {canVisitRoute,pageForPath,requiresPrototypePage,routeLabel} from "../lib/navigation-route-registry";
import type {Approval,Role,WorkspaceData,WorkspaceUser} from "../lib/types";

const actor=(role:Role):WorkspaceUser=>({
 id:"uid-"+role,name:"Example",firstName:"Example",initials:"EX",
 title:"Example",email:"example@example.invalid",accent:"#123456",
 role,team:role==="Customer"?"Customer":"Sales",
});
const approval:Approval={id:"approval-1",type:"Order",title:"Review order",
 detail:"Test",requestedBy:"Example",requesterId:"rep-1",
 recordId:"order-1",team:"Sales",submittedAt:"2026-11-03T12:00:00Z",
 dueAt:"2026-11-04T12:00:00Z",priority:"High",status:"Pending"};
const data={users:[],accounts:[],orders:[],approvals:[]} as unknown as WorkspaceData;

test("order create/edit routes retain owning Orders page",()=>{
  for(const route of ["/sales/orders/new","/sales/orders/order-1/edit"]){
    assert.equal(pageForPath(route),"orders",route);
    assert.equal(requiresPrototypePage(route),true);
    assert.equal(canVisitRoute(actor("Sales Representative"),route),true);
  }
  assert.equal(routeLabel("/sales/orders/new"),"Create sales order");
  assert.equal(routeLabel("/sales/orders/order-1/edit"),"Edit sales order");
  assert.equal(pageForPath("/work/approvals"),"work");
  assert.equal(requiresPrototypePage("/work/approvals"),true);
  assert.equal(pageForPath("/work/workflow"),"work");
  assert.equal(requiresPrototypePage("/work/workflow"),false);
});
test("customers retain own order details, but cannot navigate staff order mutations",()=>{
  const customer=actor("Customer");
  assert(canCreateOrder(customer),"The canonical engine still allows customer order submission via authorized customer portal");
  for(const path of ["/sales/orders/new","/sales/orders/order-1/edit","/sales/orders/workflow","/work/approvals"]){
    assert.equal(canVisitRoute(customer,path),false,path);
  }
  assert(canVisitRoute(customer,"/sales/orders/order-1"));
  assert(canVisitRoute(customer,"/portal/orders"));
});
test("order approval authority remains Administrator only",()=>{
  assert(canReviewApproval(data,actor("Administrator"),approval));
  assert.equal(canReviewApproval(data,actor("Sales Manager"),approval),false);
  assert.equal(canReviewApproval(data,actor("Sales Representative"),approval),false);
  assert.equal(canReviewApproval(data,actor("Customer"),approval),false);
});
test("new mutation screens require local demo AND local persistence",()=>{
  const src=readFileSync("components/prototype/order-actions.tsx","utf8");
  assert.match(src,/runtime\.isDemo&&momentumStorage\.mode\(\)==="local"/);
  assert.match(src,/createOrder\(\{accountId:selected\.id,lines\}\)/);
  assert.match(src,/editOrder\(order\.id,\{accountId:order\.accountId,lines\}\)/);
  assert.match(src,/canReviewApproval\(data,currentUser,approval\)/);
  assert.match(src,/momentumStorage\.flushAndConfirm/);
  assert.match(src,/releaseOrderReservationsForEdit\(order\.id\)/);
  assert.doesNotMatch(src,/recordPayment\(/);
});
test("order editor uses approved pricing and authoritative warehouse availability",()=>{
  const src=readFileSync("components/prototype/order-actions.tsx","utf8");
  assert.match(src,/evaluatePartnerPricing\(data,selected\.id\)/);
  assert.match(src,/productInventoryStatus\(ledger,data,row\.product\)/);
  assert.match(src,/hasCompleteDeliveryAddress\(selected\)/);
  assert.match(src,/Number\.isSafeInteger\(line\.casesCount\)/);
});


test("return reasons travel through the canonical approval engine with an inline required input",()=>{
  const ui=readFileSync("components/prototype/order-actions.tsx","utf8");
  const engine=readFileSync("lib/workspace-context.tsx","utf8");
  assert.match(ui,/aria-label=\{"Reason for returning "\+order\.number\}/);
  assert.match(ui,/returnReason\.trim\(\)\.length<3/);
  assert.match(ui,/decideApproval\(approval\.id,decision,reason\)/);
  assert.match(engine,/providedReason!==undefined\?providedReason\.trim\(\)/);
  assert.match(engine,/if \(!returnReason \|\| returnReason\.length < 3\) return/);
  assert.match(engine,/returnReason\}/);
});
