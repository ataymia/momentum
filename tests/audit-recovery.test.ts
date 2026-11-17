import assert from "node:assert/strict";
import test from "node:test";
import {auditRecoveryArchive} from "../lib/audit-recovery";
import {normalizeAuditState,visibleAuditEvents} from "../lib/audit-engine";
import type {WorkspaceUser,WorkspaceData} from "../lib/types";

const legacy={
  id:"legacy-1",at:"2026-10-15T18:00:00.000Z",actorId:"system",actorRole:"System",
  action:"Updated",module:"Workspace",collection:"accounts",
  entityType:"Workspace.accounts",entityId:"acct-1",label:"Market",
  summary:"Market updated",sensitivity:"operational",
  changes:[{field:"stage",before:"Prospect",after:"Qualified"}],
};
const trusted={...legacy,id:"trusted-1",actorId:"u-1",actorRole:"Administrator",
  provenanceStatus:"verified",summary:"Market correctly updated"};

test("G08: admin recovery archive retains original event identity and source changes",()=>{
  const state=normalizeAuditState({version:1,events:[legacy,trusted]});
  const serialized=JSON.stringify(auditRecoveryArchive(state,"2026-11-06T20:00:00Z"));
  const archive=JSON.parse(serialized);
  assert.equal(archive.unverifiedCount,1);
  assert.equal(archive.records[0].id,"legacy-1");
  assert.deepEqual(archive.records[0].changes,legacy.changes);
  assert.equal(state.events.length,2);
  assert.equal(state.events.find(e=>e.id==="legacy-1")?.actorId,"system");
  assert.deepEqual(visibleAuditEvents({id:"u-1",role:"Administrator"} as WorkspaceUser,{users:[],accounts:[]} as unknown as WorkspaceData,state.events).map(e=>e.id),["trusted-1"]);
});
test("G08: empty recovery archive does not invent historical observations",()=>{
  const archive=auditRecoveryArchive(normalizeAuditState({events:[]}),"2026-11-06T20:00:00Z");
  assert.equal(archive.unverifiedCount,0);
  assert.deepEqual(archive.records,[]);
});
