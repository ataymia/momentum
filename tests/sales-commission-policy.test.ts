import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { STANDARD_SALES_COMMISSION_POLICY, salesCommissionPolicyProblem, standardSalesCommissionPolicyReady } from "../lib/sales-commission-policy";

describe("standard sales commission policy", () => {
  test("locks the confirmed 2.50% representative + 0.50% manager = 3.00% allocation", () => {
    assert.equal(STANDARD_SALES_COMMISSION_POLICY.representativeRate, 0.025);
    assert.equal(STANDARD_SALES_COMMISSION_POLICY.managerOverrideRate, 0.005);
    assert.equal(STANDARD_SALES_COMMISSION_POLICY.maxCombinedRate, 0.03);
    // Rates are stored as decimals, so the sum is compared in basis points rather than binary floats.
    assert.equal(
      Math.round((STANDARD_SALES_COMMISSION_POLICY.representativeRate + STANDARD_SALES_COMMISSION_POLICY.managerOverrideRate) * 10_000),
      Math.round(STANDARD_SALES_COMMISSION_POLICY.maxCombinedRate * 10_000),
    );
  });

  test("launch-to-date direction covers all recorded sales without fabricating a start date", () => {
    assert.equal(STANDARD_SALES_COMMISSION_POLICY.effectiveDate, null);
    assert.equal(STANDARD_SALES_COMMISSION_POLICY.retroactiveToLaunch, true);
    assert.equal(standardSalesCommissionPolicyReady(), true);
    assert.equal(salesCommissionPolicyProblem(), null);
  });

  test("missing both a launch-wide decision and a dated plan fails closed", () => {
    const unapproved = {...STANDARD_SALES_COMMISSION_POLICY, retroactiveToLaunch:false};
    assert.equal(standardSalesCommissionPolicyReady(unapproved), false);
    assert.match(salesCommissionPolicyProblem(unapproved) ?? "", /effective date/i);
  });

  test("accepts the confirmed allocation once a valid effective date is explicitly provided", () => {
    const dated = { ...STANDARD_SALES_COMMISSION_POLICY, retroactiveToLaunch:false, effectiveDate: "2026-09-15" };
    assert.equal(salesCommissionPolicyProblem(dated), null);
    assert.equal(standardSalesCommissionPolicyReady(dated), true);
  });

  test("rejects a silently drifted pool", () => {
    const invalid = { ...STANDARD_SALES_COMMISSION_POLICY, maxCombinedRate: 0.02 };
    assert.match(salesCommissionPolicyProblem(invalid) ?? "", /allocation/i);
  });
});


import {commissionAdjustmentProblem,commissionPolicyForRepresentative} from "../lib/commission-rate-controls";
import type {HCMState} from "../lib/hcm-engine";

test("approved dated commission exceptions do not rewrite historical rates",()=>{
  const plan={id:"plan",userId:"rep-1",representativeRate:0.04,managerOverrideRate:0.01,
    effectiveDate:"2026-12-01",reason:"New signed compensation terms",approvalReference:"agreement-2026-12",
    approvedBy:"admin",createdAt:"2026-11-23T18:00:00Z"};
  assert.equal(commissionAdjustmentProblem(plan),null);
  assert.match(commissionAdjustmentProblem({...plan,approvalReference:""})??"",/approval/i);
  assert.match(commissionAdjustmentProblem({...plan,representativeRate:0.8,managerOverrideRate:0.4})??"",/total/i);
  const state={commissionRateAdjustments:[plan]} as HCMState;
  assert.equal(commissionPolicyForRepresentative(state,"rep-1","2026-11-30").representativeRate,0.025);
  assert.equal(commissionPolicyForRepresentative(state,"rep-1","2026-12-01").representativeRate,0.04);
  assert.equal(commissionPolicyForRepresentative(state,"rep-1","2026-12-01").managerOverrideRate,0.01);
  assert.equal(commissionPolicyForRepresentative(state,"other","2026-12-01").representativeRate,0.025);
});

test("prior HCM snapshots without commission overrides retain the standard default",()=>{
  const oldState={} as HCMState;
  assert.equal(commissionPolicyForRepresentative(oldState,"rep","2026-11-23").representativeRate,0.025);
});
