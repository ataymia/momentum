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
