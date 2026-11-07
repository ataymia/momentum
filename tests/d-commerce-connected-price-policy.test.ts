import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePartnerPricing, PARTNER_PRICING_RULE } from "../lib/pricing-engine";
import type { WorkspaceData } from "../lib/types";

const paid=(id:string,day:string,cases:number)=>({id,accountId:"store",placedAt:day,cases,status:"Delivered",paymentStatus:"Paid"});
const data=(...orders:ReturnType<typeof paid>[])=>({accounts:[{id:"store",pricingTier:"B"}],orders}) as unknown as WorkspaceData;
const on=(day:string)=>new Date(day+"T12:00:00Z");

test("retailer launch is 60 days, distinct from 90-day sales bonuses",()=>{
  assert.equal(PARTNER_PRICING_RULE.introDays,60);
  assert.equal(PARTNER_PRICING_RULE.reviewCadence,"calendar quarter");
  const opening=evaluatePartnerPricing(data(),"store",on("2026-01-01"));
  assert.equal(opening.status,"Not started");
  assert.equal(opening.currentPricePerCase,24);
  assert.equal(opening.thresholdCases,10);
  const intro=evaluatePartnerPricing(data(paid("open","2026-01-01",10)),"store",on("2026-03-01"));
  assert.equal(intro.status,"Intro partner pricing");
  assert.equal(intro.nextReviewDate,"2026-03-02");
});
test("intro extension ends after the next complete calendar quarter",()=>{
  const rows=data(paid("open","2026-01-01",10),paid("more","2026-02-01",10));
  assert.equal(evaluatePartnerPricing(rows,"store",on("2026-06-30")).currentPricePerCase,24);
  const after=evaluatePartnerPricing(rows,"store",on("2026-07-01"));
  assert.equal(after.currentPricePerCase,undefined);
  assert.equal(after.effectiveTier,undefined);
});
test("quarterly retailer pricing does not use a rolling 90-day window",()=>{
  const rows=data(paid("open","2026-01-01",10),paid("april","2026-04-07",60));
  const result=evaluatePartnerPricing(rows,"store",on("2026-07-01"));
  assert.equal(result.currentPricePerCase,24);
  assert.equal(result.currentWindowStart,"2026-07-01");
  assert.equal(result.countedCases,60);
  assert.equal(result.effectiveTier,"A");
});
