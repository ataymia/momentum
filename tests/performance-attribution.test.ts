import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createDemoData } from "../lib/demo-data";
import { canViewPerformanceRecord, periodRange, userCommercialMetrics } from "../lib/performance-engine";
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

test("completed appointment metrics use the appointment business date rather than UTC completion timestamp date", () => {
  const base=createDemoData();
  const rep=base.users.find((user)=>user.id==="usr-jordan")!;
  const appointment={...base.appointments[0],id:"apt-midnight",ownerId:rep.id,date:"2026-09-09",status:"Completed" as const,completedAt:"2026-09-10T01:30:00.000Z"};
  const data={...base,appointments:[appointment]};
  assert.equal(userCommercialMetrics(data,rep.id,"2026-09-09","2026-09-09").completedAppointments,1);
  assert.equal(userCommercialMetrics(data,rep.id,"2026-09-10","2026-09-10").completedAppointments,0);
});

test("performance calendar ranges stay correct without host timezone arithmetic", () => {
  assert.deepEqual(periodRange("Weekly","2026-09-09"),{start:"2026-09-07",end:"2026-09-13"});
  assert.deepEqual(periodRange("Monthly","2028-02-12"),{start:"2028-02-01",end:"2028-02-29"});
  assert.deepEqual(periodRange("Quarterly","2026-11-01"),{start:"2026-10-01",end:"2026-12-31"});
});

test("sales-manager performance visibility follows direct reports or explicitly managed teams, not loose peer team membership", () => {
  const base = createDemoData();
  const manager = base.users.find((user) => user.role === "Sales Manager")!;
  const direct = base.users.find((user) => user.role === "Sales Representative")!;
  assert.equal(canViewPerformanceRecord(manager, direct.id, base), true);

  const peerManager: WorkspaceUser = { ...manager, id: "mgr-peer", name: "Peer Manager", firstName: "Peer", email: "peer@example.test", initials: "PM", managerId: undefined, managedTeams: [] };
  const unrelatedRep: WorkspaceUser = { ...direct, id: "rep-unrelated", name: "Unrelated Rep", firstName: "Unrelated", email: "unrelated@example.test", initials: "UR", managerId: "someone-else", team: manager.team };
  const looseTeamData = { ...base, users: [...base.users, peerManager, unrelatedRep] };
  assert.equal(canViewPerformanceRecord(peerManager, unrelatedRep.id, looseTeamData), false);

  const scopedManager = { ...peerManager, managedTeams: [unrelatedRep.team] };
  const managedTeamData = { ...looseTeamData, users: looseTeamData.users.map((user) => user.id === scopedManager.id ? scopedManager : user) };
  assert.equal(canViewPerformanceRecord(scopedManager, unrelatedRep.id, managedTeamData), true);
});

test("performance context derives report numbers from source records instead of trusting submitted KPI values", () => {
  const source = readFileSync(new URL("../lib/performance-context.tsx", import.meta.url), "utf8");
  assert.match(source, /goal\.userId!==currentUser\.id/);
  assert.match(source, /report\.userId!==currentUser\.id/);
  assert.match(source, /const duplicate=performance\.reports\.some/);
  assert.match(source, /userCommercialMetrics\(data,currentUser\.id,report\.workDate,report\.workDate\)/);
  assert.match(source, /managerWeeklyMetrics\(performance,data,currentUser\.id,report\.weekStart,report\.weekEnd\)/);
  assert.match(source, /\.\.\.sourceMetrics/);
  assert.match(source, /report\.userId===currentUser\.id\|\|!canViewPerformanceRecord/);
  assert.match(source, /currentUser\?\.role!=="Administrator"/);
});

test("reporting UI uses the Arizona business calendar, blocks duplicate submissions visibly, and hides management notes from non-reviewers", () => {
  const source = readFileSync(new URL("../components/performance/reporting-center.tsx", import.meta.url), "utf8");
  assert.match(source, /arizonaDateKey/);
  assert.doesNotMatch(source, /const today=\(\)=>new Date\(\)\.toISOString\(\)\.slice\(0,10\)/);
  assert.match(source, /dailyDuplicate/);
  assert.match(source, /weeklyDuplicate/);
  assert.match(source, /canReviewSelected&&<>/);
});
