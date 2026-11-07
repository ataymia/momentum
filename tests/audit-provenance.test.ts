import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {
  auditEventFingerprint,
  collectAuditableRecords,
  diffAuditableRecords,
  mergeAuditSnapshots,
  normalizeAuditState,
  recoverableUnverifiedAuditEvents,
  visibleAuditEvents,
  type AuditEvent,
} from "../lib/audit-engine";
import type { WorkspaceUser } from "../lib/types";

const rep: WorkspaceUser = {
  id: "rep-1",
  name: "Matt Rep",
  firstName: "Matt",
  email: "matt@example.test",
  initials: "MR",
  title: "Sales Representative",
  role: "Sales Representative",
  team: "Sales",
  accent: "#000",
};

const admin: WorkspaceUser = {
  id: "admin-1",
  name: "Mia Admin",
  firstName: "Mia",
  email: "mia@example.test",
  initials: "MA",
  title: "Administrator",
  role: "Administrator",
  team: "Leadership",
  accent: "#000",
};

test("passive account hydration cannot manufacture System right-now history", () => {
  const before = collectAuditableRecords("Workspace", {
    accounts: [{ id:"acc-1", name:"Nash", ownerId:"rep-1", stage:"Prospect", lastActivity:"Created" }],
  });
  const after = collectAuditableRecords("Workspace", {
    accounts: [{ id:"acc-1", name:"Nash", ownerId:"rep-1", stage:"Qualified", lastActivity:"Created" }],
  });
  const events = diffAuditableRecords(before, after, { id:"system", role:"System" }, "2026-10-06T23:10:00.000Z", [rep, admin]);
  assert.equal(events.length, 0);
});

test("workspace activity history uses the actual employee and source timestamp", () => {
  const before = collectAuditableRecords("Workspace", { activities: [] });
  const after = collectAuditableRecords("Workspace", {
    activities: [{
      id:"act-1",
      accountId:"acc-1",
      type:"note",
      title:"Account classification updated",
      detail:"Premise changed to Off-premise.",
      at:"2026-10-06T20:15:30.000Z",
      userId:"rep-1",
    }],
  });
  const [event] = diffAuditableRecords(before, after, { id:"system", role:"System" }, "2026-10-06T23:10:00.000Z", [rep, admin]);
  assert.ok(event);
  assert.equal(event.actorId, "rep-1");
  assert.equal(event.actorRole, "Sales Representative");
  assert.equal(event.at, "2026-10-06T20:15:30.000Z");
  assert.equal(event.relatedAccountId, "acc-1");
});

test("CRM visit history uses occurredAt instead of detection time", () => {
  const before = collectAuditableRecords("CRM", { interactions: [] });
  const after = collectAuditableRecords("CRM", {
    interactions: [{
      id:"visit-1",
      locationId:"acc-1",
      userId:"rep-1",
      type:"Visit",
      occurredAt:"2026-10-05T18:44:00.000Z",
      summary:"Visited business",
      physicalVisit:true,
    }],
  });
  const [event] = diffAuditableRecords(before, after, { id:"system", role:"System" }, "2026-10-06T23:10:00.000Z", [rep]);
  assert.ok(event);
  assert.equal(event.actorId, "rep-1");
  assert.equal(event.at, "2026-10-05T18:44:00.000Z");
});

test("approval history uses the actual decision actor and decision timestamp", () => {
  const before = collectAuditableRecords("Workspace", {
    approvals: [{ id:"apr-1", title:"Review order", requesterId:"rep-1", status:"Pending", submittedAt:"2026-10-06T19:00:00.000Z" }],
  });
  const after = collectAuditableRecords("Workspace", {
    approvals: [{ id:"apr-1", title:"Review order", requesterId:"rep-1", status:"Approved", submittedAt:"2026-10-06T19:00:00.000Z", decidedBy:"admin-1", decidedAt:"2026-10-06T20:00:00.000Z" }],
  });
  const [event] = diffAuditableRecords(before, after, { id:"system", role:"System" }, "2026-10-06T23:10:00.000Z", [rep, admin]);
  assert.ok(event);
  assert.equal(event.actorId, "admin-1");
  assert.equal(event.actorRole, "Administrator");
  assert.equal(event.at, "2026-10-06T20:00:00.000Z");
});

