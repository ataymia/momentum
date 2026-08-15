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

test("administrator has company-wide records and all pages", () => {
  const admin = user("usr-mia");
  const scope = getWorkspaceScope(data, admin);
  assert.equal(scope.accounts.length, data.accounts.length);
  assert.equal(scope.orders.length, data.orders.length);
  assert.equal(scope.inventory.length, data.inventory.length);
  assert.equal(scope.bulletins.length, data.bulletins.length);
  assert.equal(canAccessPage(admin, "settings"), true);
});

test("sales manager sees the managed team but not administration or inventory", () => {
  const manager = user("usr-avery");
  const scope = getWorkspaceScope(data, manager);
  assert.deepEqual(
    scope.accounts.map((account) => account.ownerId),
    ["usr-jordan", "usr-jordan", "usr-jordan", "usr-jordan"],
  );
  assert.equal(scope.inventory.length, 0);
  assert.equal(canAccessPage(manager, "reports"), true);
  assert.equal(canAccessPage(manager, "settings"), false);
  assert.equal(canAccessPage(manager, "inventory"), false);
});

test("sales representative is limited to owned customer and field records", () => {
  const rep = user("usr-jordan");
  const scope = getWorkspaceScope(data, rep);
  assert.equal(scope.accounts.every((account) => account.ownerId === rep.id), true);
  assert.equal(scope.appointments.every((item) => item.ownerId === rep.id), true);
  assert.equal(scope.inventory.length, 0);
  assert.equal(canAccessPage(rep, "reports"), false);
  assert.equal(canAccessPage(rep, "settings"), false);
});

test("operations gets fulfillment records without sales or admin pages", () => {
  const operations = user("usr-elena");
  const scope = getWorkspaceScope(data, operations);
  assert.equal(scope.orders.length, data.orders.length);
  assert.equal(scope.inventory.length, data.inventory.length);
  assert.equal(canAccessPage(operations, "orders"), true);
  assert.equal(canAccessPage(operations, "accounts"), false);
  assert.equal(canAccessPage(operations, "reports"), false);
});

test("customer sees only its linked account and orders", () => {
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
  assert.equal(canAccessPage(customer, "people"), false);
  assert.equal(canAccessPage(customer, "settings"), false);
});

test("approval and bulletin authority follows the hierarchy", () => {
  const admin = user("usr-mia");
  const manager = user("usr-avery");
  const rep = user("usr-jordan");
  const jordanApproval = data.approvals.find((item) => item.requesterId === rep.id);
  assert.ok(jordanApproval);
  assert.equal(canReviewApproval(data, admin, jordanApproval), true);
  assert.equal(canReviewApproval(data, manager, jordanApproval), true);
  assert.equal(canReviewApproval(data, rep, jordanApproval), false);

  const managerSelfApproval: Approval = {
    ...jordanApproval,
    id: "apr-manager-self",
    requesterId: manager.id,
    requestedBy: manager.name,
  };
  assert.equal(canReviewApproval(data, manager, managerSelfApproval), false);
  assert.equal(canReviewApproval(data, admin, managerSelfApproval), true);
  assert.equal(canPublishBulletinTo(admin, "Company"), true);
  assert.equal(canPublishBulletinTo(admin, "Team", "Operations"), true);
  assert.equal(canPublishBulletinTo(manager, "Team", "Sales"), true);
  assert.equal(canPublishBulletinTo(manager, "Company"), false);
  assert.equal(canPublishBulletinTo(manager, "Team", "Operations"), false);
  assert.equal(canPublishBulletinTo(rep, "Team", "Sales"), false);
});
