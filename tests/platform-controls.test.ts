import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collectAuditableRecords, diffAuditableRecords, visibleAuditEvents, type AuditEvent } from "../lib/audit-engine";
import { createDemoData } from "../lib/demo-data";
import { findAccountDuplicate } from "../lib/duplicate-engine";
import { resolveNotificationRecipients } from "../lib/notification-engine";
import { isDateLocked, isRangeLocked, type PeriodLockState } from "../lib/period-lock-engine";
import type { Account, WorkspaceData } from "../lib/types";

test("period locks block dates and overlapping ranges only while active", () => { const state: PeriodLockState = { version: 1, locks: [{ id:"lock-1",domain:"Payroll",startDate:"2026-08-01",endDate:"2026-08-31",reason:"Month close",lockedAt:"2026-09-01T00:00:00Z",lockedBy:"admin" }] }; assert.equal(isDateLocked(state,"Payroll","2026-08-15"),true); assert.equal(isDateLocked(state,"Payroll","2026-09-01"),false); assert.equal(isRangeLocked(state,"Payroll","2026-07-25","2026-08-02"),true); assert.equal(isRangeLocked(state,"Accounting","2026-08-01","2026-08-31"),false); state.locks[0].releasedAt="2026-09-02T00:00:00Z"; assert.equal(isDateLocked(state,"Payroll","2026-08-15"),false); });

test("duplicate blocker catches exact normalized street address", () => { const existing = [{ id:"acc-1",name:"Corner Market",location:"Phoenix, AZ",streetAddress:"123 W. Main Street, Ste 100",phone:"602-555-0100",email:"buyer@example.com" }] as Account[]; const duplicate = findAccountDuplicate(existing,{ name:"Different label",location:"Phoenix, AZ",streetAddress:"123 West Main St Suite 100",phone:"",email:"" }); assert.ok(duplicate); assert.equal(duplicate?.account.id,"acc-1"); assert.equal(duplicate?.confidence,"Exact"); });

test("duplicate blocker allows the same brand in the same city at a different address", () => { const existing = [{ id:"acc-1",name:"Circle K",location:"Phoenix, AZ",streetAddress:"123 W Main St",phone:"602-555-0100",email:"first@example.com" }] as Account[]; const duplicate = findAccountDuplicate(existing,{ name:"Circle K",location:"Phoenix, AZ",streetAddress:"999 E Camelback Rd",phone:"",email:"" }); assert.equal(duplicate,null); });

test("audit diff records actor record and changed fields", () => { const before = collectAuditableRecords("Workspace",{orders:[{id:"ord-1",number:"GE-1001",accountId:"acc-1",status:"Approved",cases:10}]}); const after = collectAuditableRecords("Workspace",{orders:[{id:"ord-1",number:"GE-1001",accountId:"acc-1",status:"Delivered",cases:10}]}); const events = diffAuditableRecords(before,after,{id:"usr-admin",role:"Administrator"},"2026-08-28T12:00:00Z"); assert.equal(events.length,1); assert.equal(events[0].entityType,"Workspace.orders"); assert.equal(events[0].relatedAccountId,"acc-1"); assert.equal(events[0].actorId,"usr-admin"); assert.ok(events[0].changes.some((change)=>change.field==="status"&&change.before==="Approved"&&change.after==="Delivered")); });

test("manager audit history excludes unlinked company records and admin-sensitive records", () => { const data=createDemoData(); const manager=data.users.find((user)=>user.id==="usr-avery")!; const managedAccount=data.accounts.find((account)=>account.ownerId==="usr-jordan")!; const events:AuditEvent[]=[{id:"linked",at:"2026-08-28T12:00:00Z",actorId:"usr-jordan",actorRole:"Sales Representative",action:"Updated",module:"Workspace",collection:"accounts",entityType:"Workspace.accounts",entityId:managedAccount.id,label:managedAccount.name,summary:"updated",sensitivity:"operational",relatedAccountId:managedAccount.id,changes:[]},{id:"generic",at:"2026-08-28T12:01:00Z",actorId:"usr-admin",actorRole:"Administrator",action:"Updated",module:"Marketing",collection:"campaigns",entityType:"Marketing.campaigns",entityId:"campaign-1",label:"Campaign",summary:"updated",sensitivity:"operational",changes:[]},{id:"admin",at:"2026-08-28T12:02:00Z",actorId:"usr-admin",actorRole:"Administrator",action:"Updated",module:"Payroll",collection:"runs",entityType:"Payroll.runs",entityId:"run-1",label:"Payroll",summary:"updated",sensitivity:"admin",relatedUserId:"usr-jordan",changes:[]}]; const visible=visibleAuditEvents(manager,data,events).map((event)=>event.id); assert.deepEqual(visible,["linked"]); });

