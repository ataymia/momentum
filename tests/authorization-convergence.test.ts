import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canManageUser } from "../lib/access";
import { createDemoData } from "../lib/demo-data";
import { canViewEmployeeManagementDetail } from "../lib/employee-profile";
import { canManageEmployee } from "../lib/hcm-engine";

test("HCM and employee management detail resolve to the centralized management model", () => {
  const data = createDemoData();
  for (const actor of data.users.filter((user) => user.role !== "Customer")) {
    for (const target of data.users.filter((user) => user.role !== "Customer")) {
      assert.equal(canManageEmployee(actor, target.id, data), canManageUser(data, actor, target.id, true), `HCM drift for ${actor.id} -> ${target.id}`);
      assert.equal(canViewEmployeeManagementDetail(actor, target, data), canManageUser(data, actor, target.id, true), `Directory drift for ${actor.id} -> ${target.id}`);
    }
  }
});

test("production manager surfaces pass canonical workspace data and do not grant authority from same-team peer membership", () => {
  const directory = readFileSync(new URL("../components/hcm/employee-directory.tsx", import.meta.url), "utf8");
  assert.match(directory, /canViewEmployeeManagementDetail\(currentUser, selected, data\)/);

  for (const file of [
    "../components/work/action-center-v2.tsx",
    "../components/work/action-center-v3.tsx",
    "../components/work/action-center-v4.tsx",
    "../components/pages/finance-v2.tsx",
    "../components/pages/reports.tsx",
  ]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /managerId\s*===\s*currentUser\.id\s*\|\|[^;\n]*team\s*===\s*currentUser\.team/, `${file} contains a loose same-team management grant`);
  }
});

test("centralized access helper does not treat ordinary same-team membership as management scope", () => {
  const data = createDemoData();
  const manager = data.users.find((user) => user.role === "Sales Manager")!;
  const peer = { ...data.users.find((user) => user.role === "Sales Representative")!, id:"unmanaged-sales-peer", managerId:undefined, team:manager.team };
  const isolated = { ...data, users:[...data.users, peer] };
  assert.equal(canManageUser(isolated, manager, peer.id, false), (manager.managedTeams ?? []).includes(peer.team));

  const managerWithoutTeamGrant = { ...manager, managedTeams:[] };
  const isolatedNoGrant = { ...isolated, users:isolated.users.map((user) => user.id === manager.id ? managerWithoutTeamGrant : user) };
  assert.equal(canManageUser(isolatedNoGrant, managerWithoutTeamGrant, peer.id, false), false);
});
