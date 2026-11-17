import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {mayMutateCommerceInBrowser} from "../lib/connected-commerce-policy";
test("connected finance never posts browser financial mutations regardless of role",()=>{
 for(const role of ["Administrator","Sales Manager","Sales Representative","Operations",undefined]){
  for(const isDemo of [false,true]){
   for(const storageMode of ["connected","remote","firestore"]){
    assert.equal(mayMutateCommerceInBrowser({role,isDemo,storageMode}),false);
   }
  }
 }
 assert.equal(mayMutateCommerceInBrowser({role:"Administrator",isDemo:true,storageMode:"local"}),true);
 assert.equal(mayMutateCommerceInBrowser({role:"Sales Representative",isDemo:true,storageMode:"local"}),false);
});
test("commerce UI and state use the same fail-closed policy and persist local demo only",()=>{
 const state=readFileSync("lib/commerce-context.tsx","utf8");
 const panel=readFileSync("components/commerce/order-cash-panel-v2.tsx","utf8");
 const ruleSource=readFileSync("lib/firestore-domains.ts","utf8");
 assert(state.includes("mayMutateCommerceInBrowser({"));
 assert(panel.includes("mayMutateCommerceInBrowser({"));
 assert(state.includes('if (typeof window !== "undefined" && localSettlementSandbox)'));
 assert(state.includes('if (!localSettlementSandbox || !currentUser || currentUser.role === "Customer"'));
 assert(panel.includes("Connected finance is a non-posting review"));
 assert(ruleSource.includes('id:"commerce",read:['));
 assert(ruleSource.includes('write:[],fields:{invoices:{},payments:{}'));
});


test("P0 connected Orders and Approvals never accept browser-authored Paid or Approved writes",()=>{
 const domains=readFileSync("lib/firestore-domains.ts","utf8");
 const rules=readFileSync("firestore.rules","utf8");
 const context=readFileSync("lib/workspace-context.tsx","utf8");
 const legacyOrders=readFileSync("components/pages/orders-v3.tsx","utf8");
 const connectedIntake=readFileSync("components/commerce/connected-order-intake-form.tsx","utf8");
 assert.match(domains,/orders:\{read:\[\.\.\.OPERATIONAL,"Delivery Driver"\],write:\[\]\}/);
 assert.match(domains,/approvals:\{write:\[\]\}/);
 assert.match(domains,/spec\.id\)\s*&&.*ROOT_FIELD|ROOT_FIELD\),writable:sharedWritable&&!/);
 assert.match(domains,/if\(parsed\.field===ROOT_FIELD&&\["workspace","commercial"\]\.includes\(spec\.id\)\)return false/);
 assert.match(rules,/field in \['accounts', 'approvals', 'customers', 'orders'\]/);
 assert.match(rules,/field in \['approvals', 'orders'\] \? \(activeEmployee\(\) && role\(\) in \[\]\)/);
 assert.equal(rules.split("&& field != '_root';").length-1,2);
 assert.match(context,/const createOrder = \(input: EnhancedOrderInput\) => \{\s*\/\/ In connected mode/);
 assert.match(context,/if\(!demoMode\|\|momentumStorage\.mode\(\)!=="local"\)return null/);
 assert.match(context,/Connected order amendments require an Administrator-authorized server workflow/);
 assert.match(context,/Connected order cancellation requires a trusted server decision/);
 assert.match(legacyOrders,/A priced order cannot be created in the browser/);
 assert.match(legacyOrders,/navigateToRoute\("\/sales\/orders\/new"\)/);
 assert.match(connectedIntake,/Connected intake is NOT an order/);
 assert.match(connectedIntake,/submitConnectedOrderIntake\(firebase\.session/);
});
