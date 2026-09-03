import assert from "node:assert/strict";
import test from "node:test";
import {
  canAccessPage,
  canPublishBulletinTo,
  canReviewApproval,
  getWorkspaceScope,
} from "../lib/access";
import { createDemoData } from "../lib/demo-data";
import type { Approval, WorkspaceUser } from "../lib/types";

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

test("sales manager gets managed sales plus team and own workforce self-service without administration or inventory", () => {
  const manager = user("usr-avery");
  const scope = getWorkspaceScope(data, manager);
  assert.deepEqual(scope.accounts.map((account) => account.ownerId), ["usr-jordan", "usr-jordan", "usr-jordan", "usr-jordan"]);
  assert.equal(scope.inventory.length, 0);
  for (const page of ["accounts","dispatch","retail","orders","marketing","people","payroll","finance","reports","help"] as const) assert.equal(canAccessPage(manager, page), true);
  assert.equal(canAccessPage(manager, "settings"), false);
  assert.equal(canAccessPage(manager, "inventory"), false);
});

test("sales representative gets own sales execution plus employee self-service and own reporting", () => {
  const rep = user("usr-jordan");
  const scope = getWorkspaceScope(data, rep);
  assert.equal(scope.accounts.every((account) => account.ownerId === rep.id), true);
  assert.equal(scope.appointments.every((item) => item.ownerId === rep.id), true);
  assert.equal(scope.inventory.length, 0);
  for (const page of ["accounts","dispatch","retail","orders","marketing","people","payroll","finance","reports","help"] as const) assert.equal(canAccessPage(rep, page), true);
  assert.equal(canAccessPage(rep, "settings"), false);
  assert.equal(canAccessPage(rep, "inventory"), false);
});

test("operations gets fulfillment, inventory and employee self-service without unrelated sales execution", () => {
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

test("warehouse gets warehouse and own workforce self-service only", () => {
  const warehouse: WorkspaceUser = { id:"usr-warehouse",name:"Warehouse Demo",firstName:"Warehouse",email:"warehouse@momentum.demo",initials:"WH",title:"Warehouse Coordinator",role:"Warehouse",team:"Operations",managerId:"usr-mia",accent:"#53657d" };
  const warehouseData = { ...data, users:[...data.users, warehouse] };
  const scope = getWorkspaceScope(warehouseData, warehouse);
  assert.equal(scope.orders.length, warehouseData.orders.length);
  assert.equal(scope.inventory.length, warehouseData.inventory.length);
  for (const page of ["orders","inventory","people","payroll","help"] as const) assert.equal(canAccessPage(warehouse, page), true);
  for (const page of ["accounts","retail","marketing","finance","reports","settings"] as const) assert.equal(canAccessPage(warehouse, page), false);
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
