import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
test("D16 connected customer payments cannot be marked settled from browser-only finance context",()=>{
 const src=readFileSync("lib/commerce-context.tsx","utf8");
 assert.match(src,/localSettlementSandbox=runtime\.isDemo&&momentumStorage\.mode\(\)==="local"/);
 assert.match(src,/if\(!localSettlementSandbox\)return;/);
 assert.match(src,/input\.status === "Cleared" && \(!localSettlementSandbox/);
 assert.match(src,/payment\.status !== "Pending" \|\| !localSettlementSandbox/);
 assert.match(src,/reconcileOrderPayment\(order\.id, status/);
});
