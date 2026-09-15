import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { createHcmSeed } from "../lib/hcm-engine";
import { onboardingPackageNeedsRepair, prepareOnboardingPackage } from "../lib/onboarding-engine";
import type { ProvisioningDraft } from "../lib/identity-provisioning";
import { canAssignRepToAccountTerritory, canSalesRepWorkAccount, isTerritoryDeviation } from "../lib/territory-engine";
import type { SalesTerritory, WorkspaceData, WorkspaceUser } from "../lib/types";

const ADMIN_ID = "uid-admin";
const REP_A = "uid-rep-a";
const REP_B = "uid-rep-b";

const user = (id: string, name: string, overrides: Partial<WorkspaceUser> = {}): WorkspaceUser => ({
  id,
  name,
  firstName: name.split(" ")[0] ?? name,
  email: `${id}@momentum.test`,
  initials: name.split(" ").map((part) => part[0]).join("").slice(0, 2),
  title: "Sales Representative",
  role: "Sales Representative",
  team: "Sales",
  managerId: ADMIN_ID,
  accent: "#53657d",
  ...overrides,
});

const admin = user(ADMIN_ID, "Admin User", { role: "Administrator", team: "Leadership", title: "Administrator", managerId: undefined });
const repA = user(REP_A, "Rep Alpha");
const repB = user(REP_B, "Rep Beta");

const emptyWorkspace = (users: WorkspaceUser[]): WorkspaceData => ({
  users,
  accounts: [],
  activities: [],
  appointments: [],
  orders: [],
  placements: [],
  inventory: [],
  approvals: [],
  timeEntries: [],
  timecards: [],
  notifications: [],
  bulletins: [],
  territories: [],
});

describe("post-launch onboarding repair", () => {
  const draft: ProvisioningDraft = {
    id: "prehire-regression",
    source: "Direct hire",
    legalName: "Rep Alpha",
    workEmail: repA.email,
    jobTitle: "Sales Representative",
    role: "Sales Representative",
    team: "Sales",
    managerId: ADMIN_ID,
    workLocation: "Phoenix, AZ",
    classification: "Hourly",
    payBasis: "Hourly",
    payRate: 22,
    payGroup: "Weekly",
    startDate: "2026-09-15",
    courseIds: [],
    status: "Auth linked",
    linkedUserId: REP_A,
    createdBy: ADMIN_ID,
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
  };

  test("detects a missing onboarding case and repairs it without duplicating the employee", () => {
    const data = emptyWorkspace([admin, repA]);
    const prepared = prepareOnboardingPackage(createHcmSeed(data), data, draft, REP_A, ADMIN_ID);
    assert.equal(onboardingPackageNeedsRepair(prepared, draft, REP_A), false, "a complete package must not be marked for repair");

    const broken = {
      ...prepared,
      employees: prepared.employees.map((item) => item.userId === REP_A ? { ...item, jobTitle: "Senior Sales Representative", location: "Phoenix Field Office" } : item),
      lifecycleCases: prepared.lifecycleCases.filter((item) => !(item.userId === REP_A && item.type === "Onboarding")),
      privateProfiles: prepared.privateProfiles.map((item) => item.userId === REP_A ? { ...item, phone: "6025550100", address: "Phoenix, AZ", emergencyContact: "Pat 6025550199" } : item),
    };
    assert.equal(onboardingPackageNeedsRepair(broken, draft, REP_A), true, "the production failure mode must be detected");

    const repaired = prepareOnboardingPackage(broken, data, draft, REP_A, ADMIN_ID);
    assert.equal(onboardingPackageNeedsRepair(repaired, draft, REP_A), false);
    assert.equal(repaired.employees.filter((item) => item.userId === REP_A).length, 1, "repair must not duplicate the employee");
    assert.equal(repaired.lifecycleCases.filter((item) => item.userId === REP_A && item.type === "Onboarding").length, 1, "repair must restore exactly one onboarding case");
    assert.equal(repaired.privateProfiles.find((item) => item.userId === REP_A)?.phone, "6025550100", "repair must preserve employee-entered profile data");
    assert.equal(repaired.employees.find((item) => item.userId === REP_A)?.jobTitle, "Senior Sales Representative", "repair must preserve a valid HR edit instead of replaying an old draft");
    assert.equal(repaired.employees.find((item) => item.userId === REP_A)?.location, "Phoenix Field Office", "repair must preserve a valid HR work-location edit");
  });
});

describe("territory suggestions are advisory", () => {
  const territory: SalesTerritory = {
    id: "territory-phx",
    name: "Phoenix Central",
    ownerId: REP_A,
    postalCodes: ["85016"],
    status: "Active",
    createdAt: "2026-09-15T00:00:00.000Z",
    createdBy: ADMIN_ID,
    updatedAt: "2026-09-15T00:00:00.000Z",
    updatedBy: ADMIN_ID,
  };
  const data = { ...emptyWorkspace([admin, repA, repB]), territories: [territory] };
  const account = { postalCode: "85016" };

  test("a rep outside the suggested lane is flagged, not blocked", () => {
    assert.equal(isTerritoryDeviation(data, account.postalCode, REP_B), true);
    assert.equal(canSalesRepWorkAccount(data, repB, account), true, "territory may not block authorized sales work");
    assert.equal(canAssignRepToAccountTerritory(data, account, REP_B), true, "territory may not block manual assignment");
  });

  test("the suggested rep is not flagged as an exception", () => {
    assert.equal(isTerritoryDeviation(data, account.postalCode, REP_A), false);
    assert.equal(canSalesRepWorkAccount(data, repA, account), true);
  });

  test("an uncovered ZIP is a review exception rather than an access denial", () => {
    const uncovered = { postalCode: "85001" };
    assert.equal(isTerritoryDeviation(data, uncovered.postalCode, REP_B), true);
    assert.equal(canSalesRepWorkAccount(data, repB, uncovered), true);
    assert.equal(canAssignRepToAccountTerritory(data, uncovered, REP_B), true);
  });
});
