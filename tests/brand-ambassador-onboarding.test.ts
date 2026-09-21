/**
 * Brand Ambassador and Administrator onboarding-rescue regressions.
 *
 * These cover the production failures this branch exists to fix: a Brand Ambassador role that several
 * canonical validators did not recognise, a Sales Representative who could reach Ambassadors they do not
 * supervise, and an employee stranded before Pending approval with no Administrator control that could
 * release them without faking completed paperwork.
 */

import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { canSuperviseBrandAmbassador, canAccessPage, accountIsVisible, getWorkspaceScope } from "../lib/access";
import { createHcmSeed, type HCMState } from "../lib/hcm-engine";
import {
  createIdentityProvisioningSeed,
  isFailClosedPlaceholder,
  normalizeIdentityProvisioningState,
  type IdentityProvisioningRecord,
  type ProvisioningDraft,
} from "../lib/identity-provisioning";
import { DOMAIN_SPECS, roleAllows } from "../lib/firestore-domains";
import { EMPLOYEE_ROLES, buildPersistenceScope } from "../lib/firebase-access";
import {
  administratorOverrideEmploymentActivation,
  onboardingReadiness,
  onboardingRescueQueue,
  prepareOnboardingPackage,
} from "../lib/onboarding-engine";
import { PROVISIONABLE_ROLES, TEAM_FOR_ROLE, isProvisionableRole, validateProvisionRequest } from "../lib/provisioning-contract";
import { coursesForRoleAudience, normalizeTrainingLibraryState } from "../lib/training-library-engine";
import {
  assignmentsVisibleTo,
  brandAmbassadorsVisibleTo,
  normalizeBrandAmbassadorState,
  validateBrandAmbassadorEvent,
  type BrandAmbassadorAssignment,
} from "../lib/brand-ambassador-engine";
import { normalizeWorkspaceData } from "../lib/workspace-normalization";
import { buildProvisionedWorkspaceUser, managerOptionsForProvisioning, validateInternalUserProvisioning } from "../lib/workspace-user-provisioning";
import type { PageKey, WorkspaceData, WorkspaceUser } from "../lib/types";

const ADMIN_ID = "uid-admin";
const REP_A = "uid-rep-a";
const REP_B = "uid-rep-b";
const BA_A = "uid-ba-a";
const BA_B = "uid-ba-b";
const OPS_ID = "uid-ops";
const WAREHOUSE_ID = "uid-warehouse";
const MANAGER_ID = "uid-manager";

const user = (id: string, name: string, overrides: Partial<WorkspaceUser> = {}): WorkspaceUser => ({
  id,
  name,
  firstName: name.split(" ")[0] ?? name,
  email: `${id}@momentum.test`,
  initials: name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
  title: "Sales Representative",
  role: "Sales Representative",
  team: "Sales",
  managerId: ADMIN_ID,
  accent: "#53657d",
  ...overrides,
});

const admin = user(ADMIN_ID, "Admin User", { role: "Administrator", team: "Leadership", title: "Administrator", managerId: undefined });
const manager = user(MANAGER_ID, "Sales Manager", { role: "Sales Manager", title: "Sales Manager", managedTeams: ["Sales"] });
const repA = user(REP_A, "Rep Alpha", { managerId: MANAGER_ID });
const repB = user(REP_B, "Rep Beta", { managerId: MANAGER_ID });
const baA = user(BA_A, "Ambassador Alpha", { role: "Brand Ambassador", title: "Brand Ambassador", managerId: REP_A });
const baB = user(BA_B, "Ambassador Beta", { role: "Brand Ambassador", title: "Brand Ambassador", managerId: REP_B });
const ops = user(OPS_ID, "Ops User", { role: "Operations", team: "Operations", title: "Operations" });
const warehouse = user(WAREHOUSE_ID, "Warehouse User", { role: "Warehouse", team: "Operations", title: "Warehouse" });

