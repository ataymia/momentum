import assert from "node:assert/strict";
import test from "node:test";
import {
  canAccessPage,
  canPublishBulletinTo,
  canReviewApproval,
  getWorkspaceScope,
} from "../lib/access";
import { createDemoData } from "../lib/demo-data";
import type { Approval } from "../lib/types";

const data = createDemoData();
const user = (id: string) => {
  const match = data.users.find((candidate) => candidate.id === id);
  assert.ok(match);
  return match;
};

test("administrator has company-wide records and every department", () => {
  const admin = user("usr-mia");
  const scope = getWorkspaceScope(data, admin);
  assert.equal(scope.accounts.length, data.accounts.length);
  assert.equal(scope.orders.length, data.orders.length);
  assert.equal(scope.inventory.length, data.inventory.length);
  assert.equal(scope.bulletins.length, data.bulletins.length);
  for (const page of ["accounts","inventory","marketing","people","payroll","finance","reports","settings","help"] as const) assert.equal(canAccessPage(admin, page), true);
});

test("sales manager is limited to team sales workflows, approvals, reports, and help", () => {
  const manager = user("usr-avery");
  const scope = getWorkspaceScope(data, manager);
  assert.deepEqual(scope.accounts.map((account) => account.ownerId), ["usr-jordan", "usr-jordan", "usr-jordan", "usr-jordan"]);
  assert.equal(scope.inventory.length, 0);
  assert.equal(canAccessPage(manager, "reports"), true);
  assert.equal(canAccessPage(manager, "help"), true);
  assert.equal(canAccessPage(manager, "marketing"), false);
  assert.equal(canAccessPage(manager, "people"), false);
  assert.equal(canAccessPage(manager, "payroll"), false);
  assert.equal(canAccessPage(manager, "finance"), false);
  assert.equal(canAccessPage(manager, "settings"), false);
  assert.equal(canAccessPage(manager, "inventory"), false);
});

test("sales representative is limited to own core sales execution and help", () => {
  const rep = user("usr-jordan");
  const scope = getWorkspaceScope(data, rep);
  assert.equal(scope.accounts.every((account) => account.ownerId === rep.id), true);
  assert.equal(scope.appointments.every((item) => item.ownerId === rep.id), true);
  assert.equal(scope.inventory.length, 0);
  assert.equal(canAccessPage(rep, "help"), true);
  assert.equal(canAccessPage(rep, "marketing"), false);
  assert.equal(canAccessPage(rep, "people"), false);
  assert.equal(canAccessPage(rep, "payroll"), false);
  assert.equal(canAccessPage(rep, "finance"), false);
  assert.equal(canAccessPage(rep, "reports"), false);
  assert.equal(canAccessPage(rep, "settings"), false);
});

test("operations gets fulfillment, inventory, employee workflows, and help without unrelated sales execution", () => {
  const operations = user("usr-elena");
  const scope = getWorkspaceScope(data, operations);
  assert.equal(scope.orders.length, data.orders.length);
  assert.equal(scope.inventory.length, data.inventory.length);
  assert.equal(scope.placements.length, 0);
  assert.equal(scope.appointments.every((item) => item.ownerId === operations.id || item.type === "Delivery"), true);
  assert.equal(scope.activities.every((item) => item.type === "order" || item.type === "visit"), true);
  assert.equal(canAccessPage(operations, "orders"), true);
  assert.equal(canAccessPage(operations, "inventory"), true);
  assert.equal(canAccessPage(operations, "marketing"), true);
  assert.equal(canAccessPage(operations, "people"), true);
  assert.equal(canAccessPage(operations, "payroll"), true);
  assert.equal(canAccessPage(operations, "finance"), true);
  assert.equal(canAccessPage(operations, "help"), true);
  assert.equal(canAccessPage(operations, "accounts"), false);
  assert.equal(canAccessPage(operations, "retail"), false);
  assert.equal(canAccessPage(operations, "reports"), false);
});

test("customer sees only its linked account, orders, and help", () => {
  const customer = user("usr-customer");
  const scope = getWorkspaceScope(data, customer);
  assert.deepEqual(scope.accounts.map((account) => account.id), ["acc-101"]);
  assert.deepEqual(scope.orders.map((order) => order.accountId), ["acc-101"]);
  assert.equal(scope.placements.length, 0);
  assert.equal(scope.inventory.length, 0);
  assert.equal(scope.notifications.length, 0);
  assert.equal(scope.bulletins.length, 0);
  assert.equal(canAccessPage(customer, "home"), true);
  assert.equal(canAccessPage(customer, "accounts"), true);
  assert.equal(canAccessPage(customer, "orders"), true);
  assert.equal(canAccessPage(customer, "help"), true);
  assert.equal(canAccessPage(customer, "marketing"), false);
  assert.equal(canAccessPage(customer, "people"), false);
  assert.equal(canAccessPage(customer, "payroll"), false);
  assert.equal(canAccessPage(customer, "finance"), false);
  assert.equal(canAccessPage(customer, "settings"), false);
});

test("approval and bulletin authority follows the hierarchy", () => {
  const admin = user("usr-mia");
  const manager = user("usr-avery");
  const rep = user("usr-jordan");
  const repApproval = data.approvals.find((item) => item.requesterId === rep.id);
  assert.ok(repApproval);
  assert.equal(canReviewApproval(data, admin, repApproval), true);
  assert.equal(canReviewApproval(data, manager, repApproval), true);
  assert.equal(canReviewApproval(data, rep, repApproval), false);

  const managerSelfApproval: Approval = { ...repApproval, id: "apr-manager-self", requesterId: manager.id, requestedBy: manager.name };
  assert.equal(canReviewApproval(data, manager, managerSelfApproval), false);
  assert.equal(canReviewApproval(data, admin, managerSelfApproval), true);
  assert.equal(canPublishBulletinTo(admin, "Company"), true);
  assert.equal(canPublishBulletinTo(admin, "Team", "Operations"), true);
  assert.equal(canPublishBulletinTo(manager, "Team", "Sales"), true);
  assert.equal(canPublishBulletinTo(manager, "Company"), false);
  assert.equal(canPublishBulletinTo(manager, "Team", "Operations"), false);
  assert.equal(canPublishBulletinTo(rep, "Team", "Sales"), false);
});
