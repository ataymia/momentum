import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { invoicePrintPages } from "../lib/invoice-print-pages";

test("one invoice produces exactly one page per copy", () => {
  assert.deepEqual(invoicePrintPages(["inv-1"], 1), [{ invoiceId: "inv-1", copyIndex: 0 }]);
  assert.deepEqual(invoicePrintPages(["inv-1"], 2), [
    { invoiceId: "inv-1", copyIndex: 0 },
    { invoiceId: "inv-1", copyIndex: 1 },
  ]);
});
test("two invoices produce exactly two pages at one copy each and four at two copies", () => {
  assert.equal(invoicePrintPages(["inv-1", "inv-2"], 1).length, 2);
  assert.equal(invoicePrintPages(["inv-1", "inv-2"], 2).length, 4);
  assert.equal(invoicePrintPages(["inv-1", "inv-1"], 1).length, 1);
});
test("the invoice brand JPG matches the source and has a valid JPEG header", () => {
  const original = readFileSync("public/ChatGPT Image Oct 7, 2026, 04_03_55 PM.jpg");
  const brand = readFileSync("public/momentum-invoice-brand.jpg");
  assert.equal(brand.subarray(0, 3).toString("hex"), "ffd8ff");
  assert.equal(createHash("sha256").update(brand).digest("hex"), createHash("sha256").update(original).digest("hex"));
});

test("bulk printing rejects missing invoice IDs instead of creating blank sheets", () => {
  assert.throws(() => invoicePrintPages(["inv-1", ""], 1), /missing invoice ID/);
  assert.throws(() => invoicePrintPages(["  "], 2), /missing invoice ID/);
  assert.deepEqual(invoicePrintPages([], 1), []);
});

test("invoice sheet and preview only resolve records within the active authorized scope", () => {
  const source = readFileSync("components/finance/invoice-print-center.tsx", "utf8");
  assert.match(source, /const invoice = invoices\.find\(\(item\) => item\.id === invoiceId\)/);
  assert.match(source, /const order = scope\.orders\.find\(\(item\) => item\.id === invoice\.orderId\)/);
  assert.match(source, /const location = scope\.accounts\.find\(\(item\) => item\.id === invoice\.accountId\)/);
  assert.match(source, /title=\{previewId \? invoices\.find\(/);
  assert.doesNotMatch(source, /const invoice = commerce\.invoices\.find\(\(item\) => item\.id === invoiceId\)/);
});


test("invoice register and stale preview respect active scope", () => {
  const source = readFileSync("components/finance/invoice-print-center.tsx", "utf8");
  assert.match(source, /const location = scope\.accounts\.find\(\(item\) => item\.id === invoice\.accountId\)/);
  assert.match(source, /const order=scope\.orders\.find\(\(item\)=>item\.id===invoice\.orderId\)/);
  assert.match(source, /<Modal open=\{Boolean\(preview\)\}/);
  assert.match(source, /\{preview && previewId && <Button/);
  assert.doesNotMatch(source, /const location = data\.accounts\.find\(\(item\) => item\.id === invoice\.accountId\)/);
});
