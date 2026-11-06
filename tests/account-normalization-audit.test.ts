import assert from "node:assert/strict";
import test from "node:test";
import {createDemoData} from "../lib/demo-data";
import {normalizeWorkspaceData} from "../lib/workspace-normalization";
import {collectAuditableRecords,diffAuditableRecords} from "../lib/audit-engine";

test("G05: repeated CRM hydration never invents account creation timestamps",()=>{
  const original=createDemoData();
  const legacy={...original,accounts:original.accounts.map(account=>({
    ...account,createdAt:undefined,createdByUid:undefined,
  }))};
  const first=normalizeWorkspaceData(legacy,original);
  const second=normalizeWorkspaceData(first,original);
  for(const account of second.accounts){
    assert.equal(account.createdAt,undefined);
    assert.equal(account.createdByUid,undefined);
  }
  assert.deepEqual(
    diffAuditableRecords(
      collectAuditableRecords("Workspace",first),
      collectAuditableRecords("Workspace",second),
      {id:"system",role:"System"},
    ),
    [],
  );
});
test("G05: recorded account creation timestamp survives hydration unchanged",()=>{
  const original=createDemoData();
  const timestamp="2026-08-18T21:12:00.000Z";
  const enriched={...original,accounts:original.accounts.map((account,index)=>index===0?{
    ...account,createdAt:timestamp,createdByUid:"usr-mia",
  }:account)};
  const once=normalizeWorkspaceData(enriched,original);
  const twice=normalizeWorkspaceData(once,original);
  assert.equal(once.accounts[0].createdAt,timestamp);
  assert.equal(twice.accounts[0].createdAt,timestamp);
  assert.equal(twice.accounts[0].createdByUid,"usr-mia");
});
