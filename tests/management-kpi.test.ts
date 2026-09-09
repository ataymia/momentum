import test from "node:test";
import assert from "node:assert/strict";
import { createFieldTrackingSeed } from "../lib/location-tracking-engine";
import {
  calculateManagementKpi,
  kpiPresetPeriod,
  managementKpiCsv,
  managementKpiDefinition,
  managementKpiRows,
} from "../lib/management-kpi";
import type { WorkspaceData } from "../lib/types";

const data: WorkspaceData = {
  users: [
    { id: "mgr", name: "Manager", firstName: "Manager", email: "mgr@test", initials: "M", title: "Manager", role: "Sales Manager", team: "Sales", accent: "#000" },
    { id: "rep-a", name: "Rep A", firstName: "A", email: "a@test", initials: "A", title: "Rep", role: "Sales Representative", team: "Sales", managerId: "mgr", accent: "#000" },
    { id: "rep-b", name: "Rep B", firstName: "B", email: "b@test", initials: "B", title: "Rep", role: "Sales Representative", team: "Sales", managerId: "mgr", accent: "#000" },
  ],
  accounts: [
    { id: "a1", name: "A1", location: "Phoenix", channel: "Retail", stage: "Reordered", ownerId: "rep-a", contactName: "One", contactRole: "Owner", phone: "", email: "", lastActivity: "", nextAction: "Call", nextActionDate: "2026-09-11", health: "Strong", lifetimeCases: 30, reorderCount: 1, notes: "" },
    { id: "a2", name: "A2", location: "Mesa", channel: "Retail", stage: "Placed", ownerId: "rep-b", contactName: "Two", contactRole: "Owner", phone: "", email: "", lastActivity: "", nextAction: "Call", nextActionDate: "2026-09-11", health: "New", lifetimeCases: 10, reorderCount: 0, notes: "" },
  ],
  activities: [],
  appointments: [
    { id: "d1", accountId: "a1", ownerId: "rep-a", date: "2026-09-05", startTime: "10:00", duration: 30, type: "First visit", status: "Completed", objective: "Pitch", location: "Phoenix", completedAt: "2026-09-05T18:00:00Z", outcome: "Order placed", closeoutNote: "Buyer accepted opening order", nextAction: "Check placement", nextActionDate: "2026-09-08" },
    { id: "d2", accountId: "a1", ownerId: "rep-a", date: "2026-09-06", startTime: "10:00", duration: 30, type: "Sample drop", status: "Completed", objective: "Sample", location: "Phoenix", completedAt: "2026-09-06T18:00:00Z", outcome: "No decision", closeoutNote: "Needs owner approval", nextAction: "Call owner", nextActionDate: "2026-09-09" },
    { id: "d3", accountId: "a2", ownerId: "rep-b", date: "2026-09-07", startTime: "10:00", duration: 30, type: "First visit", status: "Scheduled", objective: "Pitch", location: "Mesa" },
    { id: "d4", accountId: "a2", ownerId: "rep-b", date: "2026-09-08", startTime: "10:00", duration: 30, type: "Sample drop", status: "Completed", objective: "Sample", location: "Mesa", completedAt: "2026-09-08T18:00:00Z", outcome: "Follow-up scheduled", closeoutNote: "", nextAction: "Call", nextActionDate: "2026-09-10" },
  ],
  orders: [
    { id: "o1", number: "1", accountId: "a1", cases: 10, pricePerCase: 24, amount: 240, status: "Paid", placedAt: "2026-08-28", paidAt: "2026-08-30", ownerId: "rep-a", priceBasis: "test", paymentStatus: "Paid" },
    { id: "o2", number: "2", accountId: "a1", cases: 20, pricePerCase: 24, amount: 480, status: "Paid", placedAt: "2026-09-06", paidAt: "2026-09-06", ownerId: "rep-a", priceBasis: "test", paymentStatus: "Paid" },
    { id: "o3", number: "3", accountId: "a2", cases: 10, pricePerCase: 24, amount: 240, status: "Paid", placedAt: "2026-09-08", paidAt: "2026-09-08", ownerId: "rep-b", priceBasis: "test", paymentStatus: "Paid" },
    { id: "o4", number: "4", accountId: "a2", cases: 99, pricePerCase: 24, amount: 2376, status: "Draft", placedAt: "2026-09-08", ownerId: "rep-b", priceBasis: "test", paymentStatus: "Open" },
  ],
  placements: [], inventory: [], approvals: [], timeEntries: [], timecards: [], notifications: [], bulletins: [],
};

