import assert from "node:assert/strict";
import test from "node:test";
import {activateEmploymentAfterOnboarding, onboardingReadiness} from "../lib/onboarding-engine";
import {createHcmSeed} from "../lib/hcm-engine";
import {createDemoData} from "../lib/demo-data";
import type {IdentityProvisioningRecord} from "../lib/identity-provisioning";

test("Missing HR documents show follow-ups, not CRM-access document blockers", () => {
  const data = createDemoData();
  const employee = data.users.find(u => u.role === "Sales Representative");
  assert(employee);
  const hcm = createHcmSeed(data);
  const record = {userId: employee.id, state: "Onboarding", passwordChangedAt: "2026-11-23T15:00:00Z"} as IdentityProvisioningRecord;
  const status = onboardingReadiness(hcm, record, employee.id);
  assert(status.documentReminders.includes("Employment agreement"));
  assert(status.documentReminders.includes("Form I-9") === false); // Classification not yet reviewed.
  assert(!status.activationBlockers.some(blocker => /document|signed original|payroll/i.test(blocker)));
  assert.equal(status.readyForActivation, false); // Role/classification still unverified.
});

test("Outdated signed version continues to need secure HR verification", () => {
  const data = createDemoData();
  const employee = data.users.find(u => u.role === "Sales Representative");
  assert(employee);
  const hcm = createHcmSeed(data);
  const record = {userId: employee.id, state: "Pending approval", passwordChangedAt: "2026-11-23T15:00:00Z"} as IdentityProvisioningRecord;
  const doc = hcm.documents.find(d => d.userId === employee.id && d.title === "Employment agreement");
  assert(doc);
  doc.status = "Available";
  doc.version = 2;
  doc.verification = {method: "External signed original", recordReference: "SECURE-HR-REFERENCE", verifiedAt: "2026-11-23T15:00:00Z", verifiedBy: "admin", documentVersion: 1};
  assert(onboardingReadiness(hcm, record, employee.id).documentReminders.includes("Employment agreement"));
});

test("Secure employee may receive role-scoped CRM access before paperwork, external payroll and training", () => {
  const data = createDemoData();
  const employee = data.users.find(u => u.role === "Sales Representative");
  const manager = data.users.find(u => u.role === "Administrator");
  assert(employee && manager);
  const hcm = createHcmSeed(data);
  const employment = hcm.employees.find(e => e.userId === employee.id);
  assert(employment);
  employment.status = "Prehire";
  employment.location = "Phoenix, Arizona";
  employment.classification = "Hourly";
  employment.managerId = manager.id;
  employment.payGroup = "Not configured";
  hcm.lifecycleCases.push({id: "onboard-test", type: "Onboarding", userId: employee.id, effectiveDate: "2026-11-23", status: "Open", createdAt: "2026-11-23T15:00:00Z", createdBy: manager.id, tasks: [
    {id: "secure", title: "Secure account and change first-login password", status: "Open"},
    {id: "documents", title: "Complete required employment and tax forms", status: "Open"},
    {id: "access", title: "HR review and activate role-based access", status: "Open"},
  ]});
  const record = {userId: employee.id, state: "Onboarding", passwordChangedAt: "2026-11-23T15:00:00Z"} as IdentityProvisioningRecord;
  const readiness = onboardingReadiness(hcm, record, employee.id);
  assert.equal(readiness.readyForActivation, true);
  assert.equal(readiness.readyForEmployeeSubmission, false);
  assert(readiness.documentReminders.includes("Form I-9"));
  assert(readiness.documentReminders.includes("Form W-4"));
  assert(readiness.documentReminders.includes("Arizona Form A-4"));
  const activated = activateEmploymentAfterOnboarding(hcm, employee.id, manager.id);
  assert.equal(activated.employees.find(e => e.userId === employee.id)?.status, "Active");
  const caseAfter = activated.lifecycleCases.find(x => x.id === "onboard-test");
  assert.equal(caseAfter?.status, "Open");
  assert.equal(caseAfter?.tasks.find(x => x.id === "documents")?.status, "Open");
  assert.equal(caseAfter?.tasks.find(x => x.id === "access")?.status, "Complete");
});
