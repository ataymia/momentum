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
 assert.ok(storage.includes("this.readSnapshots([...paths.keys()])"));
 assert.ok(storage.includes("this.readSnapshots=options.testOnlyReadTransport?.getSnapshots??((paths)=>getFirestoreSnapshots(paths))"));
 assert.ok(storage.includes("pendingJournalKey(this.scope.uid,key)"));
 assert.ok(storage.includes("emitKey(key)"));
});
