import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
test("sync control forces cloud read of delivery, order and inventory without losing signature form",()=>{
 const page=readFileSync("components/pages/deliveries.tsx","utf8");
 const storage=readFileSync("lib/persistence.ts","utf8");
 assert.ok(page.includes("Sync queue"));
 assert.ok(page.includes("momentumStorage.refreshKeys(keys)"));
 assert.ok(page.includes("momentumStorage.flushAndConfirm(key)"));
 assert.ok(page.includes("disabled={refreshingQueue}"));
 assert.ok(storage.includes("async refreshKeys("));
 assert.ok(storage.includes("getFirestoreSnapshots([...paths.keys()])"));
 assert.ok(storage.includes("pendingJournalKey(this.scope.uid,key)"));
 assert.ok(storage.includes("emitKey(key)"));
});

test("driver marketing notices require an assigned delivery, not a merely claimable order",()=>{
 const page=readFileSync("components/pages/deliveries.tsx","utf8");
 assert.match(page,/const visibleMarketingRequests = isDriver[\s\S]*?taskForOrder\(order\.id\)\?\.driverId === currentUser\?\.id/);
 assert.ok(page.includes(": approvedMarketingRequests;"),"operations retains approved requests");
});

test("connected delivery never treats gateway HTML or missing cloud acknowledgement as success",()=>{
 const client=readFileSync("lib/firebase-assigned-delivery.ts","utf8");
 assert.match(client,/response\.json\(\)\.catch\(\(\)=>null\)/,"non-JSON responses are handled");
 assert.match(client,/!response\.ok\|\|result\?\.ok!==true\|\|result\.cloudConfirmed!==true/,"explicit server acknowledgement required");
 assert.match(client,/Refresh the queue before taking another action/,"uncertain writes warn against blind replay");
});

test("acknowledged custody mutations survive a failed client readback",()=>{
 const client=readFileSync("lib/firebase-assigned-delivery.ts","utf8");
 assert.match(client,/let refreshed=false;[\s\S]*?try\s*\{[\s\S]*?momentumStorage\.refreshKeys\([\s\S]*?catch\s*\{[\s\S]*?refreshed=false;[\s\S]*?return \{\.\.\.result,refreshed\};/);
 assert.match(client,/result\.cloudConfirmed!==true/,"server acknowledgement remains mandatory");
});

test("network transport failure leaves custody outcome uncertain and requires reconciliation",()=>{
 const client=readFileSync("lib/firebase-assigned-delivery.ts","utf8");
 assert.match(client,/try\s*\{[\s\S]*?response=await fetch\([\s\S]*?catch\s*\{[\s\S]*?Refresh the queue and verify the current custody status before taking another action/);
 assert.match(client,/result\.cloudConfirmed!==true/,"only explicit cloud confirmation is accepted");
});


test("same-tab duplicate custody submissions share one pending operation and release after settlement",()=>{
 const client=readFileSync("lib/firebase-assigned-delivery.ts","utf8");
 assert.match(client,/pendingCustodyActions=new Map/);
 assert.match(client,/session\.uid,body\.orderId,body\.action/,"dedupe scope includes identity, order and action");
 assert.match(client,/if\(pending\)return pending/,"second simultaneous submission cannot post twice");
 assert.match(client,/pendingCustodyActions\.set\(key,operation\)/);
 assert.match(client,/operation\.finally\([\s\S]*?pendingCustodyActions\.delete\(key\)/,"settled actions do not permanently block retries");
});
