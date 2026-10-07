import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { deliveryDriverProductLabel } from "../lib/product-catalog";

test("delivery driver labels keep can size and pack while shortening flavor names",()=>{
  assert.equal(deliveryDriverProductLabel("0.25L (8.4oz) Golden Eagle Energy Drink (24pack)"),"8.4 oz Regular 24-pack");
  assert.equal(deliveryDriverProductLabel("0.25L (8.4oz) Golden Eagle SugarFree (24pack)"),"8.4 oz Sugar-Free 24-pack");
  assert.equal(deliveryDriverProductLabel("0.25L (8.4oz) Golden Eagle Tropical Edition (24pack)"),"8.4 oz Tropical 24-pack");
  assert.equal(deliveryDriverProductLabel("0.25L (8.4oz) Golden Eagle RED Edition (24pack)"),"8.4 oz Red 24-pack");
  assert.equal(deliveryDriverProductLabel("0.25L (8.4oz) Golden Eagle Blue (Zero) Edition (24pack)"),"8.4 oz Blue 24-pack");
  assert.equal(deliveryDriverProductLabel("0.25L (8.4oz) Golden Eagle Strawberry Edition (24pack)"),"8.4 oz Strawberry 24-pack");
});

test("delivery aliases stay in the driver presentation path",()=>{
  const delivery=readFileSync("components/pages/deliveries.tsx","utf8");
  const css=readFileSync("app/visual-polish-v2.css","utf8");
  assert.ok(delivery.includes('isDriver && <div className="delivery-driver-load"'));
  assert.ok(delivery.includes("deliveryDriverProductLabel(line.product)"));
  assert.ok(delivery.includes('className="delivery-card__address"'));
  assert.ok(css.includes(".delivery-driver-load__line>strong b"));
  assert.ok(css.includes(".delivery-detail-items__primary b"));
});


test("driver cards keep secondary money and terms quiet beneath the prominent load",()=>{
  const delivery=readFileSync("components/pages/deliveries.tsx","utf8");
  const css=readFileSync("app/visual-polish-v2.css","utf8");
  assert.match(delivery,/isDriver \? <div className="delivery-driver-meta"/);
  assert.match(delivery,/delivery-driver-load__line/);
  assert.match(css,/\.delivery-driver-meta[\s\S]*color:var\(--muted\)/);
});
