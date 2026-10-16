import assert from "node:assert/strict";
import test from "node:test";
import * as inventoryModule from "../functions/src/admin-delivery-inventory";
const commonJsCompatible = inventoryModule as typeof inventoryModule & {
  default?: typeof inventoryModule;
};
const overrideSourceAvailable = commonJsCompatible.default?.overrideSourceAvailable ??
  commonJsCompatible.overrideSourceAvailable;
const planAutomaticDelivery=commonJsCompatible.default?.planAutomaticDelivery ??
  commonJsCompatible.planAutomaticDelivery;
import {readFileSync} from "node:fs";

const lotId = "lot-1";
const source = "node-warehouse-main";
const entry = {lotId, fromNodeId: source, quantity: 6};
const receipt = {
  id: "receipt", lotId, quantity: 10, type: "Receipt",
  fromNodeId: "node-external", toNodeId: source,
};
const active = (orderId: string, quantity: number) => ({
  lotId, orderId, quantity, status: "Active",
});

test("admin warehouse delivery must not consume stock reserved for another order", () => {
  assert.equal(overrideSourceAvailable(
    [receipt], [active("other-order", 5)], entry, "Warehouse", "ord-1",
  ), false);
});

test("own active reservation remains eligible in the same order", () => {
  assert.equal(overrideSourceAvailable(
    [receipt], [active("ord-1", 6)], entry, "Warehouse", "ord-1",
  ), true);
});

test("partial competing reservation consumes only unreserved capacity", () => {
  assert.equal(overrideSourceAvailable(
    [receipt], [active("ord-2", 3)], entry, "Warehouse", "ord-1",
  ), true);
});

test("earlier override movement reduces remaining warehouse balance", () => {
  const posted = {
    lotId, quantity: 6, fromNodeId: source,
    toNodeId: "node-account-customer-1",
    relatedOrderId: "ord-1", type: "Delivery",
  };
  assert.equal(overrideSourceAvailable(
    [receipt, posted], [], {...entry, quantity: 5},
    "Warehouse", "ord-2",
  ), false);
});

test("employee custody from a different order is not available", () => {
  const employee = "node-user-1";
  const loaded = {
    lotId, quantity: 10, type: "Transfer",
    fromNodeId: source, toNodeId: employee,
    relatedOrderId: "ord-2",
  };
  assert.equal(overrideSourceAvailable(
    [receipt, loaded], [], {...entry, fromNodeId: employee},
    "Employee custody", "ord-1",
  ), false);
});

test("same-order recorded employee custody is available", () => {
  const employee = "node-user-1";
  const loaded = {
    lotId, quantity: 10, type: "Transfer",
    fromNodeId: source, toNodeId: employee,
    relatedOrderId: "ord-1",
  };
  assert.equal(overrideSourceAvailable(
    [receipt, loaded], [], {...entry, fromNodeId: employee},
    "Employee custody", "ord-1",
  ), true);
});

