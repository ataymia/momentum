import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { AuditEvent } from "../lib/audit-engine";
import { createDemoData } from "../lib/demo-data";
import { notificationCopy } from "../lib/notification-engine";
import { orderMilestoneIntents, sundayWeeklyReminderIntent } from "../lib/notification-policy-v2";
import { customerInvoiceEmail, customerStatusEmail, outboundEmailDecision } from "../lib/outbound-notification-policy";
import { createPerformanceSeed } from "../lib/performance-engine";

const data = createDemoData();

const baseEvent: AuditEvent = {
  id: "audit-test-1",
  at: "2026-09-15T19:00:00.000Z",
  actorId: "usr-mia",
  actorRole: "Administrator",
  action: "Updated",
  module: "Workspace",
  collection: "appointments",
  entityType: "Workspace.appointments",
  entityId: "appointment-technical-id-123456",
  label: "appointment-technical-id-123456",
  summary: "appointment-technical-id-123456 updated: startTime",
  sensitivity: "operational",
  relatedAccountId: "acc-101",
  changes: [{ field: "startTime", before: "13:00", after: "14:00" }, { field: "updatedBy", after: "usr-mia" }],
};

test("appointment notifications use business language and human time", () => {
  const copy = notificationCopy(baseEvent, data);
  assert.equal(copy.title, "Director updated appointment for Desert Lantern Market");
  assert.equal(copy.detail, "Appointment time changed from 1:00 PM to 2:00 PM.");
  assert.ok(!copy.title.includes("appointment-technical-id"));
  assert.ok(!copy.detail.includes("startTime"));
});

test("user ids in audit changes resolve to employee names", () => {
  const copy = notificationCopy({
    ...baseEvent,
    collection: "accounts",
    entityType: "Workspace.accounts",
    entityId: "acc-101",
    label: "Desert Lantern Market",
    changes: [{ field: "ownerId", before: "usr-jordan", after: "usr-avery" }],
  }, data);
  assert.match(copy.detail, /Sales Rep Demo/);
  assert.match(copy.detail, /Sales Manager Demo/);
  assert.ok(!copy.detail.includes("usr-jordan"));
  assert.ok(!copy.detail.includes("usr-avery"));
});

test("created and deleted records stay readable when there are no useful field changes", () => {
  const created = notificationCopy({ ...baseEvent, action: "Created", changes: [] }, data);
  const deleted = notificationCopy({ ...baseEvent, action: "Deleted", changes: [] }, data);
  assert.equal(created.detail, "A new appointment was added to Momentum.");
  assert.equal(deleted.detail, "The appointment was removed from Momentum.");
});


test("known employee actors resolve by directory identity even when the changed fields do not repeat the actor id", () => {
  const copy = notificationCopy({
    ...baseEvent,
    changes: [{ field: "startTime", before: "13:00", after: "14:00" }],
  }, data);
  assert.match(copy.title, /^Director updated appointment/);
  assert.doesNotMatch(copy.title, /team member/i);
  assert.doesNotMatch(copy.title, /unknown user/i);
});

test("system generated audit events name Momentum instead of a generic team member", () => {
  const copy = notificationCopy({
    ...baseEvent,
    actorId: "system",
    actorRole: "Administrator",
    changes: [{ field: "status", before: "Draft", after: "Approved" }],
  }, data);
  assert.match(copy.title, /^Momentum updated appointment/);
  assert.doesNotMatch(copy.title, /team member/i);
});


test("notification escalation copy never falls back to an anonymous team member", () => {
  const source = readFileSync("lib/notification-context-v2.tsx", "utf8");
  assert.doesNotMatch(source, /A team member/);
  assert.match(source, /User record unavailable/);
});


