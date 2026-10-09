import assert from "node:assert/strict";
import test from "node:test";
import inventoryModule from "../functions/src/admin-delivery-inventory";
const {overrideSourceAvailable} = inventoryModule;
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
