import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Finance page derives reimbursement aggregates only from visible expenses", () => {
  const source = readFileSync(new URL("../components/pages/finance-v2.tsx", import.meta.url), "utf8");
  assert.match(source, /const visibleExpenses\s*=\s*finance\.expenses\.filter/);
  assert.match(source, /const submittedExpenseCount\s*=\s*visibleExpenses\.filter/);
  assert.match(source, /const payable\s*=\s*visibleExpenses\.filter/);
  assert.doesNotMatch(source, /const submittedExpenseCount\s*=\s*finance\.expenses\.filter/);
  assert.doesNotMatch(source, /const payable\s*=\s*finance\.expenses\.filter/);
});

test("Finance receivable and cash aggregates are constrained by workspace order scope", () => {
  const source = readFileSync(new URL("../components/pages/finance-v2.tsx", import.meta.url), "utf8");
  assert.match(source, /const scopeOrderIds\s*=\s*new Set\(scope\.orders\.map/);
  assert.match(source, /openReceivables\(commerce\)\.filter\(\(item\) => scopeOrderIds\.has\(item\.invoice\.orderId\)\)/);
  assert.match(source, /scopeOrderIds\.has\(invoice\.orderId\)/);
});

test("Native accounting aggregates and controls are Administrator-only", () => {
  const source = readFileSync(new URL("../components/accounting/accounting-panel-v2.tsx", import.meta.url), "utf8");
  const gate = source.indexOf('if (currentUser?.role !== "Administrator") return null;');
  const aggregate = source.indexOf("const eventReady");
  assert.ok(gate >= 0, "Accounting panel must have an Administrator gate");
  assert.ok(aggregate > gate, "Accounting aggregates must be calculated after the Administrator gate");
});