const workspace = (users: WorkspaceUser[]): WorkspaceData => ({
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

const data = workspace([admin, manager, repA, repB, baA, baB, ops, warehouse]);

describe("Brand Ambassador role normalization", () => {
  test("every canonical role validator recognises Brand Ambassador", () => {
    assert.ok(EMPLOYEE_ROLES.includes("Brand Ambassador"), "firestore-domains EMPLOYEE_ROLES");
    assert.ok((PROVISIONABLE_ROLES as readonly string[]).includes("Brand Ambassador"), "provisioning contract allow-list");
    assert.equal(TEAM_FOR_ROLE["Brand Ambassador"], "Sales");
    assert.equal(isProvisionableRole("Brand Ambassador"), true);
    assert.equal(isProvisionableRole("Administrator"), false);
  });

  test("workspace normalization keeps a Brand Ambassador instead of discarding the account", () => {
    const normalized = normalizeWorkspaceData(data, workspace([admin]));
    const ambassador = normalized.users.find((item) => item.id === BA_A);
    assert.ok(ambassador, "a Brand Ambassador must survive workspace normalization");
    assert.equal(ambassador.role, "Brand Ambassador");
    assert.equal(ambassador.team, "Sales");
    assert.equal(ambassador.managerId, REP_A);
  });

  test("the server-side provisioning contract accepts Brand Ambassador on the Sales team only", () => {
    const request = (team: string) => validateProvisionRequest({
      email: "new.ba@momentum.test",
      temporaryPassword: "Temporary12x",
      profile: { name: "New Ambassador", role: "Brand Ambassador", team, title: "Brand Ambassador", managerId: REP_A, username: "nambassador" },
    });
    const accepted = request("Sales");
    assert.equal(accepted.ok, true);
    assert.equal(request("Operations").ok, false, "a Brand Ambassador must not be placed on Operations");
    assert.equal(validateProvisionRequest({
      email: "escalate@momentum.test",
      temporaryPassword: "Temporary12x",
      profile: { name: "Escalation", role: "Administrator", team: "Leadership", username: "escalation" },
    }).ok, false, "Administrator must never be provisionable");
  });

  test("Brand Ambassador page access stays tiny and excludes the commercial platform", () => {
    const allowed: PageKey[] = ["home", "brandAmbassadors", "help"];
    for (const page of allowed) assert.equal(canAccessPage(baA, page), true, `${page} must be available`);
    for (const page of ["accounts", "crmTools", "orders", "orderCash", "inventory", "inventoryLedger", "finance", "payroll", "people", "employees", "settings", "work", "marketing", "dispatch", "trainingAdmin"] as PageKey[]) {
      assert.equal(canAccessPage(baA, page), false, `${page} must stay closed to a Brand Ambassador`);
    }
  });

  test("Brand Ambassadors see no accounts and no commercial scope", () => {
    const scope = getWorkspaceScope(data, baA);
    assert.deepEqual(scope.accounts, []);
    assert.deepEqual(scope.orders, []);
    assert.deepEqual(scope.placements, []);
    assert.deepEqual(scope.activities, []);
    assert.equal(accountIsVisible(data, baA, { id: "acct-1", ownerId: REP_A } as never), false);
  });

  test("Firestore domain rules deny a Brand Ambassador the CRM, order, and finance domains", () => {
    const scope = buildPersistenceScope({ uid: BA_A, email: baA.email, role: "Brand Ambassador", team: "Sales", managerId: REP_A, accountState: "Active", updatedAt: "2026-01-01T00:00:00.000Z", updatedBy: ADMIN_ID }, data.users);
    const denied = ["workspace", "commercial", "crm", "commerce", "inventoryLedger", "marketing", "finance", "accounting", "payroll", "identity", "performance", "fieldTracking"];
    for (const id of denied) {
      const spec = DOMAIN_SPECS.find((item) => item.id === id)!;
      assert.equal(roleAllows(spec.read, scope), false, `${id} must not be readable by a Brand Ambassador`);
    }
    const training = DOMAIN_SPECS.find((item) => item.id === "trainingLibrary")!;
    assert.equal(roleAllows(training.read, scope), true, "a Brand Ambassador must still read their training library");
    assert.equal(roleAllows(training.write, scope), false, "a Brand Ambassador must never write the training library");
  });
});

describe("Brand Ambassador provisioning requires a Sales Representative manager", () => {
  test("a Brand Ambassador may only report to a Sales Representative", () => {
    const base = { name: "New Ambassador", email: "new.ba@momentum.test", title: "Brand Ambassador", role: "Brand Ambassador" as const, team: "Sales" as const };
    assert.equal(validateInternalUserProvisioning(data, { ...base, managerId: REP_A }), null);
    for (const badManager of [ADMIN_ID, MANAGER_ID, OPS_ID, BA_B]) {
      assert.ok(validateInternalUserProvisioning(data, { ...base, managerId: badManager }), `${badManager} must not be able to supervise a Brand Ambassador`);
    }
    assert.ok(validateInternalUserProvisioning(data, { ...base, managerId: "uid-nobody" }), "an unresolved manager must be refused");
  });

  test("manager options for Brand Ambassador offer Sales Representatives only", () => {
    const options = managerOptionsForProvisioning(data, "Brand Ambassador").map((item) => item.id).sort();
    assert.deepEqual(options, [REP_A, REP_B].sort());
  });

  test("a provisioned Brand Ambassador lands on the Sales team with no managed teams", () => {
    const built = buildProvisionedWorkspaceUser(data, { name: "New Ambassador", email: "new.ba@momentum.test", title: "Brand Ambassador", role: "Brand Ambassador", team: "Sales", managerId: REP_A }, "uid-new-ba");
    assert.equal(built.role, "Brand Ambassador");
    assert.equal(built.team, "Sales");
    assert.equal(built.managerId, REP_A);
    assert.equal(built.managedTeams, undefined, "a Brand Ambassador must never carry managed teams");
  });

  test("the existing Sales Representative, Sales Manager, Operations, and Warehouse hierarchies still validate", () => {
    assert.equal(validateInternalUserProvisioning(data, { name: "New Rep", email: "new.rep@momentum.test", title: "Sales Representative", role: "Sales Representative", team: "Sales", managerId: MANAGER_ID }), null);
    assert.equal(validateInternalUserProvisioning(data, { name: "New Rep", email: "new.rep2@momentum.test", title: "Sales Representative", role: "Sales Representative", team: "Sales", managerId: ADMIN_ID }), null);
    assert.equal(validateInternalUserProvisioning(data, { name: "New Manager", email: "new.manager@momentum.test", title: "Sales Manager", role: "Sales Manager", team: "Sales", managerId: ADMIN_ID }), null);
    assert.equal(validateInternalUserProvisioning(data, { name: "New Ops", email: "new.ops@momentum.test", title: "Operations", role: "Operations", team: "Operations", managerId: ADMIN_ID }), null);
    assert.equal(validateInternalUserProvisioning(data, { name: "New Warehouse", email: "new.wh@momentum.test", title: "Warehouse", role: "Warehouse", team: "Operations", managerId: ADMIN_ID }), null);
    assert.ok(validateInternalUserProvisioning(data, { name: "Bad Rep", email: "bad.rep@momentum.test", title: "Sales Representative", role: "Sales Representative", team: "Sales", managerId: REP_B }), "a rep must not report to another rep");
  });

  test("a Brand Ambassador draft whose manager is no longer a Sales Representative is dropped on normalization", () => {
    const draft: ProvisioningDraft = {
      id: "prehire-ba", source: "Direct hire", legalName: "New Ambassador", workEmail: "new.ba@momentum.test", username: "fixtureuser",
      jobTitle: "Brand Ambassador", role: "Brand Ambassador", team: "Sales", managerId: ADMIN_ID, workLocation: "Phoenix, AZ",
      classification: "Hourly", payBasis: "Hourly", payRate: 18, payGroup: "Weekly", startDate: "2026-09-15",
      courseIds: ["course-1"], status: "Ready to invite", createdBy: ADMIN_ID, createdAt: "2026-09-15T00:00:00.000Z", updatedAt: "2026-09-15T00:00:00.000Z",
    };
    const rejected = normalizeIdentityProvisioningState({ version: 1, records: [], drafts: [draft] }, data);
    assert.deepEqual(rejected.drafts, [], "an Administrator-managed Brand Ambassador draft must not survive");
    const accepted = normalizeIdentityProvisioningState({ version: 1, records: [], drafts: [{ ...draft, managerId: REP_A }] }, data);
    assert.equal(accepted.drafts.length, 1);
    assert.equal(accepted.drafts[0].managerId, REP_A);
  });
});

describe("Brand Ambassador event supervision boundaries", () => {
  const draft = { title: "Golden Eagle sampling", date: "2026-10-01", startTime: "10:00", endTime: "14:00", address: "1 Main Street, Phoenix AZ", requiredStaff: 2, notes: "Arrive 15 minutes early" };

  test("a Sales Representative may only schedule their own Brand Ambassadors", () => {
    assert.equal(canSuperviseBrandAmbassador(data, repA, BA_A), true);
    assert.equal(canSuperviseBrandAmbassador(data, repA, BA_B), false);
    assert.equal(canSuperviseBrandAmbassador(data, admin, BA_B), true);
    assert.equal(validateBrandAmbassadorEvent(data, repA, { ...draft, ambassadorIds: [BA_A] }), null);
    assert.ok(validateBrandAmbassadorEvent(data, repA, { ...draft, ambassadorIds: [BA_B] }), "Rep A must not schedule Rep B's Ambassador");
    assert.ok(validateBrandAmbassadorEvent(data, repA, { ...draft, ambassadorIds: [BA_A, BA_B] }), "a mixed roster must be refused wholesale");
    assert.equal(validateBrandAmbassadorEvent(data, admin, { ...draft, ambassadorIds: [BA_A, BA_B] }), null);
  });

  test("supervising a Brand Ambassador is not general management", () => {
    assert.equal(canSuperviseBrandAmbassador(data, repA, REP_B), false, "supervision must be limited to Brand Ambassadors");
    assert.equal(canSuperviseBrandAmbassador(data, manager, BA_A), false, "a Sales Manager is not the Ambassador's assigned rep");
    assert.equal(canSuperviseBrandAmbassador(data, baA, BA_B), false);
    assert.equal(canSuperviseBrandAmbassador(data, ops, BA_A), false);
  });

  test("nobody outside Administrator or the assigned rep may schedule at all", () => {
    for (const actor of [manager, ops, warehouse, baA, null]) {
      assert.ok(validateBrandAmbassadorEvent(data, actor, { ...draft, ambassadorIds: [BA_A] }), "only Administrators and the assigned rep may schedule");
    }
  });

  test("visibility is scoped by reporting line, and an Ambassador sees only their own assignments", () => {
    const at = "2026-09-15T00:00:00.000Z";
    const assignment = (id: string, ambassadorId: string): BrandAmbassadorAssignment => ({
      id, eventGroupId: `group-${id}`, ambassadorId, title: draft.title, date: draft.date, startTime: draft.startTime,
      endTime: draft.endTime, address: draft.address, requiredStaff: 1, status: "Scheduled", createdBy: ADMIN_ID, createdAt: at, updatedAt: at,
    });
    const state = normalizeBrandAmbassadorState({ version: 1, assignments: [assignment("a", BA_A), assignment("b", BA_B)] }, data);
    assert.equal(state.assignments.length, 2);
    assert.deepEqual(assignmentsVisibleTo(data, repA, state).map((item) => item.ambassadorId), [BA_A]);
    assert.deepEqual(assignmentsVisibleTo(data, baA, state).map((item) => item.ambassadorId), [BA_A]);
    assert.deepEqual(assignmentsVisibleTo(data, baB, state).map((item) => item.ambassadorId), [BA_B]);
    assert.equal(assignmentsVisibleTo(data, admin, state).length, 2);
    assert.deepEqual(assignmentsVisibleTo(data, manager, state), [], "a Sales Manager has no Brand Ambassador scope");
    assert.deepEqual(brandAmbassadorsVisibleTo(data, repA).map((item) => item.id), [BA_A]);
    assert.deepEqual(brandAmbassadorsVisibleTo(data, baA).map((item) => item.id), [BA_A]);
    assert.equal(brandAmbassadorsVisibleTo(data, admin).length, 2);
  });

  test("an assignment pointed at somebody who is not a Brand Ambassador is discarded", () => {
    const at = "2026-09-15T00:00:00.000Z";
    const state = normalizeBrandAmbassadorState({
      version: 1,
      assignments: [{ id: "x", eventGroupId: "g", ambassadorId: REP_B, title: draft.title, date: draft.date, startTime: "10:00", endTime: "14:00", address: draft.address, requiredStaff: 1, status: "Scheduled", createdBy: ADMIN_ID, createdAt: at, updatedAt: at }],
    }, data);
    assert.deepEqual(state.assignments, []);
  });
});

describe("role-targeted training audiences", () => {
  const courses = [
    { id: "course-shared", active: true, requiredForTeams: ["Sales"] },
    { id: "course-ba", active: true, requiredForTeams: ["Sales"] },
    { id: "course-retired", active: false, requiredForTeams: ["Sales"] },
  ];

  test("an explicit role audience separates Brand Ambassador training from Sales Representative training", () => {
    const audiences = [{ courseId: "course-ba", roles: ["Brand Ambassador" as const] }];
    assert.deepEqual(coursesForRoleAudience(courses, audiences, "Brand Ambassador", "Sales").map((item) => item.id), ["course-shared", "course-ba"]);
    assert.deepEqual(coursesForRoleAudience(courses, audiences, "Sales Representative", "Sales").map((item) => item.id), ["course-shared"]);
  });

  test("courses without a configured audience keep their original team behaviour", () => {
    assert.deepEqual(coursesForRoleAudience(courses, [], "Sales Representative", "Sales").map((item) => item.id), ["course-shared", "course-ba"]);
    assert.deepEqual(coursesForRoleAudience(courses, [], "Operations", "Operations").map((item) => item.id), []);
  });

  test("a training material must resolve to an external link or a controlled storage path", () => {
    const at = "2026-09-15T00:00:00.000Z";
    const base = { courseId: "course-ba", title: "Field guide", kind: "Document" as const, active: true, createdAt: at, updatedAt: at };
    const normalized = normalizeTrainingLibraryState({
      version: 1,
      audiences: [],
      materials: [
        { ...base, id: "link", url: "https://example.com/guide.pdf" },
        { ...base, id: "stored", storagePath: "training/course-ba/1234-guide.pdf" },
        { ...base, id: "traversal", storagePath: "training/../secrets/pay.csv" },
        { ...base, id: "empty" },
      ],
    }, new Set(["course-ba"]));
    assert.deepEqual(normalized.materials.map((item) => item.id).sort(), ["link", "stored"]);
    assert.equal(normalized.materials.find((item) => item.id === "stored")?.url, undefined);
  });
});

describe("Administrator onboarding rescue", () => {
  const draft: ProvisioningDraft = {
    id: "prehire-ba", source: "Direct hire", legalName: "Ambassador Alpha", workEmail: baA.email, username: "fixtureuser",
    jobTitle: "Brand Ambassador", role: "Brand Ambassador", team: "Sales", managerId: REP_A, workLocation: "Phoenix, AZ",
    classification: "Hourly", payBasis: "Hourly", payRate: 18, payGroup: "Weekly", startDate: "2026-09-15",
    courseIds: [], status: "Auth linked", linkedUserId: BA_A, createdBy: ADMIN_ID, createdAt: "2026-09-15T00:00:00.000Z", updatedAt: "2026-09-15T00:00:00.000Z",
  };
  const record = (state: IdentityProvisioningRecord["state"], extra: Partial<IdentityProvisioningRecord> = {}): IdentityProvisioningRecord => ({
    id: `access-${BA_A}`, userId: BA_A, state, source: "Direct hire", provisionedBy: ADMIN_ID, provisionedAt: "2026-09-15T00:00:00.000Z", draftId: draft.id, ...extra,
  });

  test("the queue surfaces every non-active employee, not just Pending approval", () => {
    const seed = createIdentityProvisioningSeed(data);
    const identity = { ...seed, drafts: [draft], records: seed.records.map((item) => item.userId === REP_B ? { ...item, state: "Pending approval" as const, provisionedBy: ADMIN_ID } : item) };
    const queue = onboardingRescueQueue(createHcmSeed(data), data, identity);
    const queued = new Set(queue.map((entry) => entry.user.id));
    for (const id of [REP_A, REP_B, BA_A, BA_B, OPS_ID, WAREHOUSE_ID, MANAGER_ID]) {
      assert.ok(queued.has(id), `${id} must appear in the rescue queue while not Active`);
    }
    assert.ok(!queued.has(ADMIN_ID), "the bootstrap Administrator is not an onboarding rescue case");
    assert.ok(queue.every((entry) => entry.actions.includes("overrideAndActivate")), "every stuck employee must be rescuable");
  });

  test("a fail-closed placeholder is reported as a missing trusted record with a repair action", () => {
    const seed = createIdentityProvisioningSeed(data);
    assert.ok(seed.records.filter(isFailClosedPlaceholder).length > 0, "the seed must fail closed for unprovisioned identities");
    const entry = onboardingRescueQueue(createHcmSeed(data), data, { ...seed, drafts: [draft] }).find((item) => item.user.id === BA_A)!;
    assert.equal(entry.missingTrustedRecord, true);
    assert.equal(entry.state, "Not provisioned");
    assert.ok(entry.actions.includes("repairIdentityRecord"));
    assert.match(entry.diagnosis, /No trusted Momentum provisioning record/);
  });

  test("an employee stuck on the password change is listed with a password attestation control", () => {
    const seed = createIdentityProvisioningSeed(data);
    const hcm = prepareOnboardingPackage(createHcmSeed(data), data, draft, BA_A, ADMIN_ID);
    const identity = { ...seed, drafts: [draft], records: [record("Password change required"), ...seed.records.filter((item) => item.userId !== BA_A)] };
    const entry = onboardingRescueQueue(hcm, data, identity).find((item) => item.user.id === BA_A)!;
    assert.equal(entry.state, "Password change required");
    assert.equal(entry.missingTrustedRecord, false);
    assert.equal(entry.passwordEvidenceMissing, true);
    assert.ok(entry.actions.includes("attestPasswordChange"));
    assert.ok(entry.actions.includes("moveToOnboarding"));
    assert.ok(!entry.actions.includes("activate"), "activation must stay unavailable while readiness fails");
  });

  test("an Active employee is never listed as stuck", () => {
    const seed = createIdentityProvisioningSeed(data);
    const identity = { ...seed, drafts: [draft], records: [record("Active", { activatedAt: "2026-09-16T00:00:00.000Z", activatedBy: ADMIN_ID }), ...seed.records.filter((item) => item.userId !== BA_A)] };
    assert.ok(!onboardingRescueQueue(createHcmSeed(data), data, identity).some((entry) => entry.user.id === BA_A));
  });
});

describe("an onboarding override stays truthful", () => {
  const draft: ProvisioningDraft = {
    id: "prehire-override", source: "Direct hire", legalName: "Rep Alpha", workEmail: repA.email, username: "fixtureuser",
    jobTitle: "Sales Representative", role: "Sales Representative", team: "Sales", managerId: MANAGER_ID, workLocation: "Phoenix, AZ",
    classification: "Hourly", payBasis: "Hourly", payRate: 22, payGroup: "Weekly", startDate: "2026-09-15",
    courseIds: [], status: "Auth linked", linkedUserId: REP_A, createdBy: ADMIN_ID, createdAt: "2026-09-15T00:00:00.000Z", updatedAt: "2026-09-15T00:00:00.000Z",
  };
  const prepared = (): HCMState => {
    const base = prepareOnboardingPackage(createHcmSeed(data), data, draft, REP_A, ADMIN_ID);
    return { ...base, training: [{ id: "training-1", userId: REP_A, courseId: base.courses[0]?.id ?? "course-1", assignedAt: draft.startDate, status: "Assigned" }, ...base.training] };
  };

  test("employment activates and the override is named in the audit trail", () => {
    const before = prepared();
    const after = administratorOverrideEmploymentActivation(before, data, REP_A, ADMIN_ID, "Founder approved access ahead of paperwork");
    assert.equal(after.employees.find((item) => item.userId === REP_A)?.status, "Active");
    const event = after.audit.find((item) => item.action.includes("Administrator bypassed remaining onboarding"));
    assert.ok(event, "the override must produce an explicit HCM audit event");
    assert.equal(event.actorId, ADMIN_ID);
    assert.equal(event.reason, "Founder approved access ahead of paperwork");
    assert.equal(event.after, "Active");
  });

  test("unfinished documents, training, and profile data are never marked complete", () => {
    const before = prepared();
    const after = administratorOverrideEmploymentActivation(before, data, REP_A, ADMIN_ID, "Operations override for live event coverage");
    const documents = after.documents.filter((item) => item.userId === REP_A);
    assert.ok(documents.length > 0, "the override must not delete the required document package");
    assert.ok(documents.every((item) => item.status === "Missing"), "an override must never fabricate verified paperwork");
    assert.ok(after.training.filter((item) => item.userId === REP_A).every((item) => item.status !== "Complete"), "an override must never fabricate completed training");
    const profile = after.privateProfiles.find((item) => item.userId === REP_A);
    assert.equal(profile?.phone, undefined, "an override must never invent employee contact data");
    const readiness = onboardingReadiness(after, undefined, REP_A);
    assert.equal(readiness.readyForEmployeeSubmission, false, "the truthful readiness verdict must survive the override");
    assert.ok(readiness.blockers.length > 0, "the remaining work must still be listed so it can be finished later");
  });

  test("the override refuses an Administrator target, an unknown user, and an empty reason", () => {
    const before = prepared();
    assert.equal(administratorOverrideEmploymentActivation(before, data, ADMIN_ID, ADMIN_ID, "Trying to override an Administrator"), before);
    assert.equal(administratorOverrideEmploymentActivation(before, data, "uid-nobody", ADMIN_ID, "Unknown identity"), before);
    assert.equal(administratorOverrideEmploymentActivation(before, data, REP_A, ADMIN_ID, "  "), before);
  });
});
