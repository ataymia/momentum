import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import test from "node:test";
import policy from "../functions/src/resend-mail-policy";

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
