import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createDemoData } from "../lib/demo-data";
import {
  activeReservedForOrder,
  createInventoryLedgerSeed,
  movementCanPost,
  nodeLotBalance,
  orderCanAdvanceInventory,
  orderDeliveryQuantity,
  orderOutboundQuantity,
  warehouseAvailable,
  warehouseNodeId,
  type InventoryMovement,
  type InventoryReservation,
} from "../lib/inventory-ledger";
import type { Order } from "../lib/types";

const at = "2026-09-10T15:00:00Z";

test("inventory custody survives receive, reserve, outbound, delivery, return, and reservation release", () => {
  const base = createDemoData();
  const lot = base.inventory.find((item) => item.status === "Available")!;
  const template = base.orders[0];
  const order: Order = { ...template, id:"lifecycle-order", number:"GE-LIFECYCLE", accountId:base.accounts[0].id, product:lot.product, cases:10, pricePerCase:24, amount:240, status:"Approved", paymentStatus:"Not invoiced", paidAt:undefined };
  const secondOrder: Order = { ...order, id:"release-order", number:"GE-RELEASE", cases:5, amount:120 };
  const data = { ...base, orders:[order, secondOrder] };
  const seed = createInventoryLedgerSeed(data);
  const openingReceipt = seed.movements.find((movement) => movement.id === `opening-${lot.id}`);
  assert.ok(openingReceipt);
  assert.equal(openingReceipt?.type, "Receipt");
  assert.equal(openingReceipt?.toNodeId, warehouseNodeId);
  const openingWarehouse = nodeLotBalance(seed, warehouseNodeId, lot.id);
  assert.equal(openingWarehouse, lot.onHand);

  const reservation: InventoryReservation = { id:"reservation-lifecycle", orderId:order.id, lotId:lot.id, quantity:10, status:"Active", createdAt:at, createdBy:"usr-mia" };
  const releaseReservation: InventoryReservation = { id:"reservation-release", orderId:secondOrder.id, lotId:lot.id, quantity:5, status:"Active", createdAt:at, createdBy:"usr-mia" };
  const reserved = { ...seed, reservations:[reservation, releaseReservation] };
  assert.equal(activeReservedForOrder(reserved, order.id), 10);
  assert.equal(warehouseAvailable(reserved, lot.id), openingWarehouse - 15);
  assert.equal(orderCanAdvanceInventory(reserved, order, "Allocated"), true);

  const custodyNode = "node-user-usr-elena";
  const outboundInput = { lotId:lot.id, quantity:10, type:"Transfer" as const, fromNodeId:warehouseNodeId, toNodeId:custodyNode, relatedOrderId:order.id };
  assert.equal(movementCanPost(reserved, outboundInput), true);
  const outboundMovement: InventoryMovement = { id:"movement-outbound", product:lot.product, reason:"Load approved order", at, actorId:"usr-elena", ...outboundInput };
  const outbound = { ...reserved, movements:[outboundMovement, ...reserved.movements] };
  assert.equal(orderOutboundQuantity(outbound, order.id), 10);
  assert.equal(orderCanAdvanceInventory(outbound, { ...order, status:"Allocated" }, "Out for delivery"), true);
  assert.equal(nodeLotBalance(outbound, custodyNode, lot.id), 10);

  const customerNode = `node-account-${order.accountId}`;
  const deliveryInput = { lotId:lot.id, quantity:10, type:"Delivery" as const, fromNodeId:custodyNode, toNodeId:customerNode, relatedOrderId:order.id };
  assert.equal(movementCanPost(outbound, deliveryInput), true);
  const delivery: InventoryMovement = { id:"movement-delivery", product:lot.product, reason:"Retailer delivery", at, actorId:"usr-elena", ...deliveryInput };
  const delivered = { ...outbound, movements:[delivery, ...outbound.movements] };
  assert.equal(orderDeliveryQuantity(delivered, order.id), 10);
  assert.equal(orderCanAdvanceInventory(delivered, { ...order, status:"Out for delivery" }, "Delivered"), true);
  assert.equal(nodeLotBalance(delivered, customerNode, lot.id), 10);

  const returnInput = { lotId:lot.id, quantity:4, type:"Return" as const, fromNodeId:customerNode, toNodeId:warehouseNodeId, relatedOrderId:order.id };
  assert.equal(movementCanPost(delivered, returnInput), true);
  const returned: InventoryMovement = { id:"movement-return", product:lot.product, reason:"Documented retailer return", at, actorId:"usr-elena", ...returnInput };
  const afterReturn = { ...delivered, movements:[returned, ...delivered.movements] };
  assert.equal(nodeLotBalance(afterReturn, customerNode, lot.id), 6);
  assert.equal(nodeLotBalance(afterReturn, warehouseNodeId, lot.id), openingWarehouse - 6);

  const released = { ...afterReturn, reservations:afterReturn.reservations.map((item) => item.id === releaseReservation.id ? { ...item, status:"Released" as const, releasedAt:at } : item) };
  assert.equal(activeReservedForOrder(released, secondOrder.id), 0);
  assert.equal(warehouseAvailable(released, lot.id), nodeLotBalance(released, warehouseNodeId, lot.id) - activeReservedForOrder(released, order.id, lot.id));
});

test("inventory UI boundary keeps reservation release blocked after outbound custody begins", () => {
  const source = readFileSync(new URL("../lib/inventory-ledger-context-v2.tsx", import.meta.url), "utf8");
  assert.match(source, /orderLotWarehouseNetOutbound\(ledger,existing\.orderId,existing\.lotId\)>0\)return false/);
  assert.match(source, /input\.type===\"Return\"&&order/);
  assert.match(source, /input\.fromNodeId!==expectedCustomerNode/);
});
