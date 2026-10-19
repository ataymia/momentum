import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import * as mailPolicy from "../functions/src/resend-mail-policy";
import {
  buildSignedInvoicePdf,
} from "../functions/src/signed-invoice-pdf";

const policy=(mailPolicy as unknown as {default?:typeof mailPolicy}).default??
  mailPolicy;

test("signed delivery invoice PDF contains invoice and signature evidence",()=>{
  const pdf=buildSignedInvoicePdf({
    invoiceNumber:"INV-1001",
    orderNumber:"GE-1001",
    customerName:"Demo Market",
    billingEmail:"billing@example.com",
    billToAddress:"100 Main St, Phoenix, AZ",
    shipToAddress:"100 Main St, Phoenix, AZ",
    deliveredAt:"2026-10-18T21:00:00.000Z",
    terms:"COD",
    total:240,
    lines:[{
      product:"Golden Eagle Energy Drink",
      cases:10,
      pricePerCase:24,
      amount:240,
    }],
    signature:{
      recipientName:"Store Receiver",
      signedAt:"2026-10-18T21:00:00.000Z",
      strokes:[[[100,100],[200,130],[300,90]]],
    },
  });
  assert.equal(pdf.subarray(0,8).toString("latin1"),"%PDF-1.4");
  const body=pdf.toString("latin1");
  assert.match(body,/INV-1001/);
  assert.match(body,/Store Receiver/);
  assert.match(body,/240\.00/);
});

test("Resend transport accepts a validated PDF invoice attachment",()=>{
  const pdf=buildSignedInvoicePdf({
    invoiceNumber:"INV-1002",
    orderNumber:"GE-1002",
    customerName:"Demo Store",
    billingEmail:"billing@example.com",
    deliveredAt:"2026-10-18T21:00:00.000Z",
    terms:"COD",
    total:24,
    lines:[{
      product:"Golden Eagle Energy Drink",
      cases:1,
      pricePerCase:24,
      amount:24,
    }],
  });
  const mail={
    id:"delivered-invoice-test",
    kind:"delivered_invoice",
    policyId:"delivery.delivered.customer",
    authorizationType:"Trusted system" as const,
    sourcePath:"domains/delivery/fields/tasks",
    sourceRecordId:"order-1002",
    eventId:"delivery-event-1002",
    templateVersion:1,
    approvedBy:"system:delivery-invoice",
    approvedAt:"2026-10-18T21:00:00.000Z",
    to:"billing@example.com",
    subject:"Momentum invoice INV-1002 — delivery confirmed",
    text:"Delivery confirmed. Your invoice is attached.",
    attachments:[{
      filename:"INV-1002.pdf",
      content:pdf.toString("base64"),
      contentType:"application/pdf",
    }],
    idempotencyKey:"delivery-invoice-1002",
    status:"Approved" as const,
    createdAt:"2026-10-18T21:00:00.000Z",
  };
  assert.equal(
    policy.validMailToSend(mail,"2026-10-18T20:59:00.000Z"),
    null,
  );
});

test("delivery invoice producer requires billing email and delivery proof",()=>{
  const source=readFileSync(
    "functions/src/delivery-invoice-email.ts",
    "utf8",
  );
  assert.match(source,/customer\?\.billingEmail/);
  assert.doesNotMatch(source,/accountsPayableEmail/);
  assert.match(source,/status\)!=="Delivered"/);
  assert.match(source,/signatureFrom\(task\.signature,task\.history\)/);
  assert.match(source,/adminDeliveryOverrides/);
  assert.match(source,/notificationOutbox/);
});


test("customer-facing invoice never exposes internal override terminology",()=>{
  const pdf=buildSignedInvoicePdf({
    invoiceNumber:"INV-1003",
    orderNumber:"GE-1003",
    customerName:"Demo Retailer",
    billingEmail:"billing@example.com",
    deliveredAt:"2026-10-18T22:00:00.000Z",
    terms:"COD",
    total:48,
    lines:[{
      product:"Golden Eagle Energy Drink",
      cases:2,
      pricePerCase:24,
      amount:48,
    }],
  }).toString("latin1");
  assert.doesNotMatch(pdf,/admin/i);
  assert.doesNotMatch(pdf,/override/i);
  assert.match(pdf,/Delivery confirmed/);

  const producer=readFileSync(
    "functions/src/delivery-invoice-email.ts",
    "utf8",
  );
  const customerCopy=producer.match(/text:\[[\s\S]*?\]\.join\("\\n"\)/)?.[0]??"";
  assert.doesNotMatch(customerCopy,/admin/i);
  assert.doesNotMatch(customerCopy,/override/i);
});

test("invoice sender resolves patched customer billing and retries recent signed deliveries",()=>{
  const source=readFileSync(
    "functions/src/delivery-invoice-email.ts","utf8",
  );
  assert.match(source,/domains\/commercial\/fields\/_root/);
  assert.match(source,/root\.customerPatches/);
  assert.match(source,/root\.accountPatches/);
  assert.match(source,/billingEmail=text\(customer\?\.billingEmail\)/);
  assert.doesNotMatch(source,/billingEmail.*accountsPayableEmail/);
  assert.match(source,/reconcileRecentSignedInvoices/);
  assert.match(source,/retrySignedInvoiceWhenInvoiceReady/);
  assert.match(source,/retrySignedInvoiceWhenCustomerUpdated/);
  assert.match(source,/retrySignedInvoiceWhenBillingPatchUpdated/);
  assert.match(source,/RESEND_ACTIVATION_CUTOFF/);
  assert.match(source,/7\*24\*60\*60\*1000/);
  assert.match(source,/status\)==="Delivered"/);
  assert.match(source,/event\.id/);
});

test("signed invoice can queue after signature arrives on already Delivered task",()=>{
 const source=readFileSync("functions/src/delivery-invoice-email.ts","utf8");
 assert.match(source,/previouslySigned/);
 assert.match(source,/signatureFrom\(previous\?\.signature,previous\?\.history\)/);
 assert.match(source,/if\(previouslySigned\)continue/);
 assert.match(source,/if\(!signature\)\{/);
 assert.doesNotMatch(source,/text\(previous\?\.status\)==="Delivered"\|\|/);
});
