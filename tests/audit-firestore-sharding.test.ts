import assert from "node:assert/strict";
import test from "node:test";

import {
  DOMAIN_BY_KEY,
  assembleState,
  chunkManifestShardPaths,
  documentReplacesOnWrite,
  shardState,
  userDocPath,
} from "../lib/firestore-domains";

const auditSpec = DOMAIN_BY_KEY.get("momentum-audit-v1")!;
const ADMIN = "uid-admin";

function auditEvent(index:number){
  return {
    id:`audit-size-${index}`,
    at:new Date(Date.UTC(2026,9,1,0,0,index%60)).toISOString(),
    actorId:ADMIN,
    actorRole:"Administrator",
    action:"Updated",
    module:"Workspace",
    collection:"accounts",
    entityType:"Workspace.accounts",
    entityId:`account-${index%250}`,
    label:`Account ${index%250}`,
    summary:`Account ${index%250} updated with a deliberately substantial audit payload ${index}`,
    sensitivity:"operational",
    relatedAccountId:`account-${index%250}`,
    changes:Array.from({length:8},(_,change)=>({
      field:`field-${change}`,
      before:`before-${index}-${change}-${"x".repeat(120)}`,
      after:`after-${index}-${change}-${"y".repeat(120)}`,
    })),
  };
}

test("oversized audit history is split behind a small manifest before Firestore write",()=>{
  const events=Array.from({length:1200},(_,index)=>auditEvent(index));
  const legacyBytes=new TextEncoder().encode(JSON.stringify({items:events})).byteLength;
  assert.ok(legacyBytes>1_048_576,"fixture must reproduce the Firestore one-document failure");

  const shards=shardState(auditSpec,{version:1,events});
  const manifestPath=userDocPath(ADMIN,"audit","events");
  const manifest=shards.get(manifestPath);
  assert.ok(manifest);
  assert.equal(manifest?.shardManifestVersion,1);
  assert.equal(manifest?.itemCount,events.length);
  assert.ok(Array.isArray(manifest?.shards));
  assert.ok((manifest?.shards as unknown[]).length>1);
  assert.equal(Array.isArray(manifest?.items),false,"historical field path must become a manifest, not another oversized array");

  const chunkPaths=chunkManifestShardPaths(auditSpec,manifestPath,manifest!);
  assert.equal(chunkPaths.length,(manifest!.shards as string[]).length);
  for(const path of chunkPaths){
    const doc=shards.get(path);
    assert.ok(doc,`missing chunk ${path}`);
    const bytes=new TextEncoder().encode(JSON.stringify(doc)).byteLength;
    assert.ok(bytes<=350_000,`${path} grew beyond the configured safe chunk target: ${bytes}`);
    assert.ok(bytes<1_048_576,`${path} exceeds Firestore's hard document limit`);
  }
});

test("manifest plus chunk documents reassemble every audit event exactly once",()=>{
  const events=Array.from({length:1200},(_,index)=>auditEvent(index));
  const documents=shardState(auditSpec,{version:1,events});
  const assembled=assembleState(auditSpec,new Map([...documents.entries()].map(([path,data])=>[path,data])));
  assert.ok(assembled);
  const restored=assembled?.events as Array<{id:string}>;
  assert.equal(restored.length,events.length);
  assert.equal(new Set(restored.map((event)=>event.id)).size,events.length);
  assert.deepEqual(
    new Set(restored.map((event)=>event.id)),
    new Set(events.map((event)=>event.id)),
  );
});

test("legacy one-document audit data remains readable and migrates to chunks",()=>{
  const events=Array.from({length:1200},(_,index)=>auditEvent(index));
  const legacy=new Map<string,Record<string,unknown>|null>([
    ["domains/audit/fields/_root",{data:{version:1}}],
    ["domains/audit/fields/events",{items:[]}],
    [userDocPath(ADMIN,"audit","events"),{items:events}],
  ]);

  const assembled=assembleState(auditSpec,legacy);
  assert.ok(assembled);
  assert.equal((assembled?.events as unknown[]).length,events.length);

  const migrated=shardState(auditSpec,assembled);
  const manifest=migrated.get(userDocPath(ADMIN,"audit","events"));
  assert.equal(manifest?.shardManifestVersion,1);
  assert.equal(manifest?.itemCount,events.length);
  assert.equal(Array.isArray(manifest?.items),false);
  assert.ok(chunkManifestShardPaths(auditSpec,userDocPath(ADMIN,"audit","events"),manifest!).length>1);
});


test("bounded audit chunk documents replace prior physical membership instead of accumulating it",()=>{
  const chunkPath=userDocPath(ADMIN,"audit","events__chunk_000000");
  const manifestPath=userDocPath(ADMIN,"audit","events");
  assert.equal(documentReplacesOnWrite(chunkPath),true,"physical chunks must replace their prior bounded snapshot");
  assert.equal(documentReplacesOnWrite(manifestPath),false,"the manifest is not itself a bounded event chunk");
  assert.equal(documentReplacesOnWrite("domains/audit/fields/events"),false,"ordinary shared arrays retain merge semantics");
});

test("rechunking after growth keeps every proposed physical chunk below its configured bound",()=>{
  const first=Array.from({length:1200},(_,index)=>auditEvent(index));
  const grown=[...first,...Array.from({length:450},(_,index)=>auditEvent(index+1200))];
  const firstDocs=shardState(auditSpec,{version:1,events:first});
  const grownDocs=shardState(auditSpec,{version:1,events:grown});

  const paths=[...grownDocs.keys()].filter((path)=>path.includes("/audit/events__chunk_"));
  assert.ok(paths.length>1);
  for(const path of paths){
    const proposed=grownDocs.get(path)!;
    const previous=firstDocs.get(path);
    const proposedBytes=new TextEncoder().encode(JSON.stringify(proposed)).byteLength;
    assert.ok(proposedBytes<=350_000);
    if(previous){
      assert.equal(documentReplacesOnWrite(path),true,"shifted chunk membership must replace, never union with the old chunk");
    }
  }
});
