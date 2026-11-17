import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
test("D17 connected customer finance never falls back to browser-stored commerce records",()=>{
 const view=readFileSync("components/prototype/customer-commerce-ledgers.tsx","utf8");
 const connected=readFileSync("components/prototype/customer-connected-finance.tsx","utf8");
 assert.match(view,/if\(!demoOnly\)return <CustomerConnectedFinance section=\{section\}\/>/);
 assert.match(connected,/currentFirebaseSession\(\)/);
 assert.match(connected,/firebaseFunctionUrl\("customerCommerceSnapshot"\)/);
 assert.match(connected,/authorization:"Bearer "\+session\.idToken/);
 assert.match(connected,/cache:"no-store"/);
 assert.doesNotMatch(connected,/useCommerce\(/);
 assert.doesNotMatch(connected,/commerce\.invoices/);
});
