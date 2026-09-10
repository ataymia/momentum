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

test("public production runtime excludes demo identities while local demo mode retains warehouse role and demo SKU", () => {
  const source = readFileSync(new URL("../lib/workspace-context.tsx", import.meta.url), "utf8");
  assert.match(source, /const runtimeMode = useRuntimeModeValue\(\)/);
  assert.match(source, /const demoMode = runtimeMode === "demo"/);
  assert.match(source, /if \(!demoMode\)[\s\S]{0,100}?removeItem\(WAREHOUSE_SESSION_KEY\)/);
  assert.match(source, /base\.data\.users\.filter\(\(user\) => !isDemoIdentity\(user\)\)/);
  assert.match(source, /if \(!demoMode\) \{[\s\S]*?users: productionUsers/);
  assert.match(source, /const cleanBaseUsers = base\.data\.users;/);
  assert.match(source, /!cleanBaseUsers\.some\(\(user\) => user\.id === warehouseUser\.id\)/);
  assert.match(source, /!base\.data\.inventory\.some\(\(lot\) => lot\.id === tropicalLot\.id\)/);
  assert.match(source, /if \(!demoMode\) return \{ ok: false, message: "Sign-in will be available when Firebase Authentication is connected\." \}/);
  assert.match(source, /if \(email\.trim\(\)\.toLowerCase\(\) === warehouseUser\.email && password === "admin"\)/);
  assert.match(source, /if \(demoMode && userId === warehouseUser\.id\)/);
});

test("enhanced order creation requires canonical custody availability and finite whole-case input", () => {
  const source = readFileSync(new URL("../lib/workspace-context.tsx", import.meta.url), "utf8");
  assert.match(source, /inventoryAvailableAtOrder\??: number/);
  assert.match(source, /!Number\.isInteger\(cases\) \|\| cases < 1/);
  assert.match(source, /typeof inventoryAvailableAtOrder !== "number"/);
  assert.match(source, /!Number\.isFinite\(inventoryAvailableAtOrder\) \|\| inventoryAvailableAtOrder < 0/);
  assert.match(source, /const available = inventoryAvailableAtOrder;/);
  assert.doesNotMatch(source, /inventoryAvailableAtOrder \?\? data\.inventory/);
  assert.match(source, /data\.inventory\.some\(\(lot\) => lot\.product === selectedProduct\)/);
});

test("enhanced workspace rejects malformed business dates and times at mutation boundaries", () => {
  const source = readFileSync(new URL("../lib/workspace-context.tsx", import.meta.url), "utf8");
  assert.match(source, /isValidCalendarDateKey\(appointment\.date\)/);
  assert.match(source, /validTime\(appointment\.startTime\)/);
  assert.match(source, /isValidCalendarDateKey\(closeout\.nextActionDate\)/);
  assert.match(source, /isValidCalendarDateKey\(date\) \|\| !validTime\(startTime\)/);
  assert.match(source, /isValidCalendarDateKey\(lot\.receivedAt\)/);
  assert.match(source, /isValidCalendarDateKey\(lot\.bestBy\)/);
});

test("presentation seed cannot clear persisted records outside demo mode", () => {
  const source = readFileSync(new URL("../components/momentum-app.tsx", import.meta.url), "utf8");
  assert.match(source, /currentRuntimeMode\(\) !== "demo"/);
});
