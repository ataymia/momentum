import assert from "node:assert/strict";
import test from "node:test";
import { createDemoData } from "../lib/demo-data";
import { normalizeWorkspaceData } from "../lib/workspace-normalization";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

test("workspace hydration drops malformed and orphaned source records", () => {
  const fallback = createDemoData();
  const stored = clone(fallback) as any;
  stored.users.push({ ...stored.users[3], id: "usr-forged", email: "rep@momentum.demo", role: "Root" });
  stored.activities.push({ id: "activity-orphan", accountId: "missing-account", type: "order", title: "Forged", detail: "Forged", at: new Date().toISOString(), userId: "usr-jordan" });
  stored.appointments.push({ ...stored.appointments[0], id: "appointment-orphan", accountId: "missing-account" });
  stored.orders.push({ ...stored.orders[0], id: "order-orphan", number: "GE-X", accountId: "missing-account" });
  stored.placements.push({ ...stored.placements[0], id: "placement-orphan", accountId: "missing-account" });

  const normalized = normalizeWorkspaceData(stored, fallback);
  assert.equal(normalized.users.some((user) => user.id === "usr-forged"), false);
  assert.equal(normalized.activities.some((record) => record.id === "activity-orphan"), false);
  assert.equal(normalized.appointments.some((record) => record.id === "appointment-orphan"), false);
  assert.equal(normalized.orders.some((record) => record.id === "order-orphan"), false);
  assert.equal(normalized.placements.some((record) => record.id === "placement-orphan"), false);
});

test("workspace hydration fails closed when a stored paid order has no settlement evidence", () => {
  const fallback = createDemoData();
  const stored = clone(fallback) as any;
  const order = stored.orders[0];
  order.paymentStatus = "Paid";
  order.status = "Paid";
  delete order.paidAt;
  delete order.firstSettledAt;

  const normalized = normalizeWorkspaceData(stored, fallback);
  const safe = normalized.orders.find((item) => item.id === order.id)!;
  assert.equal(safe.paymentStatus, "Open");
  assert.equal(safe.status, "Delivered");
});

test("workspace hydration refuses forged order economics and invalid source placement links", () => {
  const fallback = createDemoData();
  const stored = clone(fallback) as any;
  stored.orders.push({ ...stored.orders[1], id: "bad-economics", number: "GE-BAD", amount: 1 });
  stored.orders.push({ ...stored.orders[1], id: "bad-placement", number: "GE-BAD-2", sourcePlacementId: "missing-placement" });

  const normalized = normalizeWorkspaceData(stored, fallback);
  assert.equal(normalized.orders.some((order) => order.id === "bad-economics"), false);
  assert.equal(normalized.orders.some((order) => order.id === "bad-placement"), false);
});

test("inventory available quantity is derived from custody-safe lot facts during hydration", () => {
  const fallback = createDemoData();
  const stored = clone(fallback) as any;
  stored.inventory[0].available = 999999;
  stored.inventory[1].available = 999999;

  const normalized = normalizeWorkspaceData(stored, fallback);
  assert.equal(normalized.inventory.find((lot) => lot.id === stored.inventory[0].id)?.available, stored.inventory[0].onHand - stored.inventory[0].reserved);
  assert.equal(normalized.inventory.find((lot) => lot.id === stored.inventory[1].id)?.available, 0);
});

test("workspace hydration strips invalid identity references from customer visibility and notifications", () => {
  const fallback = createDemoData();
  const stored = clone(fallback) as any;
  stored.users.find((user: any) => user.id === "usr-customer").accountIds.push("missing-account");
  stored.notifications[0].audienceUserIds.push("missing-user");
  stored.notifications[0].readBy.push("missing-user");

  const normalized = normalizeWorkspaceData(stored, fallback);
  const customer = normalized.users.find((user) => user.id === "usr-customer")!;
  const notification = normalized.notifications[0];
  assert.equal(customer.accountIds?.includes("missing-account"), false);
  assert.equal(notification.audienceUserIds?.includes("missing-user"), false);
  assert.equal(notification.readBy.includes("missing-user"), false);
});

test("workspace hydration rejects dangling source approvals", () => {
  const fallback = createDemoData();
  const stored = clone(fallback) as any;
  stored.approvals.push({ ...stored.approvals[0], id: "approval-orphan", recordId: "missing-order" });
  const normalized = normalizeWorkspaceData(stored, fallback);
  assert.equal(normalized.approvals.some((approval) => approval.id === "approval-orphan"), false);
});
