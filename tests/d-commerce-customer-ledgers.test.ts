import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
test("D17 customer payments/statements are independent, scoped and demo only",()=>{
 const hub=readFileSync("components/prototype/operations-hub.tsx","utf8");
 const src=readFileSync("components/prototype/customer-commerce-ledgers.tsx","utf8");
 assert.match(hub,/CustomerCommerceLedgers section=\{section\}/);
 assert.match(src,/currentUser\?\.role==="Customer"/);
 assert.match(src,/runtime\.isDemo&&momentumStorage\.mode\(\)==="local"/);
 assert.match(src,/permittedAccounts\.has\(i\.accountId\)/);
 assert.match(src,/orderMap\.get\(i\.orderId\)\?\.accountId===i\.accountId/);
 assert.match(src,/p\.id===a\.paymentId&&p\.accountId===invoice\.accountId/);
 assert.doesNotMatch(src,/\brecordPayment\(/);assert.doesNotMatch(src,/\bsetPaymentStatus\(/);
});
