import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const invoiceSource = readFileSync(new URL("../components/finance/invoice-print-center.tsx", import.meta.url), "utf8");
const billingSource = readFileSync(new URL("../components/commerce/order-cash-panel.tsx", import.meta.url), "utf8");
const deliverySource = readFileSync(new URL("../components/pages/deliveries.tsx", import.meta.url), "utf8");

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
