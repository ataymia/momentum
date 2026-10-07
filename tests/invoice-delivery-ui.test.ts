import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const invoiceSource = readFileSync(new URL("../components/finance/invoice-print-center.tsx", import.meta.url), "utf8");
const billingSource = readFileSync(new URL("../components/commerce/order-cash-panel.tsx", import.meta.url), "utf8");
const deliverySource = readFileSync(new URL("../components/pages/deliveries.tsx", import.meta.url), "utf8");
const signatureSource = readFileSync(new URL("../components/delivery/signature-pad.tsx", import.meta.url), "utf8");
const polishSource = readFileSync(new URL("../app/visual-polish-v2.css", import.meta.url), "utf8");

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
  assert.match(invoiceSource, /useState<Copies>\(2\)/);
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
