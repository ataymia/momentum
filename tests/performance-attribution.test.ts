import assert from "node:assert/strict";
import test from "node:test";
import { createDemoData } from "../lib/demo-data";
import { userCommercialMetrics } from "../lib/performance-engine";
import type { Order, WorkspaceUser } from "../lib/types";

const paidOrder = (overrides: Partial<Order> = {}): Order => ({
  id: "metric-order",
  number: "GE-METRIC",
  accountId: "acc-101",
  cases: 10,
  pricePerCase: 24,
  amount: 240,
  status: "Paid",
  placedAt: "2026-09-05",
  paidAt: "2026-09-05",
  ownerId: "usr-jordan",
  creditedRepId: "usr-jordan",
  priceBasis: "test",
  paymentStatus: "Paid",
  ...overrides,
});

test("performance metrics preserve credited-rep attribution after an account responsibility transfer", () => {
  const base = createDemoData();
  const riley: WorkspaceUser = { ...base.users.find((user) => user.id === "usr-jordan")!, id: "usr-riley", name: "Riley Demo", firstName: "Riley", email: "riley@example.test", initials: "RD" };
  const data = {
    ...base,
    users: [...base.users, riley],
    accounts: base.accounts.map((account) => account.id === "acc-101" ? { ...account, ownerId: riley.id, accountManagerId: riley.id } : account),
    orders: [...base.orders.filter((order) => order.accountId !== "acc-101"), paidOrder()],
  };
  const jordan = userCommercialMetrics(data, "usr-jordan", "2026-09-01", "2026-09-30");
  const newOwner = userCommercialMetrics(data, riley.id, "2026-09-01", "2026-09-30");
  assert.equal(jordan.paidCases, 10);
  assert.equal(jordan.collectedRevenue, 240);
  assert.equal(jordan.newPaidAccounts, 1);
  assert.equal(newOwner.paidCases, 0);
  assert.equal(newOwner.newPaidAccounts, 0);
});

test("customer-entered orders can still credit the responsible rep when creditedRepId is present", () => {
  const base = createDemoData();
  const data = {
    ...base,
    orders: [...base.orders.filter((order) => order.accountId !== "acc-101"), paidOrder({ ownerId: "usr-customer", creditedRepId: "usr-jordan" })],
  };
  const metrics = userCommercialMetrics(data, "usr-jordan", "2026-09-01", "2026-09-30");
  assert.equal(metrics.paidOrders, 1);
  assert.equal(metrics.paidCases, 10);
  assert.equal(metrics.collectedRevenue, 240);
});
