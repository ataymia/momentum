import assert from "node:assert/strict";
import test from "node:test";
import { createDemoData } from "../lib/demo-data";
import { createHcmSeed } from "../lib/hcm-engine";
import { normalizePersistedHcmState } from "../lib/hcm-persistence";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function storedSeed() {
  const data = createDemoData();
  return { data, seed: createHcmSeed(data) };
}

test("HCM hydration cannot introduce a forged employee identity", () => {
  const { data, seed } = storedSeed();
  const stored = clone(seed);
  stored.employees.push({ ...stored.employees[0], userId: "usr-forged", employeeNumber: "GE-9999" });
  const normalized = normalizePersistedHcmState(stored, data, seed);
  assert.equal(normalized.employees.some((employee) => employee.userId === "usr-forged"), false);
  assert.equal(normalized.employees.length, seed.employees.length);
});

test("HCM hydration drops negative or malformed compensation evidence", () => {
  const { data, seed } = storedSeed();
  const stored = clone(seed);
  stored.compensation.push({
    id: "comp-forged",
    userId: "usr-jordan",
    basis: "Hourly",
    rate: -50,
    effectiveDate: "2026-09-01",
    reason: "Forged negative rate",
    status: "Active",
    approvedBy: "usr-mia",
    createdAt: "2026-09-01T15:00:00Z",
  });
  const normalized = normalizePersistedHcmState(stored, data, seed);
  assert.equal(normalized.compensation.some((record) => record.id === "comp-forged"), false);
});

test("HCM hydration drops benefit enrollments whose plan or tier evidence is invalid", () => {
  const { data, seed } = storedSeed();
  const stored = clone(seed);
  stored.benefitPlans.push({
    id: "plan-bad",
    name: "Bad plan",
    category: "Medical",
    planYear: "2026",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    active: true,
    eligibilityNote: "Test",
    tiers: [{ id: "tier-bad", name: "Employee", employeeContributionPerPayPeriod: -1, employerContributionPerPayPeriod: 0 }],
  });
  stored.benefitEnrollments.push({
    id: "enrollment-bad",
    userId: "usr-jordan",
    planId: "plan-bad",
    tierId: "tier-bad",
    dependentIds: [],
    election: "Enroll",
    status: "Active",
    effectiveDate: "2026-09-01",
    event: "New hire",
    submittedAt: "2026-08-20T12:00:00Z",
    approvedBy: "usr-mia",
    approvedAt: "2026-08-21T12:00:00Z",
  });
  const normalized = normalizePersistedHcmState(stored, data, seed);
  assert.equal(normalized.benefitPlans.some((record) => record.id === "plan-bad"), false);
  assert.equal(normalized.benefitEnrollments.some((record) => record.id === "enrollment-bad"), false);
});

test("HCM hydration refuses PTO usage without an approved source request", () => {
  const { data, seed } = storedSeed();
  const stored = clone(seed);
  stored.ptoPolicies.push({
    id: "pto-test",
    name: "Test PTO",
    active: true,
    method: "Accrual",
    accrualHoursPerPayPeriod: 4,
    frontLoadHours: 0,
    waitingDays: 0,
    minimumRequestHours: 1,
    effectiveDate: "2026-01-01",
  });
  stored.ptoLedger.push({
    id: "pto-used-forged",
    userId: "usr-jordan",
    policyId: "pto-test",
    date: "2026-09-01",
    type: "Used",
    hours: -8,
    note: "No approved request",
    createdBy: "usr-mia",
    createdAt: "2026-09-01T15:00:00Z",
  });
  const normalized = normalizePersistedHcmState(stored, data, seed);
  assert.equal(normalized.ptoPolicies.some((record) => record.id === "pto-test"), true);
  assert.equal(normalized.ptoLedger.some((record) => record.id === "pto-used-forged"), false);
});

test("HCM hydration removes audit entries attributed to nonexistent actors", () => {
  const { data, seed } = storedSeed();
  const stored = clone(seed);
  stored.audit.push({ id: "audit-forged", at: "2026-09-01T15:00:00Z", actorId: "usr-forged", action: "Changed compensation", entityType: "Compensation", entityId: "comp-1", detail: "Forged" });
  const normalized = normalizePersistedHcmState(stored, data, seed);
  assert.equal(normalized.audit.some((record) => record.id === "audit-forged"), false);
});

test("HCM hydration deduplicates employee-keyed records and keeps canonical seed coverage", () => {
  const { data, seed } = storedSeed();
  const stored = clone(seed);
  stored.employees.push({ ...stored.employees[0], employeeNumber: "DUPLICATE" });
  stored.privateProfiles.push({ ...stored.privateProfiles[0], updatedAt: "2026-09-01T15:00:00Z" });
  const normalized = normalizePersistedHcmState(stored, data, seed);
  assert.equal(normalized.employees.filter((record) => record.userId === seed.employees[0].userId).length, 1);
  assert.equal(normalized.privateProfiles.filter((record) => record.userId === seed.privateProfiles[0].userId).length, 1);
});
