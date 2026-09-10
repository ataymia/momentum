import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createDemoData } from "../lib/demo-data";
import { createIdentityProvisioningSeed, normalizeIdentityProvisioningState } from "../lib/identity-provisioning";
import type { WorkspaceData, WorkspaceUser } from "../lib/types";

const dataWithProductionIdentity = (): WorkspaceData => {
  const base = createDemoData();
  const user: WorkspaceUser = {
    id: "usr-production-new-hire",
    name: "Production New Hire",
    firstName: "Production",
    email: "newhire@momentumdistribution.com",
    initials: "PN",
    title: "Sales Representative",
    role: "Sales Representative",
    team: "Sales",
    managerId: "usr-mia",
    accent: "#444444",
  };
  return { ...base, users: [...base.users, user] };
};

test("unknown non-demo employee identities fail closed while local demo identities retain test access", () => {
  const state = createIdentityProvisioningSeed(dataWithProductionIdentity());
  const production = state.records.find((record) => record.userId === "usr-production-new-hire");
  const demo = state.records.find((record) => record.userId === "usr-mia");
  assert.equal(production?.state, "Suspended");
  assert.equal(production?.activatedAt, undefined);
  assert.equal(demo?.state, "Active");
});

test("referral is reserved as an internal future provisioning source without becoming an administrator role", () => {
  const data = createDemoData();
  const manager = data.users.find((user) => user.role === "Sales Manager")!;
  const state = normalizeIdentityProvisioningState({
    version: 1,
    records: [],
    drafts: [{
      id: "prehire-referral-1",
      source: "Referral",
      legalName: "Referral Candidate",
      workEmail: "referral.candidate@example.com",
      jobTitle: "Sales Representative",
      role: "Sales Representative",
      team: "Sales",
      managerId: manager.id,
      workLocation: "Phoenix, AZ",
      classification: "Hourly",
      payBasis: "Hourly",
      payRate: 20,
      payGroup: "Weekly",
      standardWeeklyHours: 40,
      startDate: "2026-09-15",
      courseIds: [],
      status: "Ready to invite",
      createdBy: "usr-mia",
      createdAt: "2026-09-10T12:00:00.000Z",
      updatedAt: "2026-09-10T12:00:00.000Z",
    }],
  }, data);
  assert.equal(state.drafts[0]?.source, "Referral");
  assert.notEqual(state.drafts[0]?.role, "Administrator");
});

test("public login has no demo account picker, demo credentials, or create-account control", () => {
  const source = readFileSync(new URL("../components/login-screen.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /@momentum\.demo/);
  assert.doesNotMatch(source, /Demo roles/);
  assert.doesNotMatch(source, /Password:\s*<b>admin/);
  assert.doesNotMatch(source, /Create account|Sign up|Register/i);
  assert.match(source, /Authorized access only/);
});

test("public runtime defaults to production and only localhost can enable demo mode", () => {
  const source = readFileSync(new URL("../lib/runtime-mode-store.ts", import.meta.url), "utf8");
  const controls = readFileSync(new URL("../components/settings/platform-controls.tsx", import.meta.url), "utf8");
  assert.match(source, /RUNTIME_MODE_SEED[^\n]+mode:\s*"production"/);
  assert.match(source, /hostname === "localhost"/);
  assert.match(source, /hostname === "127\.0\.0\.1"/);
  assert.match(source, /state\.mode === "demo" && !demoCapabilityEnabled\(\)/);
  assert.match(controls, /demoAvailable&&<Button/);
});

test("production workspace filters demo identities and refuses the legacy demo credential path", () => {
  const source = readFileSync(new URL("../lib/workspace-context.tsx", import.meta.url), "utf8");
  assert.match(source, /base\.data\.users\.filter\(\(user\) => !isDemoIdentity\(user\)\)/);
  assert.match(source, /if \(!demoMode\) return \{ ok: false, message: "Sign-in will be available when Firebase Authentication is connected\." \}/);
  assert.match(source, /if \(demoMode\) base\.switchUser\(userId\)/);
});
