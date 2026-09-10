import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("browser-engine reset actions stay demo-only and administrator-controlled", () => {
  const sources = {
    finance: read("../lib/finance-context.tsx"),
    performance: read("../lib/performance-context.tsx"),
    crm: read("../lib/crm-context.tsx"),
    marketing: read("../lib/marketing-context.tsx"),
    hcm: read("../lib/hcm-context.tsx"),
    commerce: read("../lib/commerce-context.tsx"),
    payroll: read("../lib/payroll-context-v2.tsx"),
    inventory: read("../lib/inventory-ledger-context-v2.tsx"),
    accounting: read("../lib/accounting-context-v2.tsx"),
  };

  assert.match(sources.finance, /resetFinance[\s\S]{0,180}runtime\.isDemo[\s\S]{0,120}Administrator/);
  assert.match(sources.performance, /resetPerformance[\s\S]{0,180}runtime\.isDemo[\s\S]{0,120}Administrator/);
  assert.match(sources.crm, /resetCrm[\s\S]{0,180}runtime\.isDemo[\s\S]{0,120}Administrator/);
  assert.match(sources.marketing, /resetMarketing[\s\S]{0,180}runtime\.isDemo[\s\S]{0,120}isAdmin/);
  assert.match(sources.hcm, /resetHcm[\s\S]{0,180}runtime\.isDemo[\s\S]{0,120}Administrator/);
  assert.match(sources.commerce, /resetCommerce[\s\S]{0,180}runtime\.isDemo[\s\S]{0,120}Administrator/);
  assert.match(sources.payroll, /resetPayroll[\s\S]{0,180}runtime\.isDemo[\s\S]{0,120}isAdmin/);
  assert.match(sources.inventory, /resetLedger[\s\S]{0,180}runtime\.isDemo[\s\S]{0,120}Administrator/);
  assert.match(sources.accounting, /const canManageAccounting=currentUser\?\.role==="Administrator"/);
  assert.match(sources.accounting, /const resetAccounting=\(\)=>\{if\(!runtime\.isDemo\|\|!canManageAccounting\)return false;/);
});

test("payroll setup mutations are authorization-checked in the context, not only hidden in the UI", () => {
  const source = read("../lib/payroll-context-v2.tsx");
  assert.match(source, /const isAdmin=currentUser\?\.role==="Administrator"/);
  assert.match(source, /savePayGroup=[\s\S]{0,180}if\(!isAdmin/);
  assert.match(source, /savePayrollEmployee=[\s\S]{0,220}if\(!isAdmin/);
  assert.match(source, /saveWithholding=[\s\S]{0,220}if\(!isAdmin/);
  assert.match(source, /saveEmployerTaxRule=[\s\S]{0,220}if\(!isAdmin/);
  assert.match(source, /savePayrollEmployee=[\s\S]{0,500}payGroups\.some\(\(group\)=>group\.id===input\.payGroupId&&group\.active\)/);
  assert.match(source, /percentValid/);
});

test("customer cash mutations are administrator-controlled and receivable notes respect record scope", () => {
  const context = read("../lib/commerce-context.tsx");
  const panel = read("../components/commerce/order-cash-panel-v2.tsx");
  assert.match(context, /const canManageCash = currentUser\?\.role === "Administrator"/);
  assert.doesNotMatch(context, /Administrator" \|\| currentUser\?\.role === "Operations"/);
  assert.match(context, /accountIsVisible\(data, currentUser, account\)/);
  assert.match(panel, /const canFinance = currentUser\.role === "Administrator"/);
  assert.match(panel, /const todayKey = \(\) => arizonaDateKey\(\)/);
  assert.doesNotMatch(panel, /const todayKey = \(\) => new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
});