test("unverified system history is preserved for recovery but hidden from attributed activity", () => {
  const verified: AuditEvent = {
    id:"audit-good-1",
    at:"2026-10-06T20:00:00.000Z",
    actorId:"admin-1",
    actorRole:"Administrator",
    action:"Updated",
    module:"Workspace",
    collection:"approvals",
    entityType:"Workspace.approvals",
    entityId:"apr-1",
    label:"Review order",
    summary:"Review order updated",
    sensitivity:"manager",
    changes:[{field:"status",before:"Pending",after:"Approved"}],
  };
  const duplicate = { ...verified, id:"audit-good-2" };
  const legacy = {
    ...verified,
    id:"audit-legacy",
    at:"2026-10-06T23:10:00.000Z",
    actorId:"system",
    actorRole:"System",
  };
  const state = normalizeAuditState({ version:1, events:[legacy, verified, duplicate] });
  assert.equal(state.events.length, 2);
  assert.equal(recoverableUnverifiedAuditEvents(state).length, 1);
  assert.equal(recoverableUnverifiedAuditEvents(state)[0].id, "audit-legacy");
  assert.equal(recoverableUnverifiedAuditEvents(state)[0].summary,legacy.summary);
  assert.equal(recoverableUnverifiedAuditEvents(state)[0].at,legacy.at);
  const visible=visibleAuditEvents(admin,{users:[admin],accounts:[]} as never,state.events);
  assert.deepEqual(visible.map(event=>event.id),["audit-good-1"]);
  assert.equal(auditEventFingerprint(visible[0]), auditEventFingerprint(verified));
  assert.deepEqual(recoverableUnverifiedAuditEvents(normalizeAuditState(state)).map(e=>e.id),["audit-legacy"]);
});

test("normalized history sorts by the real event timestamp", () => {
  const base = {
    actorId:"admin-1",
    actorRole:"Administrator",
    action:"Updated" as const,
    module:"HCM",
    collection:"compensation",
    entityType:"HCM.compensation",
    label:"Compensation",
    summary:"Compensation updated",
    sensitivity:"admin" as const,
    changes:[],
  };
  const state = normalizeAuditState({
    version:1,
    events:[
      { ...base, id:"older", entityId:"a", at:"2026-10-01T12:00:00.000Z" },
      { ...base, id:"newer", entityId:"b", at:"2026-10-05T12:00:00.000Z" },
    ],
  });
  assert.deepEqual(state.events.map((event) => event.id), ["newer", "older"]);
});


test("delivery task updates use the driver event actor and event timestamp", () => {
  const before = collectAuditableRecords("Delivery", {
    tasks: [{
      id:"delivery-1",
      orderId:"ord-1",
      driverId:"driver-1",
      status:"Accepted",
      acceptedAt:"2026-10-06T18:00:00.000Z",
      acceptedBy:"driver-1",
      history:[{id:"evt-1",type:"Accepted",at:"2026-10-06T18:00:00.000Z",actorId:"driver-1"}],
    }],
  });
  const after = collectAuditableRecords("Delivery", {
    tasks: [{
      id:"delivery-1",
      orderId:"ord-1",
      driverId:"driver-1",
      status:"Loaded",
      acceptedAt:"2026-10-06T18:00:00.000Z",
      acceptedBy:"driver-1",
      loadedAt:"2026-10-06T18:12:00.000Z",
      history:[
        {id:"evt-2",type:"Loaded",at:"2026-10-06T18:12:00.000Z",actorId:"driver-1"},
        {id:"evt-1",type:"Accepted",at:"2026-10-06T18:00:00.000Z",actorId:"driver-1"},
      ],
    }],
  });
  const users: WorkspaceUser[] = [{...rep,id:"driver-1",name:"Driver One",firstName:"Driver",role:"Delivery Driver",team:"Operations",title:"Delivery Driver"}];
  const [event] = diffAuditableRecords(before, after, { id:"system", role:"System" }, "2026-10-06T23:10:00.000Z", users);
  assert.ok(event);
  assert.equal(event.actorId, "driver-1");
  assert.equal(event.at, "2026-10-06T18:12:00.000Z");
  assert.equal(event.relatedUserId, "driver-1");
});

