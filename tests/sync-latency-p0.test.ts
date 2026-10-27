import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {mayDiscardJournal,nextFlushableKey} from "../lib/sync-queue-policy";

const source=(path:string)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("oldest eligible writes are not starved by newer clicks or blocked records",()=>{
  assert.equal(nextFlushableKey(["order","crm","gps"],new Set()),"order");
  assert.equal(nextFlushableKey(["blocked","order","crm"],new Set(["blocked"])),"order");
  assert.equal(nextFlushableKey(["denied"],new Set(["denied"])),undefined);
  assert.equal(nextFlushableKey([],new Set()),undefined);
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
  const delivery=source("lib/delivery-context.tsx");
  assert.doesNotMatch(workspace,/momentumStorage\.setItem\(DATA_KEY, JSON\.stringify\(data\)\);\s*void momentumStorage\.flush\(\)/);
  assert.doesNotMatch(commercial,/momentumStorage\.setItem\(COMMERCIAL_KEY, JSON\.stringify\(commercial\)\);\s*void momentumStorage\.flush\(\)/);
  assert.doesNotMatch(crm,/momentumStorage\.setItem\(CRM_STORAGE_KEY, JSON\.stringify\(state\)\);\s*void momentumStorage\.flush\(\)/);
  assert.doesNotMatch(delivery,/momentumStorage\.setItem\(DELIVERY_STORAGE_KEY, JSON\.stringify\(state\)\);\s*void momentumStorage\.flush\(\)/);
});
test("persistence guards every journal clearing path and blocked retries",()=>{
  const p=source("lib/persistence.ts");
  assert.match(p,/nextFlushableKey\(keys,this\.blockedKeys\)/);
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
test("Administrator diagnostics are opt-in and contain timings, not operational records",()=>{
  const component=source("components/settings/performance-health-panel.tsx");
  assert.match(component,/currentUser\?\.role!=="Administrator"/);
  assert.match(component,/PERFORMANCE_DIAGNOSTICS_FLAG/);
  assert.match(component,/navigator\.clipboard\.writeText/);
  assert.doesNotMatch(component,/locationTracking|password|idToken|order\.id/);
  assert.match(source("components/pages/settings-v3.tsx"),/<PerformanceHealthPanel\/>/);
});
