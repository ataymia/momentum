import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {isTransientFirestoreFailure,mayDiscardJournal,nextFlushableKey,shouldScheduleSooner} from "../lib/sync-queue-policy";

const source=(path:string)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("oldest eligible writes are not starved by newer clicks or blocked records",()=>{
  assert.equal(nextFlushableKey(["order","crm","gps"],new Set()),"order");
  assert.equal(nextFlushableKey(["blocked","order","crm"],new Set(["blocked"])),"order");
  assert.equal(nextFlushableKey(["denied"],new Set(["denied"])),undefined);
  assert.equal(nextFlushableKey([],new Set()),undefined);
});
test("continuous GPS updates cannot keep postponing an earlier queued cloud save",()=>{
  assert.equal(shouldScheduleSooner(undefined,1000),true);
  assert.equal(shouldScheduleSooner(1000,1250),false);
  assert.equal(shouldScheduleSooner(1250,1000),true);
});
test("transient Firestore outage cannot fan a failed batch into many requests",()=>{
  for(const status of [408,429,500,502,503,504]){
    assert.equal(isTransientFirestoreFailure({ok:false,status,code:"HTTP_"+status}),true);
  }
  for(const code of ["UNAVAILABLE","RESOURCE_EXHAUSTED","DEADLINE_EXCEEDED","INTERNAL"]){
    assert.equal(isTransientFirestoreFailure({ok:false,status:400,code}),true);
  }
  assert.equal(isTransientFirestoreFailure({ok:false,status:400,code:"INVALID_ARGUMENT"}),false);
  assert.equal(isTransientFirestoreFailure({ok:false,status:403,code:"PERMISSION_DENIED"}),false);
  assert.equal(isTransientFirestoreFailure({ok:true}),false);
});
test("in-flight older cloud commit never clears a newer recovery journal",()=>{
  assert.equal(mayDiscardJournal(4,4),true);
  assert.equal(mayDiscardJournal(4,5),false);
  assert.equal(mayDiscardJournal(5,4),false);
});
test("background state effects cannot immediately flush on every React update",()=>{
  const workspace=source("lib/workspace-context-v5.tsx");
  const commercial=source("lib/workspace-context.tsx");
  const crm=source("lib/crm-context.tsx");
  assert.ok(crm.includes('JSON.stringify(normalized)===JSON.stringify(current)'));
  const delivery=source("lib/delivery-context.tsx");
  assert.doesNotMatch(workspace,/momentumStorage\.setItem\(DATA_KEY, JSON\.stringify\(data\)\);\s*void momentumStorage\.flush\(\)/);
  assert.doesNotMatch(commercial,/momentumStorage\.setItem\(COMMERCIAL_KEY, JSON\.stringify\(commercial\)\);\s*void momentumStorage\.flush\(\)/);
  assert.doesNotMatch(crm,/momentumStorage\.setItem\(CRM_STORAGE_KEY, JSON\.stringify\(state\)\);\s*void momentumStorage\.flush\(\)/);
  assert.doesNotMatch(delivery,/momentumStorage\.setItem\(DELIVERY_STORAGE_KEY, JSON\.stringify\(state\)\);\s*void momentumStorage\.flush\(\)/);
});
test("persistence guards every journal clearing path and blocked retries",()=>{
  const p=source("lib/persistence.ts");
  assert.match(p,/nextFlushableKey\(keys,this\.blockedKeys\)/);
  assert.ok(p.includes('shouldScheduleSooner(this.timerDueAt,dueAt)'));
  assert.ok(p.includes('if(conflictsExhausted)'));
  assert.match(p,/Concurrent cloud edits remain unresolved/);
  assert.ok(p.includes("if(isTransientFirestoreFailure(result))"));
  assert.match(p,/const capturedRevisions=new Map/);
  assert.match(p,/mayDiscardJournal\(/);
  assert.match(p,/if\(\[\.\.\.this\.dirty\]\.some\(\(key\)=>!this\.blockedKeys\.has\(key\)\)/);
  assert.match(p,/storage-journal/);
  assert.match(p,/firestore-write-build/);
  assert.match(source("lib/firebase-firestore-rest.ts"),/operation:"firestore-commit"/);
});
test("normalization does not republish unchanged commerce, delivery or inventory",()=>{
  for(const file of ["lib/commerce-context.tsx","lib/delivery-context.tsx","lib/inventory-ledger-context-v2.tsx"]){
    const code=source(file);
    assert.match(code,/JSON\.stringify\(next\)===JSON\.stringify\(current\)|JSON\.stringify\(next\)===JSON\.stringify\(state\)|JSON\.stringify\(normalized\)===JSON\.stringify\(current\)/);
  }
});
test("payment reconciliation does not change identity on unrelated page navigation",()=>{
  const wrapper=source("lib/workspace-context.tsx");
  const commerce=source("lib/commerce-context.tsx");
  assert.match(wrapper,/const reconcileOrderPayment = useCallback\(/);
  assert.match(wrapper,/\[base\.reconcileOrderPayment, commercial, currentUser, data\]/);
  assert.match(commerce,/\[commerce, data\.orders, reconcileOrderPayment\]/);
});
test("field tracking preserves route history without no-op session rewrites",()=>{
  const code=source("lib/location-tracking-context.tsx");
  assert.match(code,/if\(!current\.sessions\.some\(\(session\)=>session\.userId===userId&&!session\.endedAt\)\)return current/);
  assert.match(code,/JSON\.stringify\(next\)===JSON\.stringify\(current\)/);
  assert.match(code,/retainRouteEvidence/);
});
test("invoice navigation caches balance calculations and captures paint time",()=>{
  const code=source("components/commerce/order-cash-panel-v2.tsx");
  assert.match(code,/const invoiceSummaries=useMemo\(/);
  assert.match(code,/invoiceSummaries\.get\(invoice\.id\)/);
  assert.match(code,/operation:"invoice-switch-paint"/);
});
test("read timing distinguishes the expensive denied batch fallback",()=>{
  const code=source("lib/firebase-firestore-rest.ts");
  assert.match(code,/operation:"firestore-batch-permission-fallback"/);
  assert.match(code,/operation:"firestore-list-read"/);
  assert.match(code,/operation:"firestore-single-read"/);
});
test("Administrator diagnostics are opt-in and contain timings, not operational records",()=>{
  const component=source("components/settings/performance-health-panel.tsx");
  assert.match(component,/currentUser\?\.role!=="Administrator"/);
  assert.match(component,/PERFORMANCE_DIAGNOSTICS_FLAG/);
  assert.match(component,/navigator\.clipboard\.writeText/);
  assert.doesNotMatch(component,/locationTracking|password|idToken|order\.id/);
  assert.match(source("components/pages/settings-v3.tsx"),/<PerformanceHealthPanel\/>/);
});

test("a conflict refresh cannot overwrite edits made while Firestore was loading",()=>{
  const p=source("lib/persistence.ts");
  const reconcile=p.slice(p.indexOf("  private async reconcile("),p.indexOf("  async poll(){"));
  assert.match(p,/await this\.reconcile\(writes\.map\(\(write\)=>write\.path\),pathKey,nextDocs,capturedRevisions\)/);
  assert.match(reconcile,/capturedRevisions:Map<string,number>/);
  assert.match(reconcile,/if\(!mayDiscardJournal\(capturedRevisions\.get\(key\)\?\?0,this\.revisions\.get\(key\)\?\?0\)\)/);
  assert.match(reconcile,/this\.dirty\.add\(key\);\s*continue;/);
  assert.match(reconcile,/this\.cache\.set\(key,this\.assemble\(spec,map\)\)/);
  assert.ok(reconcile.indexOf("this.dirty.add(key);")<reconcile.indexOf("this.cache.set(key,this.assemble(spec,map))"));
  assert.equal(mayDiscardJournal(1,2),false);
  assert.equal(mayDiscardJournal(2,2),true);
});
