import assert from "node:assert/strict";
import test from "node:test";
import { createDemoData } from "../lib/demo-data";
import { createHcmSeed } from "../lib/hcm-engine";
import type { IdentityProvisioningRecord } from "../lib/identity-provisioning";
import { onboardingReadiness, requiredOnboardingDocumentTemplates } from "../lib/onboarding-engine";

test("HCM onboarding document requirements distinguish employees from contractors", () => {
  assert.deepEqual(requiredOnboardingDocumentTemplates("Hourly").map((item) => item.title), ["Employment agreement", "Compensation plan / pay notice", "Form I-9", "Form W-4", "Arizona Form A-4"]);
  assert.deepEqual(requiredOnboardingDocumentTemplates("Contractor").map((item) => item.title), ["Contractor agreement", "Compensation plan / pay notice", "Form W-9"]);
});

test("onboarding cannot be submitted while required identity, profile, pay, documents, training, or lifecycle evidence is missing", () => {
  const data = createDemoData();
  const state = createHcmSeed(data);
  const result = onboardingReadiness(state, { id:"access-usr-jordan", userId:"usr-jordan", state:"Onboarding", source:"Direct hire", provisionedBy:"usr-mia", provisionedAt:"2026-09-10T12:00:00.000Z" }, "usr-jordan");
  assert.equal(result.readyForEmployeeSubmission, false);
  assert.ok(result.blockers.length >= 4);
  assert.match(result.blockers.join(" "), /password/i);
  assert.match(result.blockers.join(" "), /documents/i);
});

test("fully evidenced pending onboarding becomes activation-ready", () => {
  const data = createDemoData();
  const base = createHcmSeed(data);
  const userId = "usr-jordan";
  const now = "2026-09-10T12:00:00.000Z";
  const employee = base.employees.find((item) => item.userId === userId)!;
  const required = requiredOnboardingDocumentTemplates("Hourly");
  const state = {
    ...base,
    employees: base.employees.map((item) => item.userId === userId ? { ...item, status:"Prehire" as const, jobTitle:"Sales Representative", department:"Sales", location:"Phoenix, AZ", managerId:"usr-avery", classification:"Hourly" as const, payGroup:"Weekly", hireDate:"2026-09-15" } : item),
    privateProfiles: base.privateProfiles.map((item) => item.userId === userId ? { ...item, phone:"602-555-0100", address:"Phoenix, AZ", emergencyContact:"Emergency Contact", updatedAt:now } : item),
    compensation: [{ id:"comp-onboarding", userId, basis:"Hourly" as const, rate:20, effectiveDate:"2026-09-15", reason:"New hire", status:"Active" as const, approvedBy:"usr-mia", createdAt:now }],
    documents: [
      ...base.documents.filter((doc) => doc.userId !== userId || !required.some((template) => template.title.toLowerCase() === doc.title.toLowerCase())),
      ...required.map((template, index) => ({ id:`required-${index}`, userId, title:template.title, category:template.category, version:1, status:"Available" as const, uploadedAt:now, uploadedBy:"usr-mia" })),
    ],
    training: base.training.map((item) => item.userId === userId ? { ...item, status:"Complete" as const, completedAt:now } : item),
    lifecycleCases: [{ id:"onboarding-jordan", type:"Onboarding" as const, userId, effectiveDate:"2026-09-15", status:"Open" as const, tasks:[], createdAt:now, createdBy:"usr-mia" }],
  };
  const record: IdentityProvisioningRecord = { id:`access-${userId}`, userId, state:"Pending approval", source:"Direct hire", provisionedBy:"usr-mia", provisionedAt:now, passwordChangedAt:now, onboardingSubmittedAt:now };
  const result = onboardingReadiness(state, record, userId);
  assert.equal(employee.userId, userId);
  assert.equal(result.readyForEmployeeSubmission, true);
  assert.equal(result.readyForActivation, true);
  assert.deepEqual(result.blockers, []);
});
