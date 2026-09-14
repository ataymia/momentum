/**
 * Provisioning logic tests.
 *
 * These cover the parts of employee provisioning that do not need Firestore: the request contract the
 * Worker enforces, and the onboarding package an Administrator opens once the identity exists.
 *
 *   npm run test:logic
 */

import assert from "node:assert/strict";
import test, { describe } from "node:test";

import {
  PROVISIONABLE_ROLES,
  TEAM_FOR_ROLE,
  isProvisionableRole,
  temporaryPasswordProblem,
  validateProvisionRequest,
} from "../lib/provisioning-contract";
import { createHcmSeed } from "../lib/hcm-engine";
import { onboardingReadiness, prepareOnboardingPackage } from "../lib/onboarding-engine";
import type { IdentityProvisioningRecord, ProvisioningDraft } from "../lib/identity-provisioning";
import { FAIL_CLOSED_PROVISIONER, createIdentityProvisioningSeed, isFailClosedPlaceholder } from "../lib/identity-provisioning";
import type { WorkspaceData, WorkspaceUser } from "../lib/types";

const ADMIN_ID = "uid-admin";
const HIRE_ID = "uid-new-hire";

const user = (id: string, overrides: Partial<WorkspaceUser> = {}): WorkspaceUser => ({
  id,
  name: "New Hire",
  firstName: "New",
  email: "new.hire@momentum.test",
  initials: "NH",
  title: "Sales Representative",
  role: "Sales Representative",
  team: "Sales",
  accent: "#53657d",
  ...overrides,
});

const workspace = (users: WorkspaceUser[]) => ({ users } as unknown as WorkspaceData);

const validRequest = () => ({
  email: "New.Hire@Momentum.test",
  temporaryPassword: "Abcd-efgh-1234",
  profile: { name: "New Hire", firstName: "New", initials: "NH", title: "Sales Representative", role: "Sales Representative", team: "Sales", managerId: "uid-manager", accent: "#53657d" },
});

describe("provisioning request contract", () => {
  test("accepts and normalizes a well-formed request", () => {
    const result = validateProvisionRequest(validRequest());
    assert.equal(result.ok, true);
    assert.ok(result.ok);
    assert.equal(result.value.email, "new.hire@momentum.test", "e-mail is lower-cased");
    assert.equal(result.value.profile.role, "Sales Representative");
  });

  test("refuses to provision an Administrator or a Customer", () => {
    for (const role of ["Administrator", "Customer"]) {
      const result = validateProvisionRequest({ ...validRequest(), profile: { ...validRequest().profile, role, team: "Leadership" } });
      assert.equal(result.ok, false, `${role} must not be provisionable`);
    }
    assert.equal(isProvisionableRole("Administrator"), false);
    assert.equal(isProvisionableRole("Sales Representative"), true);
  });

  test("the role decides the team, so a tampered request cannot relocate a hire", () => {
    const result = validateProvisionRequest({ ...validRequest(), profile: { ...validRequest().profile, team: "Leadership" } });
    assert.equal(result.ok, false);
    for (const role of PROVISIONABLE_ROLES) {
      const ok = validateProvisionRequest({ ...validRequest(), profile: { ...validRequest().profile, role, team: TEAM_FOR_ROLE[role] } });
      assert.equal(ok.ok, true, `${role} on ${TEAM_FOR_ROLE[role]} should be accepted`);
    }
  });

  test("rejects malformed e-mails, short names, and weak temporary passwords", () => {
    assert.equal(validateProvisionRequest({ ...validRequest(), email: "not-an-email" }).ok, false);
    assert.equal(validateProvisionRequest({ ...validRequest(), profile: { ...validRequest().profile, name: "X" } }).ok, false);
    assert.equal(validateProvisionRequest({ ...validRequest(), temporaryPassword: "short" }).ok, false);
    assert.equal(validateProvisionRequest({ ...validRequest(), temporaryPassword: "alllowercase123" }).ok, false);
    assert.equal(validateProvisionRequest(null).ok, false);
    assert.equal(validateProvisionRequest({ email: "a@b.co" }).ok, false);
  });

  test("password policy is stated once and enforced everywhere", () => {
    assert.equal(temporaryPasswordProblem("Abcd-efgh-1234"), null);
    assert.match(temporaryPasswordProblem("Ab1") ?? "", /at least 10/);
    assert.match(temporaryPasswordProblem("abcdefghijkl") ?? "", /upper-case/);
  });
});

