import assert from "node:assert/strict";
import test from "node:test";
import {
  EXCLUDED_NOTIFICATION_EVENTS,
  NOTIFICATION_POLICY_V1,
  notificationActionCenterEnabled,
  notificationBellEnabled,
  notificationEmailEnabled,
  notificationPolicyById,
} from "../lib/notification-policy-registry";

test("notification policy ids stay unique", () => {
  const ids = NOTIFICATION_POLICY_V1.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("failed payment email policy is throttled to the approved limit", () => {
  const policy = notificationPolicyById("payment.failed.customer");
  assert.ok(policy);
  assert.equal(policy.channels.bell, true);
  assert.equal(policy.channels.email, true);
  assert.deepEqual(policy.emailRateLimit, {
    cooldownMinutes: 30,
    maxEmails: 2,
    rollingWindowHours: 24,
    scope: "customer account + recipient email",
  });
});

test("canonical channel gates match approved examples", () => {
  assert.equal(notificationActionCenterEnabled("order.submitted_for_approval"), true);
  assert.equal(notificationBellEnabled("order.submitted_for_approval"), true);
  assert.equal(notificationEmailEnabled("order.submitted_for_approval"), false);

  assert.equal(notificationActionCenterEnabled("order.confirmed.customer"), false);
  assert.equal(notificationBellEnabled("order.confirmed.customer"), true);
  assert.equal(notificationEmailEnabled("order.confirmed.customer"), true);

  assert.equal(notificationEmailEnabled("weekly.delinquent.manager"), false);
  assert.equal(notificationEmailEnabled("inventory.reorder_threshold"), true);
});

test("rejected notification concepts remain explicitly excluded", () => {
  assert.equal(EXCLUDED_NOTIFICATION_EVENTS["delivery.failed"], "Not part of Momentum's delivery model.");
  assert.equal(EXCLUDED_NOTIFICATION_EVENTS["timekeeping.any"], "Shelved until timekeeping workflow is defined.");
  assert.equal(EXCLUDED_NOTIFICATION_EVENTS["dispatch.former_employee_appointment"], "Appointments leave active workflow on separation; no reassignment alert.");
  assert.equal(EXCLUDED_NOTIFICATION_EVENTS["accounting.event_ready"], "No notification.");
});
