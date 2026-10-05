import assert from "node:assert/strict";
import test from "node:test";

import { compactPendingJournalValue } from "../lib/pending-journal-storage-guard";

const auditKey="momentum-firestore-pending-v1:uid-admin:momentum-audit-v1";

function largeAuditState(){
  return JSON.stringify({
    version:1,
    events:Array.from({length:500},(_,index)=>({
      id:`audit-${index}`,
      at:"2026-10-05T17:45:49.842Z",
      actorId:"uid-admin",
      actorRole:"Administrator",
      action:"Updated",
      module:"Workspace",
      collection:"orders",
      entityType:"Workspace.orders",
      entityId:`order-${index}`,
      label:`Order ${index}`,
      summary:`Order ${index} updated`,
      sensitivity:"operational",
      changes:Array.from({length:10},(_item,change)=>({field:`field-${change}`,before:"x".repeat(180),after:"y".repeat(180)})),
    })),
  });
}

test("audit pending journal is compacted while preserving newest recovery events",()=>{
  const raw=largeAuditState();
  const journal=JSON.stringify({journalVersion:2,base:raw,value:raw});
  const compacted=compactPendingJournalValue(auditKey,journal);
  assert.ok(compacted.length<journal.length/2,"quota guard should materially reduce the recovery journal");
  const parsed=JSON.parse(compacted) as {journalVersion:number;base:string;value:string};
  assert.equal(parsed.journalVersion,2);
  const value=JSON.parse(parsed.value) as {version:number;events:Array<{id:string}>};
  const base=JSON.parse(parsed.base) as {version:number;events:Array<{id:string}>};
  assert.equal(value.version,1);
  assert.equal(base.version,1);
  assert.ok(value.events.length>0);
  assert.ok(value.events.length<500);
  assert.equal(value.events[0]?.id,"audit-0","newest-first audit order must be preserved");
  assert.equal(base.events[0]?.id,"audit-0");
});

test("non-audit Firestore pending journals are left byte-for-byte unchanged",()=>{
  const key="momentum-firestore-pending-v1:uid-admin:momentum-commercial-controls-v1";
  const value=JSON.stringify({journalVersion:2,base:"old",value:"new"});
  assert.equal(compactPendingJournalValue(key,value),value);
});

test("legacy raw audit state can also be compacted",()=>{
  const raw=largeAuditState();
  const compacted=compactPendingJournalValue(auditKey,raw);
  const parsed=JSON.parse(compacted) as {events:Array<{id:string}>};
  assert.ok(parsed.events.length>0);
  assert.ok(parsed.events.length<500);
  assert.equal(parsed.events[0]?.id,"audit-0");
});