test("notification routing reaches responsible sales chain for account changes", () => { const data = { users:[{id:"usr-admin",name:"Admin",firstName:"Admin",email:"admin@example.com",initials:"AD",title:"Admin",role:"Administrator",team:"Leadership",accent:"#000"},{id:"usr-manager",name:"Manager",firstName:"Manager",email:"manager@example.com",initials:"MA",title:"Manager",role:"Sales Manager",team:"Sales",accent:"#000"},{id:"usr-rep",name:"Rep",firstName:"Rep",email:"rep@example.com",initials:"RE",title:"Rep",role:"Sales Representative",team:"Sales",managerId:"usr-manager",accent:"#000"}], accounts:[{id:"acc-1",name:"Market",location:"Phoenix, AZ",channel:"Independent retail",stage:"Prospect",ownerId:"usr-rep",accountManagerId:"usr-manager",contactName:"",contactRole:"",phone:"",email:"",lastActivity:"",nextAction:"",nextActionDate:"2026-08-28",health:"New",lifetimeCases:0,reorderCount:0,notes:""}], activities:[],appointments:[],orders:[],placements:[],inventory:[],approvals:[],timeEntries:[],timecards:[],notifications:[],bulletins:[] } as unknown as WorkspaceData; const event = { id:"audit-1",at:"2026-08-28T12:00:00Z",actorId:"usr-admin",actorRole:"Administrator",action:"Updated",module:"Workspace",collection:"accounts",entityType:"Workspace.accounts",entityId:"acc-1",label:"Market",summary:"Market updated",sensitivity:"operational",relatedAccountId:"acc-1",changes:[] } as AuditEvent; const recipients = resolveNotificationRecipients(event,data); assert.ok(recipients.includes("usr-rep")); assert.ok(recipients.includes("usr-manager")); });

test("workspace notifications are not recursively audited", () => { const records = collectAuditableRecords("Workspace",{notifications:[{id:"note-1",title:"Hello"}],orders:[{id:"ord-1",number:"GE-1"}]}); assert.equal([...records.keys()].some((key)=>key.includes("notifications")),false); assert.equal([...records.keys()].some((key)=>key.includes("orders")),true); });

test("Administration reset clears field tracking, enhanced commercial stores, current engine stores, and transient workflow intents", () => {
  const source = readFileSync(new URL("../components/pages/settings-v3.tsx", import.meta.url), "utf8");
  assert.match(source, /FIELD_TRACKING_STORAGE_KEY/);
  assert.match(source, /CRM_STORAGE_KEY/);
  assert.match(source, /HCM_STORAGE_KEY/);
  assert.match(source, /PERFORMANCE_STORAGE_KEY/);
  assert.match(source, /COMMERCE_STORAGE_KEY/);
  assert.match(source, /INVENTORY_LEDGER_STORAGE_KEY/);
  assert.match(source, /FINANCE_STORAGE_KEY/);
  assert.match(source, /ACCOUNTING_STORAGE_KEY/);
  assert.match(source, /MARKETING_STORAGE_KEY/);
  assert.match(source, /PAYROLL_STORAGE_KEY/);
  assert.doesNotMatch(source, /momentum-marketing-v1/);
  assert.match(source, /momentum-commercial-controls-v1/);
  assert.match(source, /momentum-warehouse-session-v1/);
  assert.match(source, /const resetSessionKeys =/);
  assert.match(source, /momentum-order-source-placement/);
  assert.match(source, /window\.sessionStorage\.removeItem/);
});

test("Administration data health uses Arizona business dates", () => {
  const source = readFileSync(new URL("../components/pages/settings-v3.tsx", import.meta.url), "utf8");
  assert.match(source, /const today=arizonaDateKey\(\)/);
  assert.doesNotMatch(source, /const today=new Date\(\)\.toISOString\(\)\.slice\(0,10\)/);
});
