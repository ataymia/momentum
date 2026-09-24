import assert from "node:assert/strict";
import test from "node:test";
import type { AuditEvent } from "../lib/audit-engine";
import { createDemoData } from "../lib/demo-data";
import { notificationCopy } from "../lib/notification-engine";

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
