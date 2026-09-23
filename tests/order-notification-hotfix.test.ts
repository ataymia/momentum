import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NOTIFICATION_DELIVERY_RETENTION_LIMIT, normalizeNotificationState } from "../lib/notification-engine";
import type { WorkspaceUser } from "../lib/types";

const user={id:"usr-admin",name:"Admin",firstName:"Admin",email:"admin@example.com",role:"Administrator",team:"Operations",title:"Administrator",initials:"AD",accent:"#000",accountState:"Active"} as unknown as WorkspaceUser;

test("notification persistence is capped well below Firestore's one-document limit",()=>{
  const deliveries=Array.from({length:1600},(_,index)=>({id:`n-${index}`,sourceEventId:`e-${index}`,recipientUserId:user.id,channel:"In app" as const,title:`Action ${index}`,detail:"Needs attention. ".repeat(20),tone:"warning" as const,createdAt:new Date(Date.now()-index*1000).toISOString(),status:index<20?"Unread" as const:"Read" as const,...(index<20?{}:{readAt:new Date().toISOString()})}));
  const normalized=normalizeNotificationState({version:1,escalationHours:24,preferences:[{userId:user.id,inApp:true,email:false,sms:false,emailAddress:user.email}],deliveries},[user]);
  assert.equal(normalized.deliveries.length,NOTIFICATION_DELIVERY_RETENTION_LIMIT);
  assert.ok(Buffer.byteLength(JSON.stringify(normalized),"utf8")<900_000);
  assert.equal(normalized.deliveries.filter((item)=>item.status==="Unread").length,20);
});

test("persistence isolates a broken auxiliary document instead of failing the whole business-record batch",()=>{
  const source=readFileSync(new URL("../lib/persistence.ts",import.meta.url),"utf8");
  assert.match(source,/await this\.isolateFailedWrites\(writes,pathKey,nextDocs\)/);
  assert.match(source,/Other records were preserved and synced/);
});

test("sidebar remains naturally scrollable without a visible scrollbar",()=>{
  const css=readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");
  assert.match(css,/\.sidebar__nav \{[\s\S]*overflow-y:auto;[\s\S]*scrollbar-width:none;/);
  assert.match(css,/\.sidebar__nav::\-webkit-scrollbar/);
});
