import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { CrmInteraction, CrmState } from "../lib/crm-engine";
import { createDemoData } from "../lib/demo-data";
import {
  applyCompensationCorrection,
  employeePhysicalVisits,
  employeeVisitLabel,
  type AdminVisitRecord,
} from "../lib/employee-admin";
import { createHcmSeed, type CompensationRecord } from "../lib/hcm-engine";

test("Administrator pay correction preserves history and makes the corrected record current", () => {
  const data = createDemoData();
  const employee = data.users.find((user) => user.role === "Sales Representative");
  assert.ok(employee);
  const seed = createHcmSeed(data);
  const prior: CompensationRecord = {
    id: "comp-prior",
    userId: employee.id,
    basis: "Hourly",
    rate: 18,
    effectiveDate: "2026-09-01",
    reason: "Initial entry",
    status: "Active",
    approvedBy: "usr-mia",
    createdAt: "2026-09-01T15:00:00.000Z",
  };
  const result = applyCompensationCorrection(
    { ...seed, compensation: [prior] },
    {
      recordId: "comp-corrected",
      userId: employee.id,
      basis: "Hourly",
      rate: 20,
      effectiveDate: "2026-10-01",
      reason: "Correct initial pay rate",
      approvedBy: "usr-mia",
      createdAt: "2026-10-06T22:00:00.000Z",
    },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const old = result.state.compensation.find((record) => record.id === "comp-prior");
  const corrected = result.state.compensation.find((record) => record.id === "comp-corrected");
  assert.equal(old?.status, "Ended");
  assert.equal(old?.endDate, "2026-09-30");
  assert.equal(corrected?.status, "Active");
  assert.equal(corrected?.rate, 20);
  assert.equal(result.state.compensation.length, 2);
});

test("future compensation remains scheduled and bounds an earlier correction", () => {
  const data = createDemoData();
  const employee = data.users.find((user) => user.role === "Sales Representative");
  assert.ok(employee);
  const seed = createHcmSeed(data);
  const future: CompensationRecord = {
    id: "comp-future",
    userId: employee.id,
    basis: "Hourly",
    rate: 23,
    effectiveDate: "2026-11-01",
    reason: "Approved future increase",
    status: "Future",
    approvedBy: "usr-mia",
    createdAt: "2026-10-01T15:00:00.000Z",
  };
  const result = applyCompensationCorrection(
    { ...seed, compensation: [future] },
    {
      recordId: "comp-current",
      userId: employee.id,
      basis: "Hourly",
      rate: 21,
      effectiveDate: "2026-10-01",
      reason: "Current rate correction",
      approvedBy: "usr-mia",
      createdAt: "2026-10-06T22:00:00.000Z",
    },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const corrected = result.state.compensation.find((record) => record.id === "comp-current");
  const stillFuture = result.state.compensation.find((record) => record.id === "comp-future");
  assert.equal(corrected?.endDate, "2026-10-31");
  assert.equal(corrected?.status, "Active");
  assert.equal(stillFuture?.status, "Future");
});

test("Administrator visit history includes unmatched Quick Visits with the business name intact", () => {
  const data = createDemoData();
  const employee = data.users.find((user) => user.role === "Sales Representative");
  assert.ok(employee);
  const visit: AdminVisitRecord = {
    id: "visit-1",
    locationId: "quick-visit:corner-shop-abc123",
    userId: employee.id,
    type: "Visit",
    occurredAt: "2026-10-06T19:00:00.000Z",
    summary: "Visited business location",
    physicalVisit: true,
    prospectRating: 7,
    quickVisitBusinessName: "Corner Shop",
  };
  const state: CrmState = {
    version: 1,
    contacts: [],
    interactions: [visit as CrmInteraction],
    opportunities: [],
    responsibilityHistory: [],
  };
  const visits = employeePhysicalVisits(state, employee.id);
  assert.equal(visits.length, 1);
  assert.equal(employeeVisitLabel(visits[0], data), "Corner Shop");
});

test("onboarding setup queue excludes identities that are already linked", () => {
  const source = readFileSync("components/hcm/new-hire-provisioning.tsx", "utf8");
  assert.match(source, /draft\.status === "Cancelled"/);
  assert.match(source, /draft\.status !== "Auth linked"/);
  assert.match(source, /records\.some\(\(record\) => record\.userId === draft\.linkedUserId\)/);
});

test("Workforce Live exposes the Administrator employee profile surface", () => {
  const source = readFileSync("components/pages/workforce-live.tsx", "utf8");
  assert.match(source, /AdminEmployeeProfiles/);
  assert.match(source, />Employee profiles<\/button>/);
});
