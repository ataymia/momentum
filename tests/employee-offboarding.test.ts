import assert from "node:assert/strict";
import test from "node:test";
import {
  effectiveAccountOwner,
  planAccountRelease,
  unassignedAccountQueue,
} from "../lib/offboarding-policy";
import type {Account,WorkspaceData} from "../lib/types";

const base={
  id:"acc-1",name:"A store",ownerId:"megan",stage:"Placed",
  originatorId:"megan",closerId:"megan",lifetimeCases:42,
  createdByUid:"megan",accountManagerId:"megan",
} as unknown as Account;
const other={
  ...base,id:"acc-2",name:"B store",ownerId:"someone-else",
  originatorId:"megan",closerId:"megan",
} as Account;

test("employee separation releases only current responsibility",()=>{
  const patches={
    "acc-1":{pricingTier:"A",notes:"Keep important history"},
    "acc-2":{ownerId:"someone-else",accountManagerId:"someone-else"},
  };
  const result=planAccountRelease(
    [base,other],patches,"megan","2026-10-14T10:00:00.000Z",
  );
  assert.deepEqual(result.accountIds,["acc-1"]);
  assert.equal(result.unchangedAccounts,1);
  assert.equal(result.patches["acc-1"].ownerId,"");
  assert.equal(result.patches["acc-1"].accountManagerId,"");
  assert.equal(result.patches["acc-1"].pricingTier,"A");
  assert.equal(result.patches["acc-1"].notes,"Keep important history");
  assert.equal(result.patches["acc-1"].originatorId,undefined);
  assert.equal(result.patches["acc-2"].ownerId,"someone-else");
  assert.equal(base.originatorId,"megan");
  assert.equal(base.closerId,"megan");
  assert.equal(base.lifetimeCases,42);
});

test("previously transferred account is not released from prior originator",()=>{
  const patches={"acc-1":{ownerId:"someone-else"}};
  assert.equal(effectiveAccountOwner(base,patches),"someone-else");
  const result=planAccountRelease(
    [base],patches,"megan","2026-10-14T10:00:00.000Z",
  );
  assert.deepEqual(result.accountIds,[]);
});

test("release is idempotent for already-unassigned overlays",()=>{
  const prior={"acc-1":{ownerId:""}};
  const output=planAccountRelease(
    [base],prior,"megan","2026-10-14T10:00:00.000Z",
  );
  assert.equal(output.accountIds.length,0);
  assert.deepEqual(output.patches,prior);
});

test("unassigned queue includes prospects and established accounts",()=>{
  const rows=unassignedAccountQueue([
    {...base,ownerId:"",stage:"Prospect"},
    {...other,ownerId:"",stage:"Reordered"},
    base,
  ] as WorkspaceData["accounts"]);
  assert.deepEqual(rows.map((row)=>row.claimMode),[
    "Self-claim prospect","Manager assignment",
  ]);
  assert.deepEqual(rows.map((row)=>row.accountId),["acc-1","acc-2"]);
});
