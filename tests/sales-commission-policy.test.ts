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