test("Brand Ambassador assignment changes use updatedBy and updatedAt", () => {
  const before = collectAuditableRecords("Brand Ambassador", {
    assignments:[{
      id:"ba-1",eventGroupId:"group-1",ambassadorId:"ba-user",title:"Sampling",
      date:"2026-10-10",startTime:"10:00",endTime:"14:00",address:"Phoenix",
      requiredStaff:1,status:"Scheduled",createdBy:"admin-1",createdAt:"2026-10-01T12:00:00.000Z",
      updatedAt:"2026-10-01T12:00:00.000Z",updatedBy:"admin-1",
    }],
  });
  const after = collectAuditableRecords("Brand Ambassador", {
    assignments:[{
      id:"ba-1",eventGroupId:"group-1",ambassadorId:"ba-user",title:"Sampling",
      date:"2026-10-10",startTime:"11:00",endTime:"15:00",address:"Phoenix",
      requiredStaff:1,status:"Scheduled",createdBy:"admin-1",createdAt:"2026-10-01T12:00:00.000Z",
      updatedAt:"2026-10-06T21:05:00.000Z",updatedBy:"admin-1",
    }],
  });
  const [event] = diffAuditableRecords(before, after, { id:"system", role:"System" }, "2026-10-06T23:10:00.000Z", [admin]);
  assert.ok(event);
  assert.equal(event.actorId, "admin-1");
  assert.equal(event.at, "2026-10-06T21:05:00.000Z");
  assert.equal(event.relatedUserId, "ba-user");
});


test("explicit HCM audit records keep their human actor and original timestamp", () => {
  const before = collectAuditableRecords("HCM", { audit: [] });
  const after = collectAuditableRecords("HCM", {
    audit:[{
      id:"hcm-audit-1",
      at:"2026-10-06T19:45:00.000Z",
      actorId:"admin-1",
      action:"Administrator compensation correction",
      entityType:"CompensationRecord",
      entityId:"comp-1",
      before:"Hourly 18",
      after:"Hourly 20",
      reason:"Correct initial entry",
    }],
  });
  const [event] = diffAuditableRecords(before, after, { id:"system", role:"System" }, "2026-10-06T23:10:00.000Z", [admin]);
  assert.ok(event);
  assert.equal(event.actorId, "admin-1");
  assert.equal(event.at, "2026-10-06T19:45:00.000Z");
  assert.equal(event.label, "Administrator compensation correction");
});


test("account assignment dates never masquerade as creation dates", () => {
  const state = normalizeAuditState({
    version:1,
    events:[{
      id:"legacy-account-create",
      at:"2026-10-06T23:30:00.000Z",
      actorId:"rep-1",
      actorRole:"Sales Representative",
      action:"Created",
      module:"Workspace",
      collection:"accounts",
      entityType:"Workspace.accounts",
      entityId:"acc-1",
      label:"Nash",
      summary:"Nash created",
      sensitivity:"operational",
      changes:[
        {field:"ownerId",after:"rep-1"},
        {field:"responsibilityStartedAt",after:"2026-09-18T16:22:10.000Z"},
      ],
    }],
  });
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].at, "2026-10-06T23:30:00.000Z");
  assert.equal(state.events[0].provenanceStatus,"unverified-legacy");
  assert.equal(recoverableUnverifiedAuditEvents(state).length,1);
});

