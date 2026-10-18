import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import test from "node:test";
import * as adminEvents from "../functions/src/admin-notification-events";
import * as mailPolicy from "../functions/src/resend-mail-policy";
import * as weeklyPolicy from "../functions/src/weekly-email-policy";

const policy=(mailPolicy as unknown as {default?:typeof mailPolicy}).default??mailPolicy;
const adminPolicy=(adminEvents as unknown as {default?:typeof adminEvents}).default??adminEvents;
const weekly=(weeklyPolicy as unknown as {default?:typeof weeklyPolicy}).default??weeklyPolicy;
const {validMailToSend,verifyResendWebhook,providerStatus,nextMailStatus,emailHash}=policy;
const base={
 id:"mail-event-100",kind:"order_approved",
 sourcePath:"domains/commercial/fields/orders",sourceRecordId:"order-100",
 eventId:"evt-100",templateVersion:1,
 approvedBy:"uid-admin",approvedAt:"2026-10-15T20:05:00Z",
 to:"buyer@example.com",subject:"Order approved",text:"This order is approved.",
 idempotencyKey:"momentum-approved-100",status:"Approved" as const,
 createdAt:"2026-10-15T20:05:00Z",
};
test("unapproved, invalid and pre-activation messages are never sent",()=>{
 assert.equal(validMailToSend(base,"2026-10-15T20:00:00Z"),null);
 assert.ok(validMailToSend(base,"2026-10-15T20:10:00Z"));
 assert.ok(validMailToSend({...base,status:"Review required"},"2026-10-15T20:00:00Z"));
 assert.ok(validMailToSend({...base,to:"bad\r\nBcc:other@example.com"},"2026-10-15T20:00:00Z"));
 assert.ok(validMailToSend({...base,subject:"bad\nBcc: other@example.com"},"2026-10-15T20:00:00Z"));
 assert.ok(validMailToSend({...base,approvedBy:""},"2026-10-15T20:00:00Z"));
});
test("Resend webhook signatures use raw payload, freshness and constant time digest",()=>{
 const key=Buffer.from("0123456789abcdef0123456789abcdef");
 const secret="whsec_"+key.toString("base64");
 const now=Date.parse("2026-10-15T20:05:00Z");
 const timestamp=String(Math.floor(now/1000));
 const id="msg_test_01";
 const raw=JSON.stringify({type:"email.delivered",data:{email_id:"provider-123"}});
 const digest=createHmac("sha256",key).update(`${id}.${timestamp}.${raw}`).digest("base64");
 assert.equal(verifyResendWebhook(raw,id,timestamp,`v1,${digest}`,secret,now),true);
 assert.equal(verifyResendWebhook(raw+" ",id,timestamp,`v1,${digest}`,secret,now),false);
 assert.equal(verifyResendWebhook(raw,id,timestamp,`v1,${digest}`,secret,now+10*60_000),false);
 assert.equal(verifyResendWebhook(raw,id,timestamp,`v1,${digest}`,"wrong-secret",now),false);
});
test("provider delivery status is not confused with accepted email",()=>{
 assert.equal(providerStatus("email.delivered"),"Delivered");
 assert.equal(providerStatus("email.bounced"),"Bounced");
 assert.equal(providerStatus("email.complained"),"Complained");
 assert.equal(nextMailStatus("Provider accepted","email.sent"),null);
 assert.equal(nextMailStatus("Provider accepted","email.delivered"),"Delivered");
 assert.equal(nextMailStatus("Delivered","email.bounced"),null);
 assert.equal(emailHash(" PERSON@EXAMPLE.COM "),emailHash("person@example.com"));
});


test("Resend bounce projects a read-only admin in-app event",()=>{
  const projected=adminPolicy.resendAdminNotification({
    eventId:"evt-bounce-1",
    status:"Bounced",
    createdAt:"2026-10-18T01:00:00.000Z",
    mail:{
      id:"outbox-1",
      kind:"order_confirmed",
      to:"buyer@example.com",
      sourceRecordId:"order-1",
    },
  });
  assert.equal(projected?.policyId,"system.email_bounced");
  assert.equal(projected?.title,"Customer email bounced");
  assert.equal(projected?.status,"Open");
});

test("Resend delivery success never creates an admin alert",()=>{
  assert.equal(adminPolicy.resendAdminNotification({
    eventId:"evt-delivered-1",
    status:"Delivered",
    createdAt:"2026-10-18T01:00:00.000Z",
    mail:{
      id:"outbox-2",
      kind:"order_confirmed",
      to:"buyer@example.com",
      sourceRecordId:"order-2",
    },
  }),null);
});


test("Sunday weekly reminder uses Arizona week and stable idempotency",()=>{
  const today=weekly.arizonaDateKey(new Date("2026-10-19T02:00:00.000Z"));
  assert.equal(today,"2026-10-18");
  const weekStart=weekly.mondayForDateKey(today);
  assert.equal(weekStart,"2026-10-12");
  const recipient={
    uid:"usr-rep",
    email:"REP@EXAMPLE.COM",
    name:"Jordan Demo",
    role:"Sales Representative" as const,
  };
  const one=weekly.weeklyReminderMail(
    recipient,weekStart,"2026-10-19T02:00:00.000Z",
  );
  const two=weekly.weeklyReminderMail(
    recipient,weekStart,"2026-10-19T02:01:00.000Z",
  );
  assert.equal(one.id,two.id);
  assert.equal(one.idempotencyKey,two.idempotencyKey);
  assert.equal(one.to,"rep@example.com");
  assert.match(one.subject,/due tomorrow/i);
});

test("Sunday weekly reminder skips an already submitted weekly report",()=>{
  const reports={items:[{
    id:"report-1",
    type:"Weekly progress",
    userId:"usr-rep",
    weekStart:"2026-10-12",
    status:"Submitted",
  }]};
  assert.equal(
    weekly.weeklyReportSubmitted(reports,"usr-rep","2026-10-12"),
    true,
  );
  assert.equal(
    weekly.weeklyReportSubmitted(reports,"usr-rep","2026-10-05"),
    false,
  );
});
