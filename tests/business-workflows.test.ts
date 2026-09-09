import assert from "node:assert/strict";
import test from "node:test";
import { evaluateSalesRepAccountBonuses } from "../lib/bonus-engine";
import { createDemoData } from "../lib/demo-data";
import { evaluatePartnerPricing } from "../lib/pricing-engine";
import type { Order, PricingTier, WorkspaceData } from "../lib/types";

const paidOrder = (id:string,cases:number,placedAt:string):Order => ({
  id, number:`GE-${id}`, accountId:"acc-101", cases, pricePerCase:24, amount:cases*24,
  status:"Paid", placedAt, paidAt:placedAt, ownerId:"usr-jordan", priceBasis:"Demo entered price", paymentStatus:"Paid",
});
const account101Scenario = (orders:Order[]):WorkspaceData => {
  const base=createDemoData();
  return {...base,orders:[...base.orders.filter((order)=>order.accountId!=="acc-101"),...orders]};
};
const assignOutsideTier=(data:WorkspaceData,tier:Exclude<PricingTier,"A">):WorkspaceData=>({...data,accounts:data.accounts.map((account)=>account.id==="acc-101"?{...account,pricingTier:tier}:account)});

test("opening bonus is earned only when the qualifying first order is paid", () => {
  const data=account101Scenario([paidOrder("opening",10,"2026-01-01")]);
  const opening=evaluateSalesRepAccountBonuses(data,new Date("2026-01-15T12:00:00")).find((signal)=>signal.id==="bonus-acc-101-opening");
  assert.ok(opening);assert.equal(opening.observedCases,10);assert.equal(opening.amount,25);assert.equal(opening.status,"Earned");
});

test("an unpaid qualifying opening order waits for payment instead of earning the bonus", () => {
  const data=account101Scenario([{...paidOrder("opening",10,"2026-01-01"),status:"Delivered",paymentStatus:"Open",paidAt:undefined}]);
  const opening=evaluateSalesRepAccountBonuses(data,new Date("2026-01-15T12:00:00")).find((signal)=>signal.id==="bonus-acc-101-opening");
  assert.equal(opening?.status,"Awaiting payment");
});

test("a sub-10 opening order does not earn the first bonus but the independent milestone can earn after 40 additional paid cases", () => {
  const data=account101Scenario([paidOrder("small-opening",8,"2026-01-01"),paidOrder("growth",40,"2026-02-01")]);
  const signals=evaluateSalesRepAccountBonuses(data,new Date("2026-02-05T12:00:00"));
  assert.equal(signals.find((signal)=>signal.id==="bonus-acc-101-opening")?.status,"Not qualified");
  const sustained=signals.find((signal)=>signal.id==="bonus-acc-101-sustained");
  assert.equal(sustained?.observedCases,40);
  assert.deepEqual(sustained?.evidenceOrderIds,["growth"]);
  assert.equal(sustained?.status,"Earned");
});

test("sustained bonus requires 40 additional paid cases after the opening order inside 90 days", () => {
  const shortData=account101Scenario([paidOrder("opening",10,"2026-01-01"),paidOrder("growth-30",30,"2026-03-15")]);
  const short=evaluateSalesRepAccountBonuses(shortData,new Date("2026-03-16T12:00:00")).find((signal)=>signal.id==="bonus-acc-101-sustained");
  assert.ok(short);assert.equal(short.observedCases,30);assert.equal(short.amount,25);assert.equal(short.status,"Tracking");assert.deepEqual(short.evidenceOrderIds,["growth-30"]);

  const qualifiedData=account101Scenario([paidOrder("opening",10,"2026-01-01"),paidOrder("growth-30",30,"2026-03-15"),paidOrder("growth-10",10,"2026-03-16")]);
  const qualified=evaluateSalesRepAccountBonuses(qualifiedData,new Date("2026-03-17T12:00:00")).find((signal)=>signal.id==="bonus-acc-101-sustained");
  assert.ok(qualified);assert.equal(qualified.observedCases,40);assert.equal(qualified.status,"Earned");assert.deepEqual(qualified.evidenceOrderIds,["growth-30","growth-10"]);
});

test("every new ordering account starts at Tier A Partner Pricing for the 60-day introductory window", () => {
  const data=account101Scenario([paidOrder("small-opening",1,"2026-01-01")]);
  const pricing=evaluatePartnerPricing(data,"acc-101",new Date("2026-01-30T12:00:00"));
  assert.equal(pricing.status,"Intro partner pricing");
  assert.equal(pricing.effectiveTier,"A");
  assert.equal(pricing.currentPricePerCase,24);
  assert.equal(pricing.countedCases,1);
  assert.equal(pricing.thresholdCases,20);
});

test("20 paid cases in the first 60 days carry Tier A Partner Pricing into the next 90-day period", () => {
  const data=account101Scenario([paidOrder("opening",10,"2026-01-01"),paidOrder("intro-reorder",10,"2026-02-01")]);
  const pricing=evaluatePartnerPricing(data,"acc-101",new Date("2026-03-15T12:00:00"));
  assert.equal(pricing.status,"Partner pricing");assert.equal(pricing.effectiveTier,"A");assert.equal(pricing.currentPricePerCase,24);
});

test("missing the rolling 20-case threshold leaves Partner Pricing and requires an outside tier", () => {
  const data=account101Scenario([paidOrder("opening",10,"2026-01-01"),paidOrder("intro-reorder",10,"2026-02-01")]);
  const pricing=evaluatePartnerPricing(data,"acc-101",new Date("2026-06-10T12:00:00"));
  assert.equal(pricing.status,"Standard pricing");assert.equal(pricing.effectiveTier,undefined);assert.equal(pricing.currentPricePerCase,undefined);
});

test("Tier B and Tier C provide the approved outside-Partner case prices", () => {
  const base=account101Scenario([paidOrder("opening",10,"2026-01-01")]);
  const asOf=new Date("2026-06-10T12:00:00");
  const tierB=evaluatePartnerPricing(assignOutsideTier(base,"B"),"acc-101",asOf);
  const tierC=evaluatePartnerPricing(assignOutsideTier(base,"C"),"acc-101",asOf);
  assert.equal(tierB.status,"Standard pricing");assert.equal(tierB.effectiveTier,"B");assert.equal(tierB.currentPricePerCase,27);
  assert.equal(tierC.status,"Standard pricing");assert.equal(tierC.effectiveTier,"C");assert.equal(tierC.currentPricePerCase,30);
});

test("an outside-Partner account can re-enter Tier A after restoring 20 paid cases in a rolling 90-day window", () => {
  const base=account101Scenario([paidOrder("opening",10,"2026-01-01"),paidOrder("intro-reorder",10,"2026-02-01"),paidOrder("requalify",20,"2026-06-05")]);
  const data=assignOutsideTier(base,"B");
  const pricing=evaluatePartnerPricing(data,"acc-101",new Date("2026-06-06T12:00:00"));
  assert.equal(pricing.status,"Partner pricing");
  assert.equal(pricing.effectiveTier,"A");
  assert.equal(pricing.currentPricePerCase,24);
  assert.equal(pricing.currentWindowStart,"2026-06-05");
  assert.equal(pricing.countedCases,0);
});

test("accounts not owned by a sales representative do not produce rep bonus signals", () => {
  const data=createDemoData();const signals=evaluateSalesRepAccountBonuses(data,new Date());
  assert.equal(signals.some((signal)=>signal.accountId==="acc-103"),false);assert.equal(signals.some((signal)=>signal.accountId==="acc-105"),false);
});