test("a reused unrelated audit snapshot does not generate spurious changes on field activity",()=>{
  const workspace=collectAuditableRecords("Workspace",{
    accounts:[{id:"acc-stable",name:"ABC Market",ownerId:"rep-1",stage:"Prospect"}],
  });
  const before=mergeAuditSnapshots(workspace,collectAuditableRecords("CRM",{interactions:[]}));
  const after=mergeAuditSnapshots(workspace,collectAuditableRecords("CRM",{interactions:[{
    id:"visit-latest",locationId:"acc-stable",userId:"rep-1",type:"Visit",
    occurredAt:"2026-10-09T20:00:00.000Z",summary:"Visit logged",physicalVisit:true,
  }]}));
  const events=diffAuditableRecords(before,after,{id:"system",role:"System"},"2026-10-09T20:05:00.000Z",[rep]);
  assert.equal(events.length,1);
  assert.equal(events[0].entityId,"visit-latest");
  assert.equal(events[0].actorId,"rep-1");
});

test("global audit collector memoizes domains and skips serialization for reused record references",()=>{
  const context=readFileSync("lib/audit-context.tsx","utf8");
  const engine=readFileSync("lib/audit-engine.ts","utf8");
  assert.match(context,/const workspaceRecords=useMemo\(\(\)=>collectAuditableRecords\("Workspace",data\),\[data\]\)/);
  assert.match(context,/const fieldRecords=useMemo\(\(\)=>collectAuditableRecords\("Field tracking",auditableFieldTracking\),\[auditableFieldTracking\]\)/);
  assert.match(engine,/before\.payload === after\.payload \|\| sameValue/);
});


test("changing sync timestamps and actor metadata alone does not create business audit entries",()=>{
  const before=collectAuditableRecords("Workspace",{accounts:[{
    id:"a1",name:"Example",stage:"Prospect",updatedAt:"2026-11-01T12:00:00.000Z",updatedBy:"system",
  }]});
  const after=collectAuditableRecords("Workspace",{accounts:[{
    id:"a1",name:"Example",stage:"Prospect",updatedAt:"2026-11-03T12:00:00.000Z",updatedBy:"system",
    syncedAt:"2026-11-03T12:00:01.000Z",
  }]});
  const events=diffAuditableRecords(before,after,{id:"system",role:"System"},"2026-11-03T12:02:00.000Z",[admin]);
  assert.deepEqual(events,[]);
});
test("verified changes to actual business fields remain auditable",()=>{
  const before=collectAuditableRecords("Workspace",{accounts:[{
    id:"a1",name:"Example",stage:"Prospect",updatedAt:"2026-11-01T12:00:00.000Z",updatedBy:"admin-1",
  }]});
  const after=collectAuditableRecords("Workspace",{accounts:[{
    id:"a1",name:"Example",stage:"Qualified",updatedAt:"2026-11-03T12:00:00.000Z",updatedBy:"admin-1",
  }]});
  const [event]=diffAuditableRecords(before,after,{id:"system",role:"System"},"2026-11-03T12:02:00.000Z",[admin]);
  assert.ok(event);
  assert.equal(event.actorId,"admin-1");
  assert.deepEqual(event.changes,[{field:"stage",before:"Prospect",after:"Qualified"}]);
});

test("reloaded CRM visits cannot credit the initial visitor with a later cache-only edit",()=>{
  const before=collectAuditableRecords("CRM",{interactions:[{id:"visit-1",userId:"rep-1",occurredAt:"2026-10-02T18:00:00Z",summary:"Original"}]});
  const after=collectAuditableRecords("CRM",{interactions:[{id:"visit-1",userId:"rep-1",occurredAt:"2026-10-02T18:00:00Z",summary:"Rehydrated text"}]});
  assert.deepEqual(diffAuditableRecords(before,after,{id:"system",role:"System"},"2026-11-06T18:00:00Z",[rep]),[]);
});

