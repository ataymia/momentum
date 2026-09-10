import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCommercialState, seedCommercialState } from "../lib/commercial-state";
import { createDemoData } from "../lib/demo-data";
import type { Approval, InventoryLot, Order } from "../lib/types";

const today = "2026-09-10";
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function validOverlayOrder() {
  const data = createDemoData();
  const account = data.accounts[0];
  const rep = data.users.find((user) => user.role === "Sales Representative")!;
  const product = data.inventory[0].product;
  const order: Order = {
    id: "overlay-order-1",
    number: "GE-OVERLAY-1",
    accountId: account.id,
    cases: 10,
    pricePerCase: 24,
    amount: 240,
    status: "Awaiting approval",
    placedAt: today,
    ownerId: rep.id,
    creditedRepId: rep.id,
    product,
    inventoryAvailableAtOrder: 100,
    priceBasis: "Tier A · test",
    paymentStatus: "Not invoiced",
  };
  return { data, order };
}

test("commercial hydration rejects IDs that collide with canonical workspace records", () => {
  const { data, order } = validOverlayOrder();
  const collision = { ...order, id: data.orders[0].id, number: "GE-COLLISION" };
  const normalized = normalizeCommercialState({ ...seedCommercialState(data, today), orders: [collision] }, data, today);
  assert.equal(normalized.orders.length, 0);
});

test("commercial hydration rejects forged economics and invalid placement lineage", () => {
  const { data, order } = validOverlayOrder();
  const badEconomics = { ...order, id: "bad-economics", amount: 1 };
  const badPlacement = { ...order, id: "bad-placement", sourcePlacementId: "missing-placement" };
  const normalized = normalizeCommercialState({ ...seedCommercialState(data, today), orders: [badEconomics, badPlacement] }, data, today);
  assert.equal(normalized.orders.length, 0);
});

test("commercial hydration fails closed on paid state without settlement evidence", () => {
  const { data, order } = validOverlayOrder();
  const stored: Order = { ...order, status: "Paid", paymentStatus: "Paid" };
  const normalized = normalizeCommercialState({ ...seedCommercialState(data, today), orders: [stored] }, data, today);
  assert.equal(normalized.orders[0].paymentStatus, "Open");
  assert.equal(normalized.orders[0].status, "Delivered");
});

test("commercial approvals must resolve to a valid overlay order", () => {
  const { data, order } = validOverlayOrder();
  const approval: Approval = {
    id: "overlay-approval",
    type: "Order",
    title: "Review order",
    detail: "Test",
    requestedBy: "Rep",
    requesterId: order.ownerId,
    recordId: "missing-overlay-order",
    team: "Sales",
    submittedAt: "2026-09-10T15:00:00Z",
    dueAt: "2026-09-11T15:00:00Z",
    priority: "High",
    status: "Pending",
  };
  const normalized = normalizeCommercialState({ ...seedCommercialState(data, today), orders: [order], approvals: [approval] }, data, today);
  assert.equal(normalized.orders.length, 1);
  assert.equal(normalized.approvals.length, 0);
});

test("quality-hold inventory imports hydrate with zero sellable availability", () => {
  const data = createDemoData();
  const lot: InventoryLot = {
    id: "overlay-lot-hold",
    lotCode: "OVERLAY-HOLD-1",
    product: "Historical test SKU",
    receivedAt: "2026-09-01",
    bestBy: "2027-01-01",
    onHand: 20,
    reserved: 0,
    available: 999,
    status: "Quality hold",
    location: "Phoenix warehouse",
    holdReason: "Inspection pending",
  };
  const normalized = normalizeCommercialState({ ...seedCommercialState(data, today), inventoryLots: [lot] }, data, today);
  assert.equal(normalized.inventoryLots.length, 1);
  assert.equal(normalized.inventoryLots[0].available, 0);
});

test("unknown account patches cannot enter the commercial overlay", () => {
  const data = createDemoData();
  const seed = seedCommercialState(data, today);
  const stored = clone(seed) as typeof seed & { accountPatches: Record<string, typeof seed.accountPatches[string]> };
  stored.accountPatches["missing-account"] = { ownerId: "usr-jordan", pricingTier: "A" };
  const normalized = normalizeCommercialState(stored, data, today);
  assert.equal(Object.hasOwn(normalized.accountPatches, "missing-account"), false);
});

test("historical product names survive hydration even after the SKU leaves current inventory", () => {
  const { data, order } = validOverlayOrder();
  const historical = { ...order, product: "Discontinued historical SKU" };
  const normalized = normalizeCommercialState({ ...seedCommercialState(data, today), orders: [historical] }, data, today);
  assert.equal(normalized.orders[0].product, "Discontinued historical SKU");
});