test("customer notification policy covers confirmed, out-for-delivery, and delivered milestones", () => {
  const customer = data.users.find((user) => user.role === "Customer")!;
  const baseOrder = {
    id: "order-notification-test",
    number: "GE-NOTIFY-1",
    accountId: "acc-101",
    cases: 10,
    pricePerCase: 24,
    amount: 240,
    status: "Approved" as const,
    placedAt: "2026-10-12",
    ownerId: "usr-jordan",
    creditedRepId: "usr-jordan",
    priceBasis: "Tier A",
    paymentStatus: "Open" as const,
  };
  const confirmed = { ...data, orders: [baseOrder] };
  assert.equal(orderMilestoneIntents(confirmed, customer).some((item) => item.title === "Order confirmed"), true);

  const outbound = { ...data, orders: [{ ...baseOrder, status: "Out for delivery" as const }] };
  assert.equal(orderMilestoneIntents(outbound, customer).some((item) => item.title === "Order out for delivery"), true);

  const delivered = { ...data, orders: [{ ...baseOrder, status: "Delivered" as const }] };
  assert.equal(orderMilestoneIntents(delivered, customer).some((item) => item.title === "Order delivered"), true);
});

test("credited sales rep receives a delivered-order milestone", () => {
  const rep = data.users.find((user) => user.id === "usr-jordan")!;
  const delivered = {
    ...data,
    orders: [{
      id: "order-rep-delivered",
      number: "GE-NOTIFY-2",
      accountId: "acc-101",
      cases: 10,
      pricePerCase: 24,
      amount: 240,
      status: "Delivered" as const,
      placedAt: "2026-10-12",
      ownerId: rep.id,
      creditedRepId: rep.id,
      priceBasis: "Tier A",
      paymentStatus: "Open" as const,
    }],
  };
  assert.equal(orderMilestoneIntents(delivered, rep).some((item) => item.title === "Your order was delivered"), true);
});

test("Sunday weekly summary reminder does not appear before 7 PM Arizona time", () => {
  const rep = data.users.find((user) => user.id === "usr-jordan")!;
  const performance = createPerformanceSeed();
  assert.equal(sundayWeeklyReminderIntent(performance, rep, new Date("2026-10-11T18:59:00-07:00")), null);
  assert.equal(sundayWeeklyReminderIntent(performance, rep, new Date("2026-10-11T19:00:00-07:00"))?.title, "Weekly summary reminder");
});


test("outbound email policy keeps administrator and operations traffic in-app only", () => {
  const admin = data.users.find((user) => user.role === "Administrator")!;
  assert.equal(outboundEmailDecision(admin, "order-confirmed:test").send, false);
  const operations = data.users.find((user) => user.role === "Operations");
  if (operations) assert.equal(outboundEmailDecision(operations, "program-pricing-expiry:test").send, false);
});

test("sales rep email policy allows returned approvals, timecards, expense status, weekly reminder, and pricing expiry", () => {
  const rep = data.users.find((user) => user.id === "usr-jordan")!;
  for (const source of [
    "action:approval-returned:1",
    "action:timecard-returned:1",
    "action:expense-returned:1",
    "expense-approved:1",
    "weekly-sunday-reminder:1",
    "program-pricing-expiry:1",
  ]) assert.equal(outboundEmailDecision(rep, source).send, true);
  assert.equal(outboundEmailDecision(rep, "action:training:1").send, false);
  assert.equal(outboundEmailDecision(rep, "action:document:1").send, false);
});

test("customer status email prefers accounts payable, while invoices require billing email", () => {
  const account = data.accounts.find((item) => item.id === "acc-101")!;
  const order = {
    id: "email-routing-order",
    number: "GE-EMAIL-1",
    accountId: account.id,
    cases: 10,
    pricePerCase: 24,
    amount: 240,
    status: "Approved" as const,
    placedAt: "2026-10-12",
    ownerId: "usr-jordan",
    priceBasis: "Tier A",
    paymentStatus: "Open" as const,
  };
  const customerId = account.customerId ?? "customer-email-test";
  const customer = {
    id: customerId,
    name: "Email Test Customer",
    accountType: "Independent" as const,
    billingEmail: "billing@example.com",
    accountsPayableEmail: "ap@example.com",
    createdAt: "2026-10-12T00:00:00.000Z",
  };
  const routed = {
    ...data,
    customers: [...(data.customers ?? []).filter((item) => item.id !== customerId), customer],
    accounts: data.accounts.map((item) => item.id === account.id ? { ...item, customerId } : item),
    orders: [order],
  };
  assert.equal(customerStatusEmail(routed, order.id), "ap@example.com");
  assert.equal(customerInvoiceEmail(routed, order.id), "billing@example.com");
});
