import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
test("D17 portal orders, invoices, deliveries and account are routed through authenticated server scope",()=>{
 const hub=readFileSync("components/prototype/operations-hub.tsx","utf8");
 const page=readFileSync("components/prototype/customer-connected-portal.tsx","utf8");
 assert.match(hub,/return <CustomerConnectedPortal section=\{section\}\/>/);
 assert.match(hub,/if\(section==="orders"\)return/);
 assert.match(page,/currentFirebaseSession\(\)/);
 assert.match(page,/firebaseFunctionUrl\("customerCommerceSnapshot"\)/);
 assert.match(page,/cache:"no-store"/);
 assert.doesNotMatch(page,/useCommerce\(/);
});
