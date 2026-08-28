import assert from "node:assert/strict";
import test from "node:test";
import { evaluateSalesRepAccountBonuses } from "../lib/bonus-engine";
import { createDemoData } from "../lib/demo-data";
import type { WorkspaceData } from "../lib/types";

test("opening bonus eligibility is detected from a qualifying completed first order", () => {
  const data = createDemoData();
  const signals = evaluateSalesRepAccountBonuses(data, new Date("2026-08-28T12:00:00"));
  const desertLantern = signals.find((signal) => signal.id === "bonus-acc-101-opening");
  assert.ok(desertLantern);
  assert.equal(desertLantern.observedCases, 12);
  assert.equal(desertLantern.thresholdCases, 10);
  assert.equal(desertLantern.amount, 25);
  assert.equal(desertLantern.status, "Eligibility detected");
});

test("sustained bonus requires 40 cumulative completed cases inside the 90 day window", () => {
  const base = createDemoData();
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
        placedAt: base.orders.find((order) => order.id === "ord-1047")?.placedAt ?? "2026-08-24",
        ownerId: "usr-jordan",
        priceBasis: "Demo entered price",
        paymentStatus: "Paid",
      },
    ],
  };
  const signals = evaluateSalesRepAccountBonuses(data, new Date("2026-08-28T12:00:00"));
  const sustained = signals.find((signal) => signal.id === "bonus-acc-101-sustained");
  assert.ok(sustained);
  assert.equal(sustained.observedCases, 40);
  assert.equal(sustained.thresholdCases, 40);
  assert.equal(sustained.amount, 25);
  assert.equal(sustained.status, "Eligibility detected");
});

test("accounts not owned by a sales representative do not produce rep bonus signals", () => {
  const data = createDemoData();
  const signals = evaluateSalesRepAccountBonuses(data, new Date("2026-08-28T12:00:00"));
  assert.equal(signals.some((signal) => signal.accountId === "acc-103"), false);
  assert.equal(signals.some((signal) => signal.accountId === "acc-105"), false);
});
