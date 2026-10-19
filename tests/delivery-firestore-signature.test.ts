import assert from "node:assert/strict";
import test from "node:test";
import {DOMAIN_SPECS,assembleState,shardState} from "../lib/firestore-domains";

test("delivery signature can round-trip through Firestore without nested arrays",()=>{
  const spec=DOMAIN_SPECS.find((item)=>item.id==="delivery");
  assert.ok(spec);
  const strokes=[[[100,120],[105,125],[112,132]],[[200,200],[220,210]]];
  const task={
    id:"delivery-test",orderId:"order-test",driverId:"driver-test",
    status:"Delivered",acceptedAt:"2026-10-18T22:00:00.000Z",
    acceptedBy:"driver-test",loadedAt:"2026-10-18T22:01:00.000Z",
    departedAt:"2026-10-18T22:02:00.000Z",
    deliveredAt:"2026-10-18T22:03:00.000Z",
    signature:{
      capturedBy:"driver-test",
      signedAt:"2026-10-18T22:03:00.000Z",
      recipientName:"Test Receiver",strokes,
    },
    history:[{id:"event",type:"Delivered",
      at:"2026-10-18T22:03:00.000Z",actorId:"driver-test"}],
  };
  const docs=shardState(spec,{version:1,tasks:[task],overrides:[]});
  const saved=docs.get("domains/delivery/fields/tasks");
  assert.ok(saved);
  const writtenTask=(saved.items as Array<typeof task>)[0];
  assert.equal("strokes" in writtenTask.signature,false);
  assert.equal(typeof (writtenTask.signature as unknown as {
    strokesJson:string;
  }).strokesJson,"string");
  const restored=assembleState(spec,
    new Map([...docs.entries()].map(([key,value])=>[key,value])));
  assert.ok(restored);
  const readTask=(restored.tasks as Array<typeof task>)[0];
  assert.deepEqual(readTask.signature.strokes,strokes);
  assert.equal(readTask.signature.recipientName,"Test Receiver");
});

test("malformed signature stroke payload cannot be silently promoted",()=>{
  const spec=DOMAIN_SPECS.find((item)=>item.id==="delivery");
  assert.ok(spec);
  const docs=new Map<string,Record<string,unknown>|null>([
    ["domains/delivery/fields/_root",{data:{version:1}}],
    ["domains/delivery/fields/tasks",{
      items:[{id:"delivery-test",signature:{strokesJson:"not-json"}}],
    }],
    ["domains/delivery/fields/overrides",{items:[]}],
  ]);
  const restored=assembleState(spec,docs);
  assert.ok(restored);
  const signature=(restored.tasks as Array<{signature:Record<string,unknown>}>)[0]
    .signature;
  assert.equal(signature.strokes,undefined);
});
