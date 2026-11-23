import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {invoicePrintWarnings,invoicePrintConfirmationMessage} from "../lib/invoice-print-review";

const complete={
 invoice:{number:"INV-0001",issuedAt:"2026-11-21T12:00:00Z",status:"Open" as const,terms:"COD" as const,total:240},
 context:{orderNumber:"GE-0001",billingName:"Sample Retail LLC",billingAddress:"100 Test St",
  deliveryAddress:"100 Test St",issuerDetailsApproved:true,
  lines:[{product:"Golden Eagle 24-pack",cases:10,pricePerCase:24,amount:240}]},
};

test("complete invoice prints without an incomplete-data warning",()=>{
 assert.deepEqual(invoicePrintWarnings(complete.invoice,complete.context),[]);
});

test("draft, void and incomplete invoices only produce warnings, never print-denial decisions",()=>{
 const missing=invoicePrintWarnings(
  {...complete.invoice,number:"",issuedAt:"",status:"Draft",terms:"" as "COD",total:Number.NaN},
  {...complete.context,issuerDetailsApproved:false,orderNumber:"",billingName:"",
   billingAddress:"",deliveryAddress:"",lines:[]});
 for(const phrase of [
  "still a draft","issuer","Invoice number","date","order number","bill-to name",
  "Bill-to address","Ship-to address","Payment terms","Itemized","total",
 ])assert(missing.some(message=>message.toLowerCase().includes(phrase.toLowerCase())),phrase);
 assert(invoicePrintWarnings({...complete.invoice,status:"Void"},complete.context)
  .some(message=>message.includes("void")));
 assert(invoicePrintWarnings(complete.invoice,{...complete.context,
  lines:[{product:"",cases:0,pricePerCase:-1,amount:-1}]}).some(message=>message.includes("lines")));
});

test("bulk warnings list only affected invoice numbers and confirmation remains outside artwork",()=>{
 const message=invoicePrintConfirmationMessage([
  {number:"INV-1",issues:["Bill-to address is missing."]},
  {number:"INV-2",issues:["Invoice is still a draft."]},
 ]);
 assert.match(message,/INV-1/);
 assert.match(message,/INV-2/);
 assert.match(message,/Do you understand/);
 assert.match(message,/will NOT appear on the printed invoice/);
 const source=readFileSync("components/finance/invoice-print-center.tsx","utf8");
 const printStart=source.slice(source.indexOf("const startPrint ="),source.indexOf("const invoiceSheet ="));
 const artwork=source.slice(source.indexOf("const invoiceSheet ="),source.indexOf("const preview ="));
 assert.match(printStart,/window\.confirm\(invoicePrintConfirmationMessage\(reviews\)\)/);
 assert.match(printStart,/window\.print\(\)/);
 assert.doesNotMatch(printStart,/if \(!invoiceIssueApproved\)/);
 assert.doesNotMatch(artwork,/invoicePrintWarnings|invoicePrintConfirmationMessage|printNotice/);
 assert.match(source,/body/); // The print portal is mounted directly to document.body.
});

test("all available invoice print controls remain enabled regardless of release flag or status",()=>{
 const source=readFileSync("components/finance/invoice-print-center.tsx","utf8");
 assert.doesNotMatch(source,/disabled=\{!invoiceIssueApproved/);
 assert.doesNotMatch(source,/Invoice printing is on hold/);
 assert.match(source,/Print all \(\{invoices\.length\}\)/);
 assert.match(source,/onClick=\{\(\) => startPrint\(\[invoice\.id\]\)\}>Print<\/Button>/);
 assert.match(source,/onClick=\{\(\) => startPrint\(\[previewId\]\)\}>Print \/ Save PDF<\/Button>/);
 // Only invoices in the current authorized scope may enable bulk printing.
 assert.match(source,/const activeSelectedIds = selectedIds\.filter\(\(id\) => authorizedIds\.has\(id\)\)/);
 assert.match(source,/disabled=\{!activeSelectedIds\.length\}/);
 assert.match(source,/onClick=\{\(\) => startPrint\(activeSelectedIds\)\}/);
 assert.doesNotMatch(source,/disabled=\{!selectedIds\.length\}/);
});
