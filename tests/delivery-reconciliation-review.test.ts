import assert from "node:assert/strict";
import test from "node:test";
import {deliveryReconciliationIssue} from "../lib/delivery-reconciliation";
import type {Order} from "../lib/types";
import type {DeliveryTask} from "../lib/delivery-engine";

const order=(status:Order["status"]):Pick<Order,"status"|"cases">=>({status,cases:8});
const task=(status:DeliveryTask["status"],signed=true):Pick<DeliveryTask,"status"|"signature">=>({
 status,
 signature:signed?{strokes:[[[0,0],[1,1]]],signedAt:"2026-10-25T18:00:00Z",capturedBy:"driver"}:undefined,
});
test("terminal order with in-transit task never prompts a second signature",()=>{
 assert.match(deliveryReconciliationIssue(order("Delivered"),task("In transit"),8)??"",/task is not completed/);
 assert.match(deliveryReconciliationIssue(order("Paid"),undefined,8)??"",/not completed/);
});
test("delivery with signed proof and full stock is not flagged",()=>{
 assert.equal(deliveryReconciliationIssue(order("Delivered"),task("Delivered"),8),undefined);
 assert.equal(deliveryReconciliationIssue(order("Paid"),undefined,8,true),undefined);
});
test("missing stock, signature or order progress requires reconciliation",()=>{
 assert.match(deliveryReconciliationIssue(order("Delivered"),task("Delivered"),3)??"",/inventory/);
 assert.match(deliveryReconciliationIssue(order("Delivered"),task("Delivered",false),8)??"",/signature/);
 assert.match(deliveryReconciliationIssue(order("Out for delivery"),task("Delivered"),8)??"",/order remains open/);
 assert.match(deliveryReconciliationIssue(order("Out for delivery"),task("In transit"),8)??"",/Inventory was posted/);
});
test("Administrator override still requires recorded stock, but no driver signature",()=>{
 assert.match(deliveryReconciliationIssue(order("Delivered"),undefined,0,true)??"",/override/);
 assert.equal(deliveryReconciliationIssue(order("Delivered"),undefined,8,true),undefined);
});
