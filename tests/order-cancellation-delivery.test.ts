import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { canCancelOrder } from "../lib/order-cancellation";
import { reconcileOrderWithApproval } from "../lib/order-approval-engine";
import type { Approval, Order, WorkspaceUser } from "../lib/types";

const baseOrder:Order={id:"ord-1",number:"GE-1",accountId:"acc-1",cases:10,pricePerCase:24,amount:240,status:"Cancelled",placedAt:"2026-09-24",ownerId:"rep-1",priceBasis:"Tier A",paymentStatus:"Not invoiced",cancelledAt:"2026-09-24T17:00:00.000Z",cancelledBy:"admin-1",cancellationReason:"Customer requested cancellation"};
const approval:Approval={id:"apr-1",type:"Order",title:"Review",detail:"10 cases",requestedBy:"Rep",requesterId:"rep-1",recordId:"ord-1",team:"Sales",submittedAt:"2026-09-24T16:00:00.000Z",dueAt:"2026-09-25T16:00:00.000Z",priority:"High",status:"Approved",decidedAt:"2026-09-24T16:30:00.000Z",decidedBy:"admin-1"};

test("a stale approved copy cannot resurrect a cancelled order",()=>{assert.equal(reconcileOrderWithApproval(baseOrder,approval).status,"Cancelled")});

test("sales users can cancel only their own pre-fulfillment orders while admins can cancel any",()=>{
  const rep={id:"rep-1",name:"Rep One",firstName:"Rep",email:"rep@test.com",initials:"RO",title:"Sales Rep",role:"Sales Representative",team:"Sales",accent:"#000"} as WorkspaceUser;
  const manager={...rep,id:"mgr-1",role:"Sales Manager",title:"Sales Manager"} as WorkspaceUser;
  const admin={...rep,id:"admin-1",role:"Administrator",title:"Administrator"} as WorkspaceUser;
  const own={...baseOrder,status:"Awaiting approval" as const,cancelledAt:undefined,cancelledBy:undefined,cancellationReason:undefined};
  const other={...own,ownerId:"rep-2"};
  assert.equal(canCancelOrder(rep,own),true);
  assert.equal(canCancelOrder(manager,{...own,ownerId:manager.id}),true);
  assert.equal(canCancelOrder(rep,other),false);
  assert.equal(canCancelOrder(admin,other),true);
  assert.equal(canCancelOrder(rep,{...own,status:"Allocated"}),false);
});

test("delivery driver reads live commercial orders and current inventory lots",()=>{const source=readFileSync("lib/firestore-domains.ts","utf8");assert.match(source,/orders:\{read:\[\.\.\.OPERATIONAL,"Delivery Driver"\],write:\[\.\.\.OPERATIONAL,"Delivery Driver"\]\}/);assert.match(source,/inventoryLots:\{read:\[\.\.\.OPERATIONAL,"Delivery Driver"\]\}/)});

test("order cancellation is evidence-preserving, self-service for the creator, and cloud-confirmed",()=>{
  const workspace=readFileSync("lib/workspace-context.tsx","utf8");
  const page=readFileSync("components/pages/orders-v3.tsx","utf8");
  const inventory=readFileSync("lib/inventory-ledger-context-v2.tsx","utf8");
  const commerce=readFileSync("lib/commerce-context.tsx","utf8");
  const delivery=readFileSync("lib/delivery-context.tsx","utf8");
  assert.match(workspace,/canCancelOrder\(currentUser, order\)/);
  assert.match(workspace,/cancellationReason: cleanReason/);
  assert.match(workspace,/payment activity/);
  assert.match(page,/Cancellation reason/);
  assert.match(page,/Confirm cancellation/);
  assert.match(page,/flushAndConfirm\(COMMERCIAL_KEY\)/);
  assert.match(page,/flushAndConfirm\(INVENTORY_LEDGER_STORAGE_KEY\)/);
  assert.match(inventory,/status:"Released" as const/);
  assert.match(commerce,/if \(!canManageCash\) return/);
  assert.match(commerce,/cancelled before fulfillment/);
  assert.match(commerce,/order.status === "Cancelled" \|\| invoice.status === "Void"/);
  assert.match(delivery,/canReconcileCancelledDelivery/);
  assert.match(delivery,/order.status !== "Cancelled"/);
  assert.match(page,/Inventory is already reserved for this approved order/);
});

test("delivery workflow includes claim, pack, load, route and delivery",()=>{const page=readFileSync("components/pages/deliveries.tsx","utf8");for(const label of ["Claim delivery","Pack / reserve","Mark loaded","Start delivery","Complete delivery & sign"])assert.match(page,new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")))});
