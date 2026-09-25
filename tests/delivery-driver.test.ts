import assert from "node:assert/strict";
import test from "node:test";
import { getWorkspaceScope } from "../lib/access";
import { normalizeCommercialState } from "../lib/commercial-state";
import { createDeliverySeed, deliveryStatusForOrder, normalizeDeliveryState, processedForDelivery } from "../lib/delivery-engine";
import { validateProvisionRequest } from "../lib/provisioning-contract";
import type { Order, WorkspaceData, WorkspaceUser } from "../lib/types";

const driver: WorkspaceUser = {
  id: "driver-1",
  name: "Driver One",
  firstName: "Driver",
  email: "driver@example.test",
  initials: "DO",
  title: "Delivery Driver",
  role: "Delivery Driver",
  team: "Operations",
  managerId: "admin-1",
  username: "driverone",
  accent: "#53657d",
};
const admin: WorkspaceUser = { ...driver, id: "admin-1", name: "Admin", firstName: "Admin", email: "admin@example.test", initials: "AD", title: "Administrator", role: "Administrator", team: "Leadership", username: "adminone", managerId: undefined };
const rep: WorkspaceUser = { ...driver, id: "rep-1", name: "Rep One", firstName: "Rep", email: "rep@example.test", initials: "RO", title: "Sales Representative", role: "Sales Representative", team: "Sales", username: "repone" };

const order = (status: Order["status"], id = `order-${status.replaceAll(" ", "-")}`): Order => ({
  id,
  number: `GE-${id}`,
  accountId: "account-1",
  cases: 3,
  pricePerCase: 24,
  amount: 72,
  status,
  placedAt: "2026-09-22",
  ownerId: rep.id,
  priceBasis: "Tier A",
  paymentStatus: "Not invoiced",
  product: "0.25L (8.4oz) Golden Eagle Energy Drink (24pack)",
  inventoryAvailableAtOrder: 100,
});

const data: WorkspaceData = {
  users: [admin, rep, driver],
  customers: [],
  accounts: [{ id: "account-1", name: "Retailer", location: "Phoenix", channel: "Independent", stage: "Opening order", ownerId: rep.id, contactName: "Buyer", contactRole: "Owner", phone: "6025550100", email: "buyer@example.test", lastActivity: "Order", nextAction: "Deliver", nextActionDate: "2026-09-23", health: "New", lifetimeCases: 0, reorderCount: 0, notes: "" }],
  activities: [],
  appointments: [],
  orders: [order("Awaiting approval"), order("Approved"), order("Allocated"), order("Out for delivery"), order("Delivered")],
  placements: [],
  inventory: [],
  approvals: [],
  timeEntries: [{ id: "time-1", userId: driver.id, date: "2026-09-22", clockIn: "08:00", breakMinutes: 0, source: "Demo desktop" }],
  timecards: [],
  notifications: [],
  bulletins: [],
  territories: [],
};

test("delivery driver provisioning is a real Operations-team role", () => {
  const result = validateProvisionRequest({ email: driver.email, temporaryPassword: "TempPassword1", profile: { name: driver.name, firstName: driver.firstName, initials: driver.initials, title: driver.title, role: driver.role, team: driver.team, managerId: admin.id, accent: driver.accent, username: driver.username } });
  assert.equal(result.ok, true);
});

test("delivery driver scope exposes processed orders and inventory workflow inputs only", () => {
  const scope = getWorkspaceScope(data, driver);
  assert.deepEqual(scope.orders.map((item) => item.status), ["Approved", "Allocated", "Out for delivery", "Delivered"]);
  assert.equal(scope.accounts.length, 1);
  assert.equal(scope.timeEntries.length, 1, "clock entries remain visible even before a timecard exists");
});

test("delivery queue excludes orders still waiting for approval", () => {
  assert.equal(processedForDelivery(order("Awaiting approval")), false);
  assert.equal(processedForDelivery(order("Approved")), true);
  assert.equal(processedForDelivery(order("Allocated")), true);
});

test("delivery normalization keeps valid driver task history", () => {
  const acceptedAt = "2026-09-22T20:00:00.000Z";
  const state = normalizeDeliveryState({ version: 1, tasks: [{ id: "delivery-1", orderId: data.orders[1].id, driverId: driver.id, status: "Accepted", acceptedAt, acceptedBy: driver.id, history: [{ id: "event-1", type: "Accepted", at: acceptedAt, actorId: driver.id }] }] }, data);
  assert.equal(state.tasks.length, 1);
  assert.equal(deliveryStatusForOrder(state, data.orders[1]), "Accepted");
  assert.equal(createDeliverySeed().tasks.length, 0);
});

test("delivery check collections retain check number and collection evidence", () => {
  const acceptedAt = "2026-09-22T20:00:00.000Z";
  const deliveredAt = "2026-09-22T21:00:00.000Z";
  const task = { id: "delivery-check", orderId: data.orders[4].id, driverId: driver.id, status: "Delivered", acceptedAt, acceptedBy: driver.id, loadedAt: "2026-09-22T20:15:00.000Z", departedAt: "2026-09-22T20:30:00.000Z", deliveredAt, collections: [{ id: "collection-1", amount: 72, method: "Check", reference: "CHK-1001", recordedAt: deliveredAt, recordedBy: driver.id }], history: [{ id: "event-1", type: "Accepted", at: acceptedAt, actorId: driver.id }, { id: "event-2", type: "Payment collected", at: deliveredAt, actorId: driver.id, note: "Check · $72.00 · CHK-1001" }] };
  const state = normalizeDeliveryState({ version: 1, tasks: [task] }, data);
  assert.equal(state.tasks.length, 1);
  assert.equal(state.tasks[0].collections?.[0].method, "Check");
  assert.equal(state.tasks[0].collections?.[0].reference, "CHK-1001");
});

test("delivery normalization rejects a check collection with no check number", () => {
  const acceptedAt = "2026-09-22T20:00:00.000Z";
  const deliveredAt = "2026-09-22T21:00:00.000Z";
  const task = { id: "delivery-bad-check", orderId: data.orders[4].id, driverId: driver.id, status: "Delivered", acceptedAt, acceptedBy: driver.id, loadedAt: "2026-09-22T20:15:00.000Z", departedAt: "2026-09-22T20:30:00.000Z", deliveredAt, collections: [{ id: "collection-1", amount: 72, method: "Check", recordedAt: deliveredAt, recordedBy: driver.id }], history: [{ id: "event-1", type: "Accepted", at: acceptedAt, actorId: driver.id }] };
  const state = normalizeDeliveryState({ version: 1, tasks: [task] }, data);
  assert.equal(state.tasks.length, 0);
});

test("commercial normalization does not erase an order just because its account shard has not arrived yet", () => {
  const pendingOrder = order("Awaiting approval", "order-eventual-consistency");
  const dataWithoutAccount: WorkspaceData = { ...data, accounts: [], orders: [] };
  const normalized = normalizeCommercialState({ version: 1, accountPatches: {}, orders: [pendingOrder], appointments: [], approvals: [], activities: [], inventoryLots: [], territories: [] }, dataWithoutAccount, "2026-09-22");
  assert.equal(normalized.orders.length, 1);
  assert.equal(normalized.orders[0].id, pendingOrder.id);
});
