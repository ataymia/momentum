import assert from "node:assert/strict";
import test from "node:test";
import { createDemoData } from "../lib/demo-data";
import { createHcmSeed } from "../lib/hcm-engine";
import { createNotificationSeed, deliveryKey } from "../lib/notification-engine";

const data = createDemoData();
const ids = <T extends { id: string }>(records: T[]) => records.map((record) => record.id);
const assertUnique = (label: string, values: string[]) => assert.equal(new Set(values).size, values.length, `${label} IDs must be unique`);

test("core workspace record IDs are unique", () => {
  assertUnique("user", ids(data.users));
  assertUnique("account", ids(data.accounts));
  assertUnique("activity", ids(data.activities));
  assertUnique("appointment", ids(data.appointments));
  assertUnique("order", ids(data.orders));
  assertUnique("placement", ids(data.placements));
  assertUnique("inventory", ids(data.inventory));
  assertUnique("approval", ids(data.approvals));
  assertUnique("time entry", ids(data.timeEntries));
  assertUnique("timecard", ids(data.timecards));
  assertUnique("notification", ids(data.notifications));
});

test("customer, account, ownership and activity references resolve", () => {
  const userIds = new Set(ids(data.users));
  const accountIds = new Set(ids(data.accounts));
  for (const account of data.accounts) {
    assert.ok(userIds.has(account.ownerId), `${account.id} owner must exist`);
    if (account.accountManagerId) assert.ok(userIds.has(account.accountManagerId), `${account.id} account manager must exist`);
    assert.ok(account.nextAction.trim(), `${account.id} must have a next action`);
    assert.match(account.nextActionDate, /^\d{4}-\d{2}-\d{2}$/);
  }
  for (const activity of data.activities) {
    assert.ok(userIds.has(activity.userId), `${activity.id} actor must exist`);
    if (activity.accountId) assert.ok(accountIds.has(activity.accountId), `${activity.id} account must exist`);
  }
  for (const user of data.users.filter((candidate) => candidate.role === "Customer")) {
    for (const accountId of user.accountIds ?? []) assert.ok(accountIds.has(accountId), `${user.id} linked customer account must exist`);
  }
});

test("appointments, orders and placements never point at missing business records", () => {
  const userIds = new Set(ids(data.users));
  const accountIds = new Set(ids(data.accounts));
  for (const appointment of data.appointments) {
    assert.ok(accountIds.has(appointment.accountId), `${appointment.id} account must exist`);
    if (appointment.ownerId) assert.ok(userIds.has(appointment.ownerId), `${appointment.id} owner must exist`);
    if (appointment.status === "Completed") {
      assert.ok(appointment.outcome, `${appointment.id} completed appointment needs outcome`);
      assert.ok(appointment.closeoutNote?.trim(), `${appointment.id} completed appointment needs closeout note`);
      assert.ok(appointment.nextAction?.trim(), `${appointment.id} completed appointment needs next action`);
      assert.ok(appointment.nextActionDate, `${appointment.id} completed appointment needs next-action date`);
    }
  }
  for (const order of data.orders) {
    assert.ok(accountIds.has(order.accountId), `${order.id} account must exist`);
    assert.ok(userIds.has(order.ownerId), `${order.id} owner must exist`);
    assert.ok(order.cases > 0, `${order.id} cases must be positive`);
    assert.ok(order.pricePerCase > 0, `${order.id} price must be positive`);
    assert.ok(Math.abs(order.amount - order.cases * order.pricePerCase) < 0.005, `${order.id} amount must equal cases × price`);
    if (order.paymentStatus === "Paid") assert.ok(order.paidAt, `${order.id} paid order must have settlement date`);
    if (order.status === "Paid") assert.equal(order.paymentStatus, "Paid", `${order.id} Paid fulfillment state requires Paid payment state`);
  }
  for (const placement of data.placements) assert.ok(accountIds.has(placement.accountId), `${placement.id} account must exist`);
});

test("inventory quantities remain physically possible", () => {
  for (const lot of data.inventory) {
    assert.ok(lot.onHand >= 0, `${lot.id} on hand cannot be negative`);
    assert.ok(lot.reserved >= 0, `${lot.id} reserved cannot be negative`);
    assert.ok(lot.available >= 0, `${lot.id} available cannot be negative`);
    assert.ok(lot.reserved <= lot.onHand, `${lot.id} reserved cannot exceed on hand`);
    assert.ok(lot.available <= lot.onHand - lot.reserved, `${lot.id} available cannot exceed unreserved on hand`);
    if (lot.status === "Available") assert.equal(lot.available, lot.onHand - lot.reserved, `${lot.id} available lot should expose all unreserved cases`);
    if (lot.status === "Quality hold") assert.equal(lot.available, 0, `${lot.id} quality hold must block availability`);
  }
});

test("approval records resolve to source records and compatible states", () => {
  for (const approval of data.approvals) {
    assert.ok(approval.requesterId && data.users.some((user) => user.id === approval.requesterId), `${approval.id} requester must exist`);
    assert.ok(approval.recordId, `${approval.id} must link to a source record`);
    if (approval.type === "Timecard") {
      const card = data.timecards.find((item) => item.id === approval.recordId);
      assert.ok(card, `${approval.id} timecard must exist`);
      if (approval.status === "Pending") assert.equal(card.status, "Submitted", `${approval.id} pending review requires Submitted timecard`);
    }
    if (approval.type === "Order" || approval.type === "Low stock sale") {
      const order = data.orders.find((item) => item.id === approval.recordId);
      assert.ok(order, `${approval.id} order must exist`);
      if (approval.status === "Pending") assert.equal(order.status, "Awaiting approval", `${approval.id} pending review requires Awaiting approval order`);
    }
  }
});

test("timecards and time entries resolve to employees and submitted cards are attested", () => {
  const userIds = new Set(ids(data.users));
  for (const entry of data.timeEntries) assert.ok(userIds.has(entry.userId), `${entry.id} employee must exist`);
  for (const card of data.timecards) {
    assert.ok(userIds.has(card.userId), `${card.id} employee must exist`);
    assert.ok(card.weekEnd >= card.weekStart, `${card.id} week range must be ordered`);
    if (card.status === "Submitted") assert.equal(card.attested, true, `${card.id} submitted card must be attested`);
    if (card.status === "Manager approved") assert.ok(card.approverId, `${card.id} approved card must identify approver`);
  }
});

test("HCM seed references valid employees, courses and managers", () => {
  const hcm = createHcmSeed(data);
  const workforceIds = new Set(data.users.filter((user) => user.role !== "Customer").map((user) => user.id));
  assert.deepEqual(new Set(hcm.employees.map((employee) => employee.userId)), workforceIds);
  for (const employee of hcm.employees) {
    if (employee.managerId) assert.ok(workforceIds.has(employee.managerId), `${employee.userId} manager must be workforce user`);
  }
  const courseIds = new Set(hcm.courses.map((course) => course.id));
  for (const assignment of hcm.training) {
    assert.ok(workforceIds.has(assignment.userId), `${assignment.id} training employee must exist`);
    assert.ok(courseIds.has(assignment.courseId), `${assignment.id} course must exist`);
  }
});

test("notification seed creates one preference per identity and delivery keys are stable", () => {
  const notifications = createNotificationSeed(data.users);
  assert.equal(notifications.preferences.length, data.users.length);
  assertUnique("notification preference user", notifications.preferences.map((preference) => preference.userId));
  for (const preference of notifications.preferences) assert.ok(data.users.some((user) => user.id === preference.userId));
  assert.equal(deliveryKey("event-1", "user-1", "SMS"), "event-1:user-1:SMS");
});
