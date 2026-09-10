import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createDemoData } from "../lib/demo-data";
import { paidAccountRollupAfterPayment } from "../lib/workspace-controls";

const base = createDemoData();
const account = base.accounts[0];
const template = base.orders[0];

test("paid account rollup recomputes lifetime cases and reorder count when paid state is lost", () => {
  const data = {
    ...base,
    orders: [
      { ...template, id:"rollup-1", accountId:account.id, cases:10, paymentStatus:"Paid" as const },
      { ...template, id:"rollup-2", accountId:account.id, cases:15, paymentStatus:"Paid" as const },
      { ...template, id:"rollup-3", accountId:account.id, cases:20, paymentStatus:"Open" as const },
    ],
  };
  const result = paidAccountRollupAfterPayment(data, account.id, "rollup-2", "Open");
  assert.equal(result.lifetimeCases, 10);
  assert.equal(result.reorderCount, 0);
  assert.deepEqual(result.paidOrderIds, ["rollup-1"]);
});

test("paid account rollup includes a newly paid order without trusting stored account totals", () => {
  const data = {
    ...base,
    orders: [
      { ...template, id:"rollup-1", accountId:account.id, cases:10, paymentStatus:"Paid" as const },
      { ...template, id:"rollup-2", accountId:account.id, cases:15, paymentStatus:"Paid" as const },
      { ...template, id:"rollup-3", accountId:account.id, cases:20, paymentStatus:"Open" as const },
    ],
  };
  const result = paidAccountRollupAfterPayment(data, account.id, "rollup-3", "Paid");
  assert.equal(result.lifetimeCases, 45);
  assert.equal(result.reorderCount, 2);
  assert.deepEqual(new Set(result.paidOrderIds), new Set(["rollup-1","rollup-2","rollup-3"]));
});

test("base and enhanced workspace mutations consume centralized actor controls", () => {
  const baseWorkspace = readFileSync(new URL("../lib/workspace-context-v5.tsx", import.meta.url), "utf8");
  const enhancedWorkspace = readFileSync(new URL("../lib/workspace-context.tsx", import.meta.url), "utf8");

  assert.match(baseWorkspace, /canAssignScheduleUser\(data, currentUser, ownerId\)/);
  assert.match(baseWorkspace, /canAssignScheduleUser\(current, currentUser, ownerId\)/);
  assert.match(baseWorkspace, /if \(!canReconcileOrderPayment\(currentUser\)\) return;/);
  assert.match(baseWorkspace, /paidAccountRollupAfterPayment\(current, order\.accountId, order\.id, status\)/);

  assert.match(enhancedWorkspace, /canTransferSalesResponsibility\(data, currentUser, account, toUserId\)/);
  assert.match(enhancedWorkspace, /canAssignScheduleUser\(data, currentUser, ownerId\)/);
  assert.match(enhancedWorkspace, /if \(!canReconcileOrderPayment\(currentUser\)\) return;/);
  assert.match(enhancedWorkspace, /paidAccountRollupAfterPayment\(data, order\.accountId, order\.id, status\)/);
});
