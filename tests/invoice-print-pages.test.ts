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
