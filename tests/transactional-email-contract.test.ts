import assert from "node:assert/strict";
import test from "node:test";
import {
  EMAIL_TEMPLATE_VERSION,
  EMAIL_TRANSPORT_ENABLED,
  prepareTransactionalEmail,
  type EmailEvent,
} from "../lib/transactional-email-contract";

const base={
  eventId:"verified-order-transition-101",
  sourceRecordId:"order-101",
  occurredAt:"2026-10-14T18:00:00.000Z",
  recipientEmail:" Buyer@Example.com ",
  recipientName:"Buyer",
  recipientAccountState:"Active" as const,
};

test("phase one has no outbound transport enabled",()=>{
  assert.equal(EMAIL_TRANSPORT_ENABLED,false);
  assert.equal(EMAIL_TEMPLATE_VERSION,1);
});

test("same event/recipient/version produces stable idempotency key",()=>{
  const a:EmailEvent={...base,kind:"order_approved",orderNumber:"MD-101"};
  const one=prepareTransactionalEmail(a);
  const replay=prepareTransactionalEmail({...a});
  assert.equal(one.ok,true);
  assert.deepEqual(one,replay);
  if(!one.ok)return;
  assert.equal(one.email.to,"buyer@example.com");
  assert.match(one.email.idempotencyKey,/^momentum-email-v1-[a-f0-9]{64}$/);
  assert.match(one.email.text,/Delivery and payment updates/);
  const different=prepareTransactionalEmail({...a,eventId:"next"});
  assert.notDeepEqual(one,different);
});

test("never confuse approved, delivered, invoiced, and paid events",()=>{
  const events:EmailEvent[]=[
    {...base,kind:"order_approved",orderNumber:"MD-101"},
    {...base,kind:"order_out_for_delivery",orderNumber:"MD-101"},
    {...base,kind:"order_delivered",orderNumber:"MD-101"},
    {...base,kind:"invoice_issued",invoiceNumber:"INV-101"},
    {...base,kind:"payment_received",receiptReference:"RCPT-101"},
  ];
  const drafts=events.map(prepareTransactionalEmail);
  assert.ok(drafts.every((result)=>result.ok));
  const subjects=drafts.map((result)=>result.ok?result.email.subject:"");
  assert.equal(new Set(subjects).size,5);
  for(const result of drafts)if(result.ok){
    assert.ok(!result.email.text.includes("card number"));
    assert.ok(!result.email.text.includes("has been paid in full"));
  }
});

test("expired or separated employee must never receive notifications",()=>{
  const event:EmailEvent={...base,kind:"employee_onboarding_ready"};
  for(const state of ["Separated","Suspended"] as const){
    assert.equal(prepareTransactionalEmail({
      ...event,recipientAccountState:state,
    }).ok,false);
  }
  assert.equal(prepareTransactionalEmail({
    ...event,recipientAccountState:"Onboarding",
  }).ok,true);
});

test("reject newline injection, fake source IDs and invalid timestamps",()=>{
  const e:EmailEvent={...base,kind:"invoice_issued",invoiceNumber:"INV-101"};
  for(const patch of [
    {eventId:"invalid\nheader"},{sourceRecordId:""},
    {recipientEmail:"a@example.com\nBcc:victim@example.com"},
    {occurredAt:"yesterday"},{invoiceNumber:"INV-101\nBCC:test"},
  ]){
    assert.equal(prepareTransactionalEmail({...e,...patch}).ok,false);
  }
});

test("pricing expiration notice is only a validated 30-day template, not a timer",()=>{
  const result=prepareTransactionalEmail({
    ...base,kind:"program_pricing_30_day_warning",
    accountName:"Example Retailer",expirationDate:"2026-11-13",
  });
  assert.equal(result.ok,true);
  if(result.ok){
    assert.match(result.email.subject,/30 days/);
    assert.match(result.email.text,/Renewal is not automatic/);
  }
  assert.equal(prepareTransactionalEmail({
    ...base,kind:"program_pricing_30_day_warning",
    accountName:"Example Retailer",expirationDate:"11/13",
  }).ok,false);
});

test("unsupported kinds cannot be sent via untyped payloads",()=>{
  const e=({...base,kind:"marketing_blast",contactList:"everybody"}) as unknown as EmailEvent;
  assert.equal(prepareTransactionalEmail(e).ok,false);
});

test("untyped malformed IDs and impossible expiration dates fail closed",()=>{
  const event={...base,kind:"invoice_issued",invoiceNumber:"INV-1"} as EmailEvent;
  for(const eventId of [null,12,{},[]]){
    assert.equal(prepareTransactionalEmail({...event,eventId} as unknown as EmailEvent).ok,false);
  }
  assert.equal(prepareTransactionalEmail({...base,kind:"program_pricing_30_day_warning",accountName:"Retailer",expirationDate:"2026-02-30"}).ok,false);
});
