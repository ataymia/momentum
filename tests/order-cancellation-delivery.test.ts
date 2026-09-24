import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { reconcileOrderWithApproval } from "../lib/order-approval-engine";
import type { Approval, Order } from "../lib/types";

const baseOrder:Order={id:"ord-1",number:"GE-1",accountId:"acc-1",cases:10,pricePerCase:24,amount:240,status:"Cancelled",placedAt:"2026-09-24",ownerId:"rep-1",priceBasis:"Tier A",paymentStatus:"Not invoiced",cancelledAt:"2026-09-24T17:00:00.000Z",cancelledBy:"admin-1",cancellationReason:"Customer requested cancellation"};
const approval:Approval={id:"apr-1",type:"Order",title:"Review",detail:"10 cases",requestedBy:"Rep",requesterId:"rep-1",recordId:"ord-1",team:"Sales",submittedAt:"2026-09-24T16:00:00.000Z",dueAt:"2026-09-25T16:00:00.000Z",priority:"High",status:"Approved",decidedAt:"2026-09-24T16:30:00.000Z",decidedBy:"admin-1"};

test("a stale approved copy cannot resurrect a cancelled order",()=>{assert.equal(reconcileOrderWithApproval(baseOrder,approval).status,"Cancelled")});

test("delivery driver reads live commercial orders and current inventory lots",()=>{const source=readFileSync("lib/firestore-domains.ts","utf8");assert.match(source,/orders:\{read:\[\.\.\.OPERATIONAL,"Delivery Driver"\],write:\[\.\.\.OPERATIONAL,"Delivery Driver"\]\}/);assert.match(source,/inventoryLots:\{read:\[\.\.\.OPERATIONAL,"Delivery Driver"\]\}/)});

test("order cancellation is evidence-preserving and blocks fulfillment-stage cancellation",()=>{const source=readFileSync("lib/workspace-context.tsx","utf8");assert.match(source,/cancellationReason: cleanReason/);assert.match(source,/\["Allocated", "Out for delivery", "Delivered", "Paid"\]\.includes\(order\.status\)/)});

test("delivery workflow includes claim, pack, load, route and delivery",()=>{const page=readFileSync("components/pages/deliveries.tsx","utf8");for(const label of ["Claim delivery","Pack / reserve inventory","Mark loaded","Start delivery","Mark delivered"])assert.match(page,new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")))});