test("server maintains transaction, admin authorization, and separate payment state", () => {
  const implementation = readFileSync(
    "functions/src/admin-delivery-override.ts", "utf8",
  );
  const entrypoint = readFileSync("functions/src/index.ts", "utf8");
  assert.match(entrypoint, /await requireAdministrator\(request\)/);
  assert.match(implementation, /firestore\.runTransaction/);
  assert.match(implementation, /overrideSourceAvailable\(/);
  assert.match(implementation, /tx\.create\(auditRef, override\)/);
  assert.doesNotMatch(implementation, /paymentStatus:\s*"Paid"/);
  assert.match(implementation, /"Fulfilled"/);
  assert.match(implementation, /"adminDeliveryOverrides"/);
});

test("admin override cannot be blocked by unrelated local unsynced work",()=>{
  const ui=readFileSync("components/orders/admin-delivery-override.tsx","utf8");
  assert.doesNotMatch(ui,/flushAndConfirm\(/);
  assert.match(ui,/fetch\(firebaseFunctionUrl\("adminDeliveryOverride"\)/);
  assert.doesNotMatch(ui,/inventoryReconciliationAcknowledged/);
  assert.doesNotMatch(ui,/refreshKeys\(/);
  assert.match(ui,/onSaved\("Delivered\. Inventory updated\."\,/);
});
test("server updates both order registers and preserves payment truth",()=>{
  const server=readFileSync("functions/src/admin-delivery-override.ts","utf8");
  assert.match(server,/if \(commercialOrders\.some/);
  assert.match(server,/if \(workspaceOrders\.some/);
  assert.match(server,/touched\.push\(commercialRef\.path\)/);
  assert.match(server,/touched\.push\(workspaceRef\.path\)/);
  assert.doesNotMatch(server,/paymentStatus: txt\(row\.paymentStatus\)/);
  assert.match(server,/inventoryReconciliationRequired/);
  assert.match(server,/planAutomaticDelivery\(/);
  assert.doesNotMatch(server,/reconcileInventory/);
  assert.match(server,/tx\.create\(auditRef, override\)/);
});
test("client immediately moves server-confirmed delivery to delivered view",()=>{
  const page=readFileSync("components/pages/orders-v3.tsx","utf8");
  assert.match(page,/setServerConfirmedDeliveries/);
  assert.match(page,/setView\("Delivered"\)/);
  assert.match(page,/presentedOrders/);
});

test("auto posting splits entire order across lots without user choices",()=>{
 const nodes=[
  {id:"node-warehouse-main",type:"Warehouse",active:true},
  {id:"node-user-1",type:"Employee custody",active:true},
 ];
 const lots=[
  {id:"original-1",product:"Original",status:"Available"},
  {id:"original-2",product:"Original",status:"Available"},
 ];
 const movements=[
  {id:"receipt1",lotId:"original-1",quantity:4,fromNodeId:"external",toNodeId:"node-warehouse-main",type:"Receipt"},
  {id:"receipt2",lotId:"original-2",quantity:7,fromNodeId:"external",toNodeId:"node-warehouse-main",type:"Receipt"},
 ];
 const planned=planAutomaticDelivery([{product:"Original",cases:10}],lots,nodes,movements,[],"order-1");
 assert.ok(planned);
 assert.equal(planned.reduce((sum,row)=>sum+row.quantity,0),10);
 assert.equal(planned.length,2);
 assert.equal(planned.every(row=>row.fromNodeId==="node-warehouse-main"),true);
});
test("automatic override consumes existing order custody first and protects other reservations",()=>{
 const nodes=[
  {id:"node-warehouse-main",type:"Warehouse",active:true},
  {id:"node-user-1",type:"Employee custody",active:true},
 ];
 const lots=[{id:"lot-1",product:"Original",status:"Available"}];
 const movements=[
  {lotId:"lot-1",quantity:12,fromNodeId:"external",toNodeId:"node-warehouse-main",type:"Receipt"},
  {lotId:"lot-1",quantity:5,fromNodeId:"node-warehouse-main",toNodeId:"node-user-1",type:"Transfer",relatedOrderId:"order-1"},
 ];
 const reservations=[{lotId:"lot-1",quantity:5,orderId:"other-order",status:"Active"}];
 const planned=planAutomaticDelivery([{product:"Original",cases:7}],lots,nodes,movements,reservations,"order-1");
 assert.ok(planned);
 assert.deepEqual(planned.map(row=>[row.fromNodeId,row.quantity]),[
  ["node-user-1",5],["node-warehouse-main",2],
 ]);
 assert.equal(planAutomaticDelivery([{product:"Original",cases:9}],lots,nodes,movements,reservations,"order-1"),null);
});
test("no false inventory delivery with missing stock, held stock, or unmatched SKU",()=>{
 const nodes=[{id:"node-warehouse-main",type:"Warehouse",active:true}];
 const movements=[{lotId:"lot-1",quantity:3,fromNodeId:"external",toNodeId:"node-warehouse-main"}];
 assert.equal(planAutomaticDelivery([{product:"Original",cases:4}],[{id:"lot-1",product:"Original",status:"Available"}],nodes,movements,[],"order-1"),null);
 assert.equal(planAutomaticDelivery([{product:"Original",cases:1}],[{id:"lot-1",product:"Original",status:"Quality hold"}],nodes,movements,[],"order-1"),null);
 assert.equal(planAutomaticDelivery([{product:"SugarFree",cases:1}],[{id:"lot-1",product:"Original",status:"Available"}],nodes,movements,[],"order-1"),null);
});
test("override is two fields and skips inventory reconciliation UI",()=>{
 const ui=readFileSync("components/orders/admin-delivery-override.tsx","utf8");
 assert.match(ui,/Delivered by/);
 assert.match(ui,/label="Note"/);
 assert.doesNotMatch(ui,/choose source|Choose source|Add another lot|type="radio"|Inventory verification/);
 assert.match(ui,/orderId:order.id,performedBy:performedBy.trim\(\),reason:note.trim\(\)/);
 const workspace=readFileSync("lib/workspace-context-v5.tsx","utf8");
 assert.match(workspace,/externalHydrationRef/);
});
