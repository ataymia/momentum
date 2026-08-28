import assert from "node:assert/strict";
import test from "node:test";
import { evaluateSalesRepAccountBonuses } from "../lib/bonus-engine";
import { createDemoData } from "../lib/demo-data";
import { evaluatePartnerPricing } from "../lib/pricing-engine";
import type { Order, WorkspaceData } from "../lib/types";

const paidOrder = (id:string,cases:number,placedAt:string):Order => ({
  id, number:`GE-${id}`, accountId:"acc-101", cases, pricePerCase:24, amount:cases*24,
  status:"Paid", placedAt, ownerId:"usr-jordan", priceBasis:"Demo entered price", paymentStatus:"Paid",
});
const account101Scenario = (orders:Order[]):WorkspaceData => {
  const base=createDemoData();
  return {...base,orders:[...base.orders.filter((order)=>order.accountId!=="acc-101"),...orders]};
};

test("opening bonus is earned only when the qualifying first order is paid", () => {
  const data=account101Scenario([paidOrder("opening",10,"2026-01-01")]);
  const opening=evaluateSalesRepAccountBonuses(data,new Date("2026-01-15T12:00:00")).find((signal)=>signal.id==="bonus-acc-101-opening");
  assert.ok(opening);assert.equal(opening.observedCases,10);assert.equal(opening.amount,25);assert.equal(opening.status,"Earned");
});

test("an unpaid qualifying opening order waits for payment instead of earning the bonus", () => {
  const data=account101Scenario([{...paidOrder("opening",10,"2026-01-01"),status:"Delivered",paymentStatus:"Open"}]);
  const opening=evaluateSalesRepAccountBonuses(data,new Date("2026-01-15T12:00:00")).find((signal)=>signal.id==="bonus-acc-101-opening");
  assert.equal(opening?.status,"Awaiting payment");
});

test("a sub-10 opening order does not earn the first bonus but can still reach the independent 40-case milestone", () => {
  const data=account101Scenario([paidOrder("small-opening",8,"2026-01-01"),paidOrder("growth",32,"2026-02-01")]);
  const signals=evaluateSalesRepAccountBonuses(data,new Date("2026-02-05T12:00:00"));
  assert.equal(signals.find((signal)=>signal.id==="bonus-acc-101-opening")?.status,"Not qualified");
  assert.equal(signals.find((signal)=>signal.id==="bonus-acc-101-sustained")?.status,"Earned");
});

test("sustained bonus requires 40 cumulative paid cases inside 90 days from the first order", () => {
  const data=account101Scenario([paidOrder("opening",10,"2026-01-01"),paidOrder("growth",30,"2026-03-15")]);
  const sustained=evaluateSalesRepAccountBonuses(data,new Date("2026-03-16T12:00:00")).find((signal)=>signal.id==="bonus-acc-101-sustained");
  assert.ok(sustained);assert.equal(sustained.observedCases,40);assert.equal(sustained.amount,25);assert.equal(sustained.status,"Earned");
});

test("new qualifying account receives 60-day introductory Partner Pricing", () => {
  const data=account101Scenario([paidOrder("opening",10,"2026-01-01")]);
  const pricing=evaluatePartnerPricing(data,"acc-101",new Date("2026-01-30T12:00:00"));
  assert.equal(pricing.status,"Intro partner pricing");assert.equal(pricing.currentPricePerCase,24);assert.equal(pricing.countedCases,10);assert.equal(pricing.thresholdCases,20);
});

test("20 paid cases in the first 60 days carry Partner Pricing into the next 90-day period", () => {
  const data=account101Scenario([paidOrder("opening",10,"2026-01-01"),paidOrder("intro-reorder",10,"2026-02-01")]);
  const pricing=evaluatePartnerPricing(data,"acc-101",new Date("2026-03-15T12:00:00"));
  assert.equal(pricing.status,"Partner pricing");assert.equal(pricing.currentPricePerCase,24);
});

test("missing the next rolling 20-case threshold lapses Partner Pricing", () => {
  const data=account101Scenario([paidOrder("opening",10,"2026-01-01"),paidOrder("intro-reorder",10,"2026-02-01")]);
  const pricing=evaluatePartnerPricing(data,"acc-101",new Date("2026-06-10T12:00:00"));
  assert.equal(pricing.status,"Standard pricing");assert.equal(pricing.currentPricePerCase,undefined);
});

test("an account that lost Partner Pricing can re-enter after restoring 20 paid cases in a rolling 90-day window", () => {
  const data=account101Scenario([paidOrder("opening",10,"2026-01-01"),paidOrder("intro-reorder",10,"2026-02-01"),paidOrder("requalify",20,"2026-06-05")]);
  const pricing=evaluatePartnerPricing(data,"acc-101",new Date("2026-06-06T12:00:00"));
  assert.equal(pricing.status,"Partner pricing");
  assert.equal(pricing.currentPricePerCase,24);
  assert.equal(pricing.currentWindowStart,"2026-06-05");
  assert.equal(pricing.countedCases,0);
});

test("accounts not owned by a sales representative do not produce rep bonus signals", () => {
  const data=createDemoData();const signals=evaluateSalesRepAccountBonuses(data,new Date());
  assert.equal(signals.some((signal)=>signal.accountId==="acc-103"),false);assert.equal(signals.some((signal)=>signal.accountId==="acc-105"),false);
});