test("swapping actor metadata without changing source event time is not a new audit event",()=>{
  const before=collectAuditableRecords("Workspace",{accounts:[{id:"account-1",name:"Market",stage:"Prospect",updatedBy:"admin-1",updatedAt:"2026-10-01T12:00:00Z"}]});
  const after=collectAuditableRecords("Workspace",{accounts:[{id:"account-1",name:"Market",stage:"Qualified",updatedBy:"rep-1",updatedAt:"2026-10-01T12:00:00Z"}]});
  assert.deepEqual(diffAuditableRecords(before,after,{id:"system",role:"System"},"2026-11-06T18:00:00Z",[rep,admin]),[]);
});

test("passive account sync is not attributed to the viewer even when their identity is passed",()=>{
  const before=collectAuditableRecords("Workspace",{accounts:[{id:"account-1",name:"Market",stage:"Prospect"}]});
  const after=collectAuditableRecords("Workspace",{accounts:[{id:"account-1",name:"Market",stage:"Qualified"}]});
  assert.deepEqual(diffAuditableRecords(before,after,{id:"admin-1",role:"Administrator"},"2026-11-06T18:00:00Z",[admin]),[]);
});

test("same-millisecond audit writes with different changed fields remain independently recoverable",()=>{
  const original={
    id:"evt-1",at:"2026-10-06T20:00:00.000Z",actorId:"admin-1",actorRole:"Administrator",
    action:"Updated" as const,module:"Workspace",collection:"accounts",
    entityType:"Workspace.accounts",entityId:"acct-1",label:"Market",
    summary:"Account changed",sensitivity:"operational" as const,
    changes:[{field:"stage",before:"Prospect",after:"Qualified"}],
  };
  const next={...original,id:"evt-2",changes:[{field:"health",before:"New",after:"Strong"}]};
  const state=normalizeAuditState({version:1,events:[original,next]});
  assert.equal(state.events.length,2);
  assert.notEqual(auditEventFingerprint(original),auditEventFingerprint(next));
});
test("explicitly source-verified account records are never quarantined for truncated diffs",()=>{
  const original={
    id:"verified-acct",at:"2026-10-06T20:00:00.000Z",actorId:"admin-1",
    actorRole:"Administrator",action:"Created" as const,module:"Workspace",
    collection:"accounts",entityType:"Workspace.accounts",entityId:"acct-1",
    label:"Market",summary:"Account created",sensitivity:"operational" as const,
    changes:[{field:"name",after:"Market"}],provenanceStatus:"verified" as const,
  };
  const state=normalizeAuditState({version:1,events:[original]});
  assert.equal(state.events[0].provenanceStatus,"verified");
  assert.equal(recoverableUnverifiedAuditEvents(state).length,0);
});

test("G04/G07: cache eviction cannot falsely label the last account editor as deleter",()=>{
  const before=collectAuditableRecords("Workspace",{accounts:[{
    id:"account-vanish",name:"Market",stage:"Qualified",
    updatedBy:"admin-1",updatedAt:"2026-10-05T12:00:00Z",
  }]});
  const empty=collectAuditableRecords("Workspace",{accounts:[]});
  const events=diffAuditableRecords(before,empty,
    {id:"system",role:"System"},"2026-11-06T18:00:00Z",[admin]);
  assert.deepEqual(events,[]);
});

test("G08: recovered unverified record keeps its original timestamp, actor and text",()=>{
  const original={
    id:"legacy-snapshot",at:"2026-11-02T12:00:00Z",actorId:"system",
    actorRole:"System",action:"Updated" as const,module:"Workspace",
    collection:"accounts",entityType:"Workspace.accounts",entityId:"acct-legacy",
    label:"Market",summary:"Original imported note",sensitivity:"operational" as const,
    changes:[{field:"updatedAt",before:"2026-10-01T01:00:00Z",after:"2026-10-03T01:00:00Z"}],
  };
  const recovered=normalizeAuditState({version:1,events:[original]}).events[0];
  assert.equal(recovered.at,original.at);
  assert.equal(recovered.actorId,original.actorId);
  assert.equal(recovered.actorRole,original.actorRole);
  assert.equal(recovered.summary,original.summary);
  assert.equal(normalizeAuditState({version:1,events:[recovered]}).events[0].at,original.at);
});
