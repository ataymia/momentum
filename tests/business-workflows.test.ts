import assert from "node:assert/strict";
import test from "node:test";
import { evaluateSalesRepAccountBonuses } from "../lib/bonus-engine";
import { createDemoData } from "../lib/demo-data";
import { evaluatePartnerPricing } from "../lib/pricing-engine";
import type { WorkspaceData } from "../lib/types";

test("opening bonus is earned only when the qualifying first order is paid", () => {
  const data = createDemoData();
  const signals = evaluateSalesRepAccountBonuses(data, new Date());
  const opening = signals.find((signal) => signal.id === "bonus-acc-101-opening");
  assert.ok(opening);
  assert.equal(opening.observedCases, 12);
  assert.equal(opening.thresholdCases, 10);
  assert.equal(opening.amount, 25);
  assert.equal(opening.status, "Earned");
});

test("an unpaid qualifying opening order waits for payment instead of earning the bonus", () => {
  const base = createDemoData();
  const data: WorkspaceData = {
    ...base,
    orders: base.orders.map((order) => order.accountId === "acc-101" ? { ...order, status: "Delivered" as const, paymentStatus: "Open" as const } : order),
  };
  const opening = evaluateSalesRepAccountBonuses(data, new Date()).find((signal) => signal.id === "bonus-acc-101-opening");
  assert.equal(opening?.status, "Awaiting payment");
});

test("sustained bonus requires 40 cumulative paid cases inside 90 days from the first order", () => {
  const base = createDemoData();
  const firstOrder = base.orders.filter((order) => order.accountId === "acc-101").sort((a,b) => a.placedAt.localeCompare(b.placedAt))[0];
  assert.ok(firstOrder);
  const data: WorkspaceData = {
    ...base,
    orders: [
      ...base.orders,
      {
        id: "ord-test-growth",
        number: "GE-TEST",
        accountId: "acc-101",
        cases: 28,
        pricePerCase: 24,
        amount: 672,
        status: "Paid",
        placedAt: firstOrder.placedAt,
        ownerId: "usr-jordan",
        priceBasis: "Demo entered price",
        paymentStatus: "Paid",
      },
    ],
  };
  const sustained = evaluateSalesRepAccountBonuses(data, new Date()).find((signal) => signal.id === "bonus-acc-101-sustained");
  assert.ok(sustained);
  assert.equal(sustained.observedCases, 40);
  assert.equal(sustained.thresholdCases, 40);
  assert.equal(sustained.amount, 25);
  assert.equal(sustained.status, "Earned");
});

test("partner pricing uses the first order as its clock and tracks the 20-case continuation threshold", () => {
  const data = createDemoData();
  const firstOrder = data.orders.filter((order) => order.accountId === "acc-101").sort((a,b) => a.placedAt.localeCompare(b.placedAt))[0];
  assert.ok(firstOrder);
  const pricing = evaluatePartnerPricing(data, "acc-101", new Date());
  assert.equal(pricing.firstOrderDate, firstOrder.placedAt);
  assert.equal(pricing.partnerPricePerCase, 24);
  assert.equal(pricing.thresholdCases, 20);
});

test("accounts not owned by a sales representative do not produce rep bonus signals", () => {
  const data = createDemoData();
  const signals = evaluateSalesRepAccountBonuses(data, new Date());
  assert.equal(signals.some((signal) => signal.accountId === "acc-103"), false);
  assert.equal(signals.some((signal) => signal.accountId === "acc-105"), false);
});
