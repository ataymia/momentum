import assert from "node:assert/strict";
import test from "node:test";
import { createDemoData } from "../lib/demo-data";
import { canManageEmployee } from "../lib/hcm-engine";
import type { WorkspaceUser } from "../lib/types";

const data = createDemoData();
const manager = data.users.find((user) => user.role === "Sales Manager");
const rep = data.users.find((user) => user.role === "Sales Representative");
const admin = data.users.find((user) => user.role === "Administrator");
assert.ok(manager && rep && admin);

test("HCM manager scope allows self, direct reports, and explicitly managed teams", () => {
  assert.equal(canManageEmployee(manager, manager.id, data), true);
  assert.equal(canManageEmployee(manager, rep.id, data), true);
  assert.equal(canManageEmployee(admin, rep.id, data), true);
});

test("same department alone does not grant HCM management authority", () => {
  const strictManager: WorkspaceUser = { ...manager, managedTeams: [] };
  const sameTeamPeer: WorkspaceUser = {
    ...rep,
    id: "usr-unmanaged-sales-peer",
    name: "Unmanaged Sales Peer",
    firstName: "Unmanaged",
    email: "unmanaged.peer@momentum.demo",
    initials: "UP",
    managerId: "usr-someone-else",
  };
  const scopedData = { ...data, users: [...data.users, sameTeamPeer] };
  assert.equal(sameTeamPeer.team, strictManager.team);
  assert.equal(canManageEmployee(strictManager, sameTeamPeer.id, scopedData), false);
});

test("explicit managed-team authority is deliberate and testable", () => {
  const sameTeamPeer: WorkspaceUser = {
    ...rep,
    id: "usr-managed-team-peer",
    name: "Managed Team Peer",
    firstName: "Managed",
    email: "managed.peer@momentum.demo",
    initials: "MP",
    managerId: "usr-someone-else",
  };
  const scopedData = { ...data, users: [...data.users, sameTeamPeer] };
  const teamManager: WorkspaceUser = { ...manager, managedTeams: [sameTeamPeer.team] };
  assert.equal(canManageEmployee(teamManager, sameTeamPeer.id, scopedData), true);
});
