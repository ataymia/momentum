import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import type {
 CheckoutIntent,PaymentProviderPort,VerifiedProcessorEvent,ProcessorSettlement,
} from "../functions/src/payment-provider-port";
type Port=typeof import("../functions/src/payment-provider-port");
const {validateCheckoutIntent,assertProviderCapabilities,checkHostedCheckout,
 settlementMatchesInvoice,ProviderNotReadyError}=createRequire(import.meta.url)(
 "../functions/src/payment-provider-port.ts") as Port;
const intent:CheckoutIntent={
 requestId:"paymentRequest123456",customerUid:"customer1",accountId:"account1",
 invoiceId:"invoice1",amountCents:2400,currency:"USD",rail:"ACH",
 cadence:"once",earliestChargeDate:"2026-12-01",
};
test("payment port rejects raw card/bank details and unsupported schedules",()=>{
 assert.deepEqual(validateCheckoutIntent(intent),intent);
 for(const extra of [{cardNumber:"4111111111111111"},{routingNumber:"012345678"},
  {cvv:"123"},{bankAccount:"123"},{paid:true}])
  assert.throws(()=>validateCheckoutIntent({...intent,...extra}),/cannot include/);
 assert.throws(()=>validateCheckoutIntent({...intent,amountCents:1.2}));
 assert.throws(()=>validateCheckoutIntent({...intent,cadence:"monthly"}),/consent/);
 assert.throws(()=>assertProviderCapabilities(undefined,intent),ProviderNotReadyError);
});
test("provider adapter only returns HTTPS hosted sessions and known capabilities",()=>{
 const fake={name:"helcim",rails:["ACH","Card"],cadences:["once","monthly"],
  createHostedCheckout:async()=>({provider:"helcim",providerSessionId:"x",
   checkoutUrl:"https://secure.example.test/checkout/x",expiresAt:"2026-12-03T00:00:00Z",
   status:"Awaiting customer authorization"})} as unknown as PaymentProviderPort;
 assert.equal(assertProviderCapabilities(fake,intent).name,"helcim");
 assert.throws(()=>assertProviderCapabilities(fake,{...intent,cadence:"quarterly"}));
 const approved={provider:"helcim" as const,providerSessionId:"sessionId",
  checkoutUrl:"https://secure.example.test/checkout",
  expiresAt:"2026-12-03T00:00:00Z",
  status:"Awaiting customer authorization" as const};
 assert.equal(checkHostedCheckout(approved,"helcim"),approved);
 assert.throws(()=>checkHostedCheckout({...approved,checkoutUrl:"javascript:alert(1)"},"helcim"));
});
test("signed webhook is insufficient without final reconciled settlement",()=>{
 const event:VerifiedProcessorEvent={
  provider:"helcim",providerEventId:"evt-1",providerSessionId:"session-1",
  providerTransactionId:"tx-1",eventType:"settled",
  verifiedSignature:true,receivedAt:"2026-11-16T00:00:00Z",
 };
 const settlement:ProcessorSettlement={
  providerTransactionId:"tx-1",status:"settled",amountCents:2400,
  currency:"USD",accountReference:"account1",invoiceReference:"invoice1",
 };
 const expected={invoiceId:"invoice1",accountId:"account1",
  amountCents:2400,currency:"USD" as const};
 assert.equal(settlementMatchesInvoice(event,settlement,expected),true);
 for(const bad of [{...event,eventType:"captured" as const},
  {...event,providerTransactionId:"different"}])
  assert.equal(settlementMatchesInvoice(bad,settlement,expected),false);
 assert.equal(settlementMatchesInvoice(event,{...settlement,status:"pending"},expected),false);
 assert.equal(settlementMatchesInvoice(event,{...settlement,amountCents:2399},expected),false);
 assert.equal(settlementMatchesInvoice(event,{...settlement,invoiceReference:"different"},expected),false);
});