const period = { start: "2026-09-01", end: "2026-09-09" };

test("sales KPIs use paid and completed source records with explicit denominators", () => {
  const revenue = calculateManagementKpi("collected_revenue", data, period);
  assert.equal(revenue.value, 720);
  assert.deepEqual(revenue.sourceRecordIds.sort(), ["o2", "o3"]);

  const demos = calculateManagementKpi("completed_demos", data, period);
  assert.equal(demos.value, 3);

  const demoRate = calculateManagementKpi("demo_completion_rate", data, period);
  assert.equal(demoRate.numerator, 3);
  assert.equal(demoRate.denominator, 4);
  assert.equal(demoRate.value, 75);

  const closeRate = calculateManagementKpi("new_business_close_rate", data, period);
  assert.equal(closeRate.numerator, 1);
  assert.equal(closeRate.denominator, 3);
  assert.ok(Math.abs(closeRate.value - 33.3333333333) < 0.001);
});

test("new accounts and reorders are classified from full paid-order history", () => {
  const newAccounts = calculateManagementKpi("new_paid_accounts", data, period);
  assert.equal(newAccounts.value, 1);
  assert.deepEqual(newAccounts.sourceRecordIds, ["o3"]);

  const reorders = calculateManagementKpi("reorder_accounts", data, period);
  assert.equal(reorders.value, 1);
  assert.deepEqual(reorders.sourceRecordIds, ["o2"]);

  const reorderShare = calculateManagementKpi("reorder_account_share", data, period);
  assert.equal(reorderShare.numerator, 1);
  assert.equal(reorderShare.denominator, 2);
  assert.equal(reorderShare.value, 50);
});

test("closeout completeness and geolocation evidence remain independently auditable", () => {
  const closeout = calculateManagementKpi("closeout_completeness_rate", data, period);
  assert.equal(closeout.numerator, 2);
  assert.equal(closeout.denominator, 3);

  const tracking = createFieldTrackingSeed();
  tracking.appointmentEvents.push({ id: "evt-1", sessionId: "s1", userId: "rep-a", appointmentId: "d1", accountId: "a1", event: "Arrival verified", sampleId: "sample-1", latitude: 33.4, longitude: -112, accuracyMeters: 10, at: "2026-09-05T17:55:00Z", withinGeofence: true, radiusMiles: 2 });
  tracking.appointmentEvents.push({ id: "evt-2", sessionId: "s1", userId: "rep-a", appointmentId: "d2", accountId: "a1", event: "Arrival verified", sampleId: "sample-2", latitude: 33.4, longitude: -112, accuracyMeters: 10, at: "2026-09-06T17:55:00Z", withinGeofence: true, radiusMiles: 2 });
  const arrivals = calculateManagementKpi("arrival_verification_rate", data, period, undefined, tracking);
  assert.equal(arrivals.numerator, 2);
  assert.equal(arrivals.denominator, 3);
});

test("manager rows stay scoped to the users supplied", () => {
  const rows = managementKpiRows("completed_demos", data, period, [data.users[1]]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].userId, "rep-a");
  assert.equal(rows[0].result.value, 2);

  const scopedRevenue = calculateManagementKpi("collected_revenue", data, period, ["rep-a"]);
  assert.equal(scopedRevenue.value, 480);
});

test("CSV export carries the metric definition and evidence trail", () => {
  const definition = managementKpiDefinition("new_business_close_rate");
  const rows = managementKpiRows("new_business_close_rate", data, period, [data.users[1], data.users[2]]);
  const csv = managementKpiCsv(definition, period, rows, "2026-09-09T20:00:00.000Z");
  assert.match(csv, /New-business close rate/);
  assert.match(csv, /Formula/);
  assert.match(csv, /Gaming risk/);
  assert.match(csv, /Source record IDs/);
  assert.match(csv, /Rep A/);
});

test("date presets are deterministic from an explicit local date key", () => {
  assert.deepEqual(kpiPresetPeriod("7d", "2026-09-09"), { start: "2026-09-03", end: "2026-09-09" });
  assert.deepEqual(kpiPresetPeriod("30d", "2026-09-09"), { start: "2026-08-11", end: "2026-09-09" });
  assert.deepEqual(kpiPresetPeriod("month", "2026-09-09"), { start: "2026-09-01", end: "2026-09-09" });
});
