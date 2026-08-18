import assert from "node:assert/strict";
import test from "node:test";
import { createDemoData } from "../lib/demo-data";

const hoursBetween = (clockIn: string, clockOut?: string, breakMinutes = 0) => {
  if (!clockOut) return 0;
  const [sh, sm] = clockIn.split(":").map(Number);
  const [eh, em] = clockOut.split(":").map(Number);
  return Math.max(0, (eh * 60 + em - sh * 60 - sm - breakMinutes) / 60);
};

test("every pending order approval links to an awaiting order", () => {
  const data = createDemoData();
  const orderApprovals = data.approvals.filter(item => item.type === "Order" && item.status === "Pending");
  for (const approval of orderApprovals) {
    const order = data.orders.find(item => item.id === approval.recordId);
    assert.ok(order, `${approval.id} must link to an order`);
    assert.equal(order.status, "Awaiting approval");
  }
});

test("every submitted timecard approval links to a submitted timecard", () => {
  const data = createDemoData();
  const approvals = data.approvals.filter(item => item.type === "Timecard" && item.status === "Pending");
  for (const approval of approvals) {
    const card = data.timecards.find(item => item.id === approval.recordId);
    assert.ok(card, `${approval.id} must link to a timecard`);
    assert.equal(card.status, "Submitted");
    assert.equal(card.attested, true);
  }
});

test("all actionable accounts have a next action and date", () => {
  const data = createDemoData();
  for (const account of data.accounts) {
    assert.ok(account.nextAction.trim().length > 0, `${account.id} needs a next action`);
    assert.match(account.nextActionDate, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test("closed appointment records cannot be incomplete", () => {
  const data = createDemoData();
  for (const appointment of data.appointments.filter(item => item.status === "Completed")) {
    assert.ok(appointment.outcome);
    assert.ok(appointment.closeoutNote?.trim());
    assert.ok(appointment.nextAction?.trim());
    assert.ok(appointment.nextActionDate);
  }
});

test("recorded time never produces negative paid hours", () => {
  const data = createDemoData();
  for (const entry of data.timeEntries) assert.ok(hoursBetween(entry.clockIn, entry.clockOut, entry.breakMinutes) >= 0);
});
