import assert from "node:assert/strict";
import test from "node:test";
import {DOMAIN_SPECS,assembleState,shardState} from "../lib/firestore-domains";
import {signedDeliveryCloudConfirmed,type DeliverySignaturePoint} from "../lib/delivery-engine";
import {readFileSync} from "node:fs";

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

test("signed delivery is confirmed only when all three cloud ledgers match",()=>{
  const stamp="2026-10-18T22:03:00.000Z";
  const strokes:DeliverySignaturePoint[][]=[[[100,120],[105,125],[112,132]]];
  const delivery={
    version:1,
    tasks:[{
      id:"task-1",orderId:"order-1",driverId:"driver-1",
      status:"Delivered",acceptedAt:stamp,acceptedBy:"driver-1",
      loadedAt:stamp,departedAt:stamp,deliveredAt:stamp,
      signature:{capturedBy:"driver-1",signedAt:stamp,
        recipientName:"Receiver",strokes},
      history:[{id:"delivered-event",type:"Delivered",
        at:stamp,actorId:"driver-1"}],
    }],
    overrides:[],
  };
  const commercial={orders:[{id:"order-1",status:"Delivered",cases:10}]};
  const inventory={movements:[{
    id:"movement-1",relatedOrderId:"order-1",type:"Delivery",quantity:10,
  }]};
  const verify=(d:unknown=delivery,c:unknown=commercial,i:unknown=inventory,
    points=strokes)=>
    signedDeliveryCloudConfirmed(JSON.stringify(d),JSON.stringify(c),
      JSON.stringify(i),"order-1",points);
  assert.equal(verify(),true);
  assert.equal(verify({...delivery,tasks:[{...delivery.tasks[0],status:"In transit"}]}),false);
  assert.equal(verify(delivery,{orders:[{id:"order-1",status:"Out for delivery",cases:10}]}),false);
  assert.equal(verify(delivery,commercial,{movements:[]}),false);
  assert.equal(verify(delivery,commercial,inventory,[[[1,2],[3,4]]]),false);
  assert.equal(verify({...delivery,tasks:[{...delivery.tasks[0],history:[]}]}),false);
});

test("signature modal retains captured handwriting until cloud confirmation",()=>{
  const source=readFileSync("components/pages/deliveries.tsx","utf8");
  assert.match(source,/signedDeliveryCloudConfirmed/);
  assert.match(source,/Keep this window open/);
  assert.match(source,/Verify cloud save/);
  assert.match(source,/savingSignedDelivery/);
  assert.match(source,/momentumStorage\.refreshKeys/);
  const confirm=source.slice(source.indexOf("const completeSignedDelivery = async"));
  assert.ok(confirm.indexOf("closeSignature();")>
    confirm.indexOf("signedDeliveryCloudConfirmed("));
});

test("delivery inventory posts to storage synchronously before acknowledgement",()=>{
  const source=readFileSync("lib/inventory-ledger-context-v2.tsx","utf8");
  assert.match(source,/const ledgerRef=useRef\(ledger\)/);
  assert.match(source,/const commitLedger=.*momentumStorage\.setItem\(INVENTORY_LEDGER_STORAGE_KEY/s);
  assert.doesNotMatch(source,/const commitLedger=.*?=>setLedger\(\(current\)=>/);
});
