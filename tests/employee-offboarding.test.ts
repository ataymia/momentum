import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {metaVersionKey} from "../lib/firestore-domains";
import * as separationProjection from "../functions/src/separation-projection";
const {releaseSeparatedAppointments}=(separationProjection as unknown as {default?:typeof separationProjection}).default??separationProjection;
import {visibleActiveEmployees} from "../lib/employee-directory-visibility";
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

test("offboarding stamps the exact live commercial sync version key",()=>{
  const source=readFileSync("functions/src/employee-separation.ts","utf8");
  const commercialKey=metaVersionKey("domains/commercial/fields/_root");
  const territoryKey=metaVersionKey("domains/commercial/fields/territories");
  assert.equal(commercialKey,"domains_commercial_fields_root");
  assert.match(source,new RegExp(`paths\\.push\\("${commercialKey}"\\)`));
  assert.match(source,new RegExp(`paths\\.push\\("${territoryKey}"\\)`));
  assert.ok(!source.includes("domains_commercial_fields__root"));
});

test("separation immediately unassigns active and follow-up appointments without deleting history",()=>{
 const appointments=[
  {id:"scheduled",ownerId:"megan",status:"Scheduled",assignedAt:"2026-10-01T00:00:00Z"},
  {id:"moving",ownerId:"megan",status:"En route"},
  {id:"follow",ownerId:"megan",status:"Needs follow-up"},
  {id:"complete",ownerId:"megan",status:"Completed",completedAt:"2026-10-02T00:00:00Z"},
  {id:"other",ownerId:"matt",status:"Scheduled"},
 ];
 const result=releaseSeparatedAppointments(appointments,"megan","2026-10-15T12:00:00Z");
 assert.deepEqual(result.releasedIds,["scheduled","moving","follow"]);
 assert.equal(result.items[0].ownerId,"");
 assert.equal(result.items[1].ownerId,"");
 assert.equal(result.items[2].separationReviewRequired,true);
 assert.equal(result.items[3].ownerId,"megan");
 assert.equal(result.items[3].completedAt,"2026-10-02T00:00:00Z");
 assert.deepEqual(result.items[4],appointments[4]);
 const retry=releaseSeparatedAppointments(result.items,"megan","2026-10-15T12:00:10Z");
 assert.deepEqual(retry.releasedIds,[]);
 assert.deepEqual(retry.items,result.items);
 assert.deepEqual(appointments[0],{id:"scheduled",ownerId:"megan",status:"Scheduled",assignedAt:"2026-10-01T00:00:00Z"});
});
test("separation reconciles both appointment shards and does not stop at an earlier separation audit",()=>{
 const source=readFileSync("functions/src/employee-separation.ts","utf8");
 for(const path of ["domains/workspace/fields/appointments","domains/commercial/fields/appointments"]){
  assert.ok(source.includes(path));
  assert.ok(source.includes(metaVersionKey(path)));
 }
 assert.match(source,/releaseSeparatedAppointments/);
 assert.match(source,/alreadySeparated/);
 assert.doesNotMatch(source,/if \(audit\.exists && targetData\?\.accountState==="Separated"\) \{/);
 assert.match(source,/tx\.update\(targetRef/);
});
test("former employees are absent in active roster but historical identity records remain",()=>{
 const users=[
  {id:"matt",role:"Sales Representative",employmentStatus:"Active",name:"Matt"},
  {id:"megan",role:"Marketing",employmentStatus:"Separated",name:"Megan"},
 ] as unknown as WorkspaceData["users"];
 assert.deepEqual(visibleActiveEmployees(users).map(u=>u.id),["matt"]);
 assert.equal(users.length,2);
});