describe("onboarding package", () => {
  const draft: ProvisioningDraft = {
    id: "prehire-1",
    source: "Direct hire",
    legalName: "New Hire",
    workEmail: "new.hire@momentum.test",
    jobTitle: "Sales Representative",
    role: "Sales Representative",
    team: "Sales",
    managerId: "uid-manager",
    workLocation: "Phoenix, AZ",
    classification: "Hourly",
    payBasis: "Hourly",
    payRate: 22,
    payGroup: "Weekly",
    startDate: "2026-10-01",
    courseIds: [],
    status: "Auth linked",
    linkedUserId: HIRE_ID,
    createdBy: ADMIN_ID,
    createdAt: "2026-09-14T00:00:00.000Z",
    updatedAt: "2026-09-14T00:00:00.000Z",
  };

  /** A hire provisioned through the Worker exists in the directory but not yet in the HCM seed. */
  const dataWithHire = workspace([user(ADMIN_ID, { role: "Administrator", team: "Leadership", email: "admin@momentum.test" }), user(HIRE_ID)]);

  test("creates the employment record when the hire has none yet", () => {
    const seed = createHcmSeed(workspace([user(ADMIN_ID, { role: "Administrator", team: "Leadership", email: "admin@momentum.test" })]));
    assert.equal(seed.employees.some((item) => item.userId === HIRE_ID), false, "precondition: no employment record");

    const next = prepareOnboardingPackage(seed, dataWithHire, draft, HIRE_ID, ADMIN_ID);
    const employee = next.employees.find((item) => item.userId === HIRE_ID);
    assert.ok(employee, "an employment record must be created, not silently skipped");
    assert.equal(employee.status, "Prehire");
    assert.equal(employee.hireDate, draft.startDate);
    assert.equal(employee.managerId, draft.managerId);
    assert.ok(next.documents.some((item) => item.userId === HIRE_ID), "required documents must be assigned");
    assert.ok(next.lifecycleCases.some((item) => item.userId === HIRE_ID && item.type === "Onboarding"), "an onboarding case must be opened");
    assert.ok(next.compensation.some((item) => item.userId === HIRE_ID), "the agreed pay rate must be recorded");
  });

  test("is idempotent: re-running does not duplicate the case or the employment record", () => {
    const seed = createHcmSeed(dataWithHire);
    const once = prepareOnboardingPackage(seed, dataWithHire, draft, HIRE_ID, ADMIN_ID);
    const twice = prepareOnboardingPackage(once, dataWithHire, draft, HIRE_ID, ADMIN_ID);
    assert.equal(twice.employees.filter((item) => item.userId === HIRE_ID).length, 1);
    assert.equal(twice.lifecycleCases.filter((item) => item.userId === HIRE_ID).length, 1);
    assert.equal(twice.documents.filter((item) => item.userId === HIRE_ID).length, once.documents.filter((item) => item.userId === HIRE_ID).length);
  });

  test("refuses to build a package for a draft that belongs to someone else", () => {
    const seed = createHcmSeed(dataWithHire);
    const mismatched = { ...draft, workEmail: "someone.else@momentum.test" };
    assert.equal(prepareOnboardingPackage(seed, dataWithHire, mismatched, HIRE_ID, ADMIN_ID), seed);
    const unlinked = { ...draft, linkedUserId: "uid-other" };
    assert.equal(prepareOnboardingPackage(seed, dataWithHire, unlinked, HIRE_ID, ADMIN_ID), seed);
  });

  test("a hire cannot be activated before the onboarding package is complete", () => {
    const seed = createHcmSeed(dataWithHire);
    const prepared = prepareOnboardingPackage(seed, dataWithHire, draft, HIRE_ID, ADMIN_ID);
    const record: IdentityProvisioningRecord = {
      id: `access-${HIRE_ID}`, userId: HIRE_ID, state: "Pending approval", source: "Direct hire",
      provisionedBy: ADMIN_ID, provisionedAt: "2026-09-14T00:00:00.000Z",
    };
    const readiness = onboardingReadiness(prepared, record, HIRE_ID);
    assert.equal(readiness.readyForActivation, false);
    assert.ok(readiness.blockers.length > 0, "incomplete onboarding must explain what is missing");
  });
});

describe("fail-closed placeholder records", () => {
  /**
   * A hire whose provisioning half-finished has no real record, so the seed invents a "Suspended" one to
   * stay fail-closed. That placeholder must never be mistaken for a real Administrator decision, or the
   * hire can never be recovered — which is exactly how production got stuck.
   */
  test("the seed marks unproven identities Suspended and flags them as placeholders", () => {
    const data = workspace([user(HIRE_ID)]);
    const seed = createIdentityProvisioningSeed(data);
    const record = seed.records.find((item) => item.userId === HIRE_ID);
    assert.ok(record);
    assert.equal(record.state, "Suspended", "an unproven identity must not be treated as Active");
    assert.equal(record.provisionedBy, FAIL_CLOSED_PROVISIONER);
    assert.equal(isFailClosedPlaceholder(record), true);
  });

  test("a real Administrator decision is never treated as a placeholder", () => {
    const real: IdentityProvisioningRecord = {
      id: `access-${HIRE_ID}`, userId: HIRE_ID, state: "Password change required",
      source: "Direct hire", provisionedBy: ADMIN_ID, provisionedAt: "2026-09-14T00:00:00.000Z",
    };
    assert.equal(isFailClosedPlaceholder(real), false);
    assert.equal(isFailClosedPlaceholder(undefined), false);
  });

  test("placeholders are dropped rather than persisted, so Firestore keeps only real decisions", () => {
    const data = workspace([user(HIRE_ID)]);
    const seed = createIdentityProvisioningSeed(data);
    const persisted = seed.records.filter((item) => !isFailClosedPlaceholder(item));
    assert.deepEqual(persisted, [], "fail-closed placeholders must never reach Firestore");
  });
});
