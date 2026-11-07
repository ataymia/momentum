import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {DOMAIN_BY_KEY,domainDocuments,userDocPath} from "../lib/firestore-domains";
import type {PersistenceScope} from "../lib/firebase-access";

const file=(name:string)=>readFileSync(name,"utf8");
test("R52: time off form is enabled for authenticated Firestore employees and confirms actual cloud sync",()=>{
 const source=file("components/prototype/hr-time-off-experience.tsx");
 assert.match(source,/storageMode==="firestore"/);
 assert.match(source,/momentumStorage\.flushAndConfirm\(HCM_STORAGE_KEY\)/);
 assert.match(source,/request\.id===pendingId&&request\.userId===currentUser\.id/);
 assert.match(source,/sync confirmation failed/);
 assert.match(source,/disabled=\{!writeEnabled\|\|Boolean\(pendingId\)\}/);
 assert.doesNotMatch(source,/Connected environments are read-only in this redesign prototype/);
});
test("R52: Firestore HCM leave and audit shards are writable only in the authenticated user's scope",()=>{
 const spec=DOMAIN_BY_KEY.get("momentum-hcm-v4");
 assert(spec);
 const scope:PersistenceScope={uid:"rep-a",role:"Sales Representative",accountState:"Active",
   readableUserIds:new Set(["rep-a","rep-b"]),managedUserIds:new Set(),
   supervisedBrandAmbassadorIds:new Set()};
 const docs=domainDocuments(spec,scope);
 assert.equal(docs.find(item=>item.path===userDocPath("rep-a","hcm","leaveRequests"))?.writable,true);
 assert.equal(docs.find(item=>item.path===userDocPath("rep-a","hcm","audit"))?.writable,true);
 assert.equal(docs.some(item=>item.path===userDocPath("rep-b","hcm","leaveRequests")),false);
});
test("R23: customer transactions include only authorized linked finance records and disclose unmatched historical invoices",()=>{
 const source=file("components/prototype/operations-hub.tsx");
 assert.match(source,/projectCustomerFinance\(commerce,orders,ids/);
 assert.match(source,/historicalUnmatched=finance/);
 assert.match(source,/invoice\.accountId/);
 assert.match(source,/Source-linked invoices, payments and credits/);
 assert.match(source,/Historical invoice records needing linkage review/);
 assert.match(source,/no matching canonical order/);
 assert.match(source,/Connected billing history is not joined on this client/);
});
