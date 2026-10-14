import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateStandardSalesCommission,
  eligibleCommissionManager,
  type CommissionAllocationInput,
} from "../lib/sales-commission-allocation";
import type { SalesCommissionPolicy } from "../lib/sales-commission-policy";

const policy: SalesCommissionPolicy = {
  basis: "Qualifying Net Collected Sales",
  representativeRate: 0.025,
  managerOverrideRate: 0.005,
  maxCombinedRate: 0.03,
  effectiveDate: "2026-10-09",
};
const input: CommissionAllocationInput = {
  qualifyingNetCollectedCents: 1_000_000,
  earningDate: "2026-10-09",
  creditedRepresentativeId: "rep-123",
  basisReconciled: true,
};

test("no manager means the 0.5% share is retained, not payable to the acting owners", () => {
  const result = allocateStandardSalesCommission(input, policy);
  assert.equal(result.status, "Calculated");
  if (result.status !== "Calculated") return;
  assert.equal(result.representativeCents, 25000);
  assert.equal(result.managerCents, 0);
  assert.equal(result.managerRecipientId, undefined);
  assert.equal(result.retainedByCompanyCents, 5000);
  assert.equal(result.combinedCommissionExpenseCents, 25000);
});

test("official designated Sales Manager earns the 0.5% override", () => {
  const result = allocateStandardSalesCommission({
    ...input,
    designatedManagerId: "manager-7",
    designatedManager: {
      id: "manager-7",
      role: "Sales Manager",
      title: "Arizona Market Sales Manager",
    },
  }, policy);
  assert.equal(result.status, "Calculated");
  if (result.status !== "Calculated") return;
  assert.equal(result.managerRecipientId, "manager-7");
  assert.equal(result.managerCents, 5000);
  assert.equal(result.retainedByCompanyCents, 0);
  assert.equal(result.combinedCommissionExpenseCents, 30000);
});

test("Administrator acting as manager does not earn manager commission", () => {
  const candidate: CommissionAllocationInput = {
    ...input,
    designatedManagerId: "admin",
    designatedManager: {id: "admin", role: "Administrator", title: "Sales Manager"},
  };
  assert.equal(eligibleCommissionManager(candidate), undefined);
  const result = allocateStandardSalesCommission(candidate, policy);
  assert.equal(result.status, "Calculated");
  if (result.status === "Calculated") assert.equal(result.managerCents, 0);
});

test("official manager title without the Sales Manager role does not qualify", () => {
  const result = allocateStandardSalesCommission({
    ...input,
    designatedManagerId: "rep-2",
    designatedManager: {id: "rep-2", role: "Sales Representative", title: "Sales Manager"},
  }, policy);
  assert.equal(result.status, "Calculated");
  if (result.status === "Calculated") assert.equal(result.retainedByCompanyCents, 5000);
});

test("manager role without explicit designation or title does not qualify", () => {
  const result = allocateStandardSalesCommission({
    ...input,
    designatedManager: {id: "mgr", role: "Sales Manager", title: "Account Executive"},
  }, policy);
  assert.equal(result.status, "Calculated");
  if (result.status === "Calculated") assert.equal(result.managerCents, 0);
});

test("launch-to-date approval covers backlogged verified collection without guessing launch date", () => {
  const result = allocateStandardSalesCommission({...input,earningDate:"2026-09-20"});
  assert.equal(result.status, "Calculated");
  if(result.status==="Calculated"){
    assert.equal(result.representativeCents,25000);
    assert.equal(result.retainedByCompanyCents,5000);
  }
});

test("missing both launch-wide authorization and a written date still fails closed", () => {
  const result=allocateStandardSalesCommission(input,{...policy,effectiveDate:null,retroactiveToLaunch:false});
  assert.equal(result.status,"Blocked");
});

test("earnings before effective date are never repriced", () => {
  const result = allocateStandardSalesCommission({...input, earningDate: "2026-10-08"}, policy);
  assert.equal(result.status, "Blocked");
});

test("non-reconciled sales and invalid cents fail closed", () => {
  assert.equal(allocateStandardSalesCommission({...input, basisReconciled: false}, policy).status, "Blocked");
  assert.equal(allocateStandardSalesCommission({...input, qualifyingNetCollectedCents: 100.2}, policy).status, "Blocked");
  assert.equal(allocateStandardSalesCommission({...input, qualifyingNetCollectedCents: -100}, policy).status, "Blocked");
});
