import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const invoiceSource = readFileSync(new URL("../components/finance/invoice-print-center.tsx", import.meta.url), "utf8");
const billingSource = readFileSync(new URL("../components/commerce/order-cash-panel.tsx", import.meta.url), "utf8");
const deliverySource = readFileSync(new URL("../components/pages/deliveries.tsx", import.meta.url), "utf8");
const signatureSource = readFileSync(new URL("../components/delivery/signature-pad.tsx", import.meta.url), "utf8");
const polishSource = readFileSync(new URL("../app/visual-polish-v2.css", import.meta.url), "utf8");
const invoiceCss = readFileSync(new URL("../app/invoice-print.css", import.meta.url), "utf8");

test("invoice print stays inside the user activation and mounts outside the clipped app layout", () => {
  assert.match(invoiceSource, /flushSync\(\(\) => setPrintJob/);
  assert.match(invoiceSource, /window\.print\(\)/);
  assert.match(invoiceSource, /createPortal\(/);
  assert.match(invoiceSource, /document\.body/);
  assert.doesNotMatch(invoiceSource, /setTimeout\(\(\) => window\.print/);
});

test("the primary Invoices & payments workspace exposes single and bulk invoice printing", () => {
  assert.match(billingSource, /InvoicePrintCenter/);
  assert.match(invoiceSource, /Print selected/);
  assert.match(invoiceSource, />Print<\/Button>/);
  assert.match(invoiceSource, /Print \/ Save PDF/);
  assert.match(invoiceSource, /useState<Copies>\(1\)/);
});

test("delivery cards keep the essentials visible and move complete detail into an explicit review modal", () => {
  assert.match(deliverySource, /View details/);
  assert.match(deliverySource, /Delivery details/);
  assert.match(deliverySource, /Approved special requests/);
  assert.match(deliverySource, /Payment collected at delivery/);
  assert.match(deliverySource, /Delivery history/);
});


test("delivery completion requires an on-screen touch or mouse signature instead of a confirm dialog", () => {
  assert.match(deliverySource, /Complete delivery & sign/);
  assert.match(deliverySource, /DeliverySignaturePad/);
  assert.match(deliverySource, /Save signature & complete/);
  assert.doesNotMatch(deliverySource, /Confirm .* was delivered/);
  assert.match(signatureSource, /onPointerDown/);
  assert.match(signatureSource, /onPointerMove/);
  assert.match(polishSource, /touch-action:none/);
});

test("delivery signatures are rendered onto invoice receipt fields", () => {
  assert.match(invoiceSource, /useDelivery/);
  assert.match(invoiceSource, /deliverySignature/);
  assert.match(invoiceSource, /Customer delivery signature/);
  assert.match(invoiceSource, /recipientName/);
  assert.match(invoiceSource, /signedAt/);
});

test("delivery workspace has dedicated phone typography, single-column actions, and large controls", () => {
  assert.match(polishSource, /\.page--deliveries[\s\S]*font-size:28px/);
  assert.match(polishSource, /\.delivery-card__identity>strong[\s\S]*font-size:20px!important/);
  assert.match(polishSource, /\.delivery-card__actions[\s\S]*grid-template-columns:1fr/);
  assert.match(polishSource, /\.delivery-card__actions \.button[\s\S]*min-height:48px/);
  assert.match(polishSource, /\.delivery-payment-collection[\s\S]*grid-template-columns:1fr/);
});


test("invoice print removes the application layout from print flow so it cannot create blank trailing pages", () => {
  assert.ok(invoiceCss.includes("body > *:not(.invoice-print-root) { display: none !important; }"));
  assert.ok(invoiceCss.includes("body > .invoice-print-root {"));
  assert.ok(invoiceCss.includes("position: static !important;"));
  assert.doesNotMatch(invoiceCss, /body \*\{visibility:hidden!important\}/);
});

test("invoice header uses the official Momentum Golden Eagle brand asset instead of the placeholder M mark", () => {
  assert.match(invoiceSource, /invoice-sheet__brand-logo/);
  assert.match(invoiceSource, /momentum-invoice-brand\.jpg/);
  assert.match(invoiceSource, /Momentum Distribution Inc\. Golden Eagle Energy Drink/);
  assert.doesNotMatch(invoiceSource, /invoice-sheet__mark/);
  assert.doesNotMatch(invoiceSource, /momentum-golden-eagle-official-transparent/);
  assert.doesNotMatch(invoiceSource, /ChatGPT%20Image/);
  assert.match(invoiceCss, /\.invoice-sheet__brand-logo/);
});

test("print CSS excludes hidden application pages and fits within letter paper", () => {
  assert.match(invoiceCss, /\\.invoice-print-root\\{display:none\\}/);
  assert.match(invoiceCss, /height: 10\\.7in !important/);
  assert.match(invoiceCss, /min-height: 0 !important/);
  assert.match(invoiceCss, /\\.invoice-print-root \\.invoice-sheet \\+ \\.invoice-sheet/);
  assert.match(invoiceCss, /break-before: page !important/);
  assert.match(invoiceCss, /break-after: auto !important/);
  assert.doesNotMatch(invoiceCss, /min-height:11in!important/);
});
