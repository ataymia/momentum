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


test("conflicting custody actions for one order are rejected while a mutation is pending",()=>{
 const client=readFileSync("lib/firebase-assigned-delivery.ts","utf8");
 assert.match(client,/pendingOrderActions=new Map<string,string>\(\)/);
 assert.match(client,/const orderKey=body\.orderId/, "order lock remains active across identity changes");
 assert.match(client,/if\(pending\)return pending/,"identical submissions still share one operation");
 assert.match(client,/if\(pendingOrderActions\.has\(orderKey\)\)return Promise\.reject/,"different actions must not race");
 assert.match(client,/pendingOrderActions\.set\(orderKey,key\)/);
 assert.match(client,/pendingOrderActions\.get\(orderKey\)===key\)pendingOrderActions\.delete\(orderKey\)/,"cleanup releases the order after settlement");
});


test("malformed custody requests are rejected before network submission",()=>{
 const client=readFileSync("lib/firebase-assigned-delivery.ts","utf8");
 assert.match(client,/typeof session\.uid!=="string"/);
 assert.match(client,/typeof session\.idToken!=="string"/);
 assert.match(client,/\^\[A-Za-z0-9_-\]\{5,120\}\$/);
 assert.ok(client.indexOf("Select a valid delivery order")<client.indexOf("const operation=submitAssignedDelivery"),"invalid orders never reach Firebase");
});


test("runtime custody action and assignment IDs are validated before posting",()=>{
 const client=readFileSync("lib/firebase-assigned-delivery.ts","utf8");
 assert.match(client,/allowedActions\.has\(body\.action\)/,"unknown actions fail closed");
 assert.match(client,/body\.driverId!==undefined&&!/,"malformed driver IDs are rejected");
 assert.ok(client.indexOf("Select a valid driver before assigning delivery custody.")<client.indexOf("const operation=submitAssignedDelivery"),"invalid assignments cannot reach the network");
});


test("delivery notes and release reasons fail locally when outside trusted server limits",()=>{
 const client=readFileSync("lib/firebase-assigned-delivery.ts","utf8");
 assert.match(client,/body\.action==="note"[\s\S]*?body\.note\.trim\(\)\.length<3[\s\S]*?body\.note\.trim\(\)\.length>500/);
 assert.match(client,/body\.action==="release"[\s\S]*?body\.reason\.trim\(\)\.length<8[\s\S]*?body\.reason\.trim\(\)\.length>500/);
 assert.ok(client.indexOf("Enter a release reason of 8–500 characters.")<client.indexOf("const operation=submitAssignedDelivery"),"invalid release requests never reach the server");
});

test("completion signature preflight enforces trusted stroke, coordinate and recipient bounds",()=>{
 const client=readFileSync("lib/firebase-assigned-delivery.ts","utf8");
 assert.match(client,/body\.action==="complete"/);
 assert.match(client,/signature\.strokes\.length>80/);
 assert.match(client,/stroke\.length<2\|\|stroke\.length>300/);
 assert.match(client,/pt\[0\]>=0&&pt\[0\]<=1000&&pt\[1\]>=0&&pt\[1\]<=300/);
 assert.match(client,/points<2\|\|points>1200/);
 assert.match(client,/signature\.recipientName\.trim\(\)\.length>120/);
 assert.ok(client.indexOf('body.action==="complete"')<client.indexOf("const operation=submitAssignedDelivery"),"invalid signatures cannot reach Firebase");
});


test("assignment requires a concrete driver target before sending a custody request",()=>{
 const client=readFileSync("lib/firebase-assigned-delivery.ts","utf8");
 assert.match(client,/body\.action==="assign"&&!body\.driverId/,"targetless assignments fail closed");
 assert.ok(client.indexOf("Select a driver before assigning delivery custody.")<client.indexOf("const operation=submitAssignedDelivery"),"targetless assignments never contact Firebase");
});


test("connected custody executes duplicate, conflict and server-confirmation safeguards",async()=>{
 const ts=(await import("typescript")).default;
 const vm=await import("node:vm");
 const source=readFileSync("lib/firebase-assigned-delivery.ts","utf8");
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 let calls=0,refreshes=0;
 let resolveResponse:((response:unknown)=>void)|undefined;
 const fetchMock=()=>{calls++;return new Promise(resolve=>{resolveResponse=resolve;});};
 const exports:Record<string,unknown>={};
 const context={exports,fetch:fetchMock,Response,Promise,Map,Set,JSON,Number,Error,
  require:(name:string)=>{
   if(name==="./firebase-functions")return {firebaseFunctionUrl:()=>"https://example.invalid/assignedDeliveryApi"};
   if(name==="./persistence")return {momentumStorage:{refreshKeys:async()=>{refreshes++;return {ok:true};}}};
   throw new Error("Unexpected module "+name);
  }};
 vm.runInNewContext(compiled,context,{filename:"firebase-assigned-delivery.js"});
 const assigned=exports.assignedDelivery as (session:unknown,body:unknown)=>Promise<{ok:boolean;refreshed:boolean}>;
 const session={uid:"driver123",idToken:"qa-token"};
 const order={orderId:"order123",action:"claim"};
 const first=assigned(session,order);
 const duplicate=assigned(session,order);
 assert.strictEqual(duplicate,first,"identical pending action shares the same promise");
 await assert.rejects(assigned(session,{...order,action:"depart"}),/Another delivery action/);
 assert.equal(calls,1,"only one network submission");
 resolveResponse?.({ok:true,json:async()=>({ok:true,cloudConfirmed:true})});
 const result=await first;
 assert.equal(result.refreshed,true);
 assert.equal(refreshes,1);
 const second=assigned(session,{...order,action:"depart"});
 assert.equal(calls,2,"settled lock permits the next action");
 resolveResponse?.({ok:true,json:async()=>({ok:false,cloudConfirmed:false})});
 await assert.rejects(second,/Refresh the queue/);
 assert.equal(refreshes,1,"rejected cloud mutation never triggers readback");
 await assert.rejects(assigned(session,{...order,action:"assign"}),/Select a driver/);
 assert.equal(calls,2,"invalid assignment never posts");
 await assert.rejects(assigned(session,{orderId:"bad",action:"claim"}),/valid delivery order/);
 await assert.rejects(assigned(session,{orderId:123456,action:"claim"}),/valid delivery order/);
 await assert.rejects(assigned(session,{...order,action:"assign",driverId:123456}),/valid driver/);
 await assert.rejects(assigned({uid:"",idToken:"qa-token"},order),/Sign in again/);
 await assert.rejects(assigned(null,order),/Sign in again/);
 await assert.rejects(assigned({uid:"driver123",idToken:42},order),/Sign in again/);
 await assert.rejects(assigned(session,null),/valid delivery order/);
 const circularNote:{self?:unknown}={};
 circularNote.self=circularNote;
 const invalidPayload={...order,note:circularNote};
 await assert.rejects(assigned(session,invalidPayload),/unsupported values/);
 assert.equal(calls,2,"unserializable payload cannot contact the server or occupy a custody lock");
 const rewritten={...order,toJSON:()=>({orderId:"otherOrder123",action:"claim"})};
 await assert.rejects(assigned(session,rewritten),/changed during serialization/);
 const redirectedDriver={...order,action:"assign",driverId:"driver123",toJSON:()=>({orderId:"order123",action:"assign",driverId:"attacker123"})};
 await assert.rejects(assigned(session,redirectedDriver),/changed during serialization/);
 const rewrittenNote={...order,action:"note",note:"Correct delivery note",toJSON:()=>({orderId:"order123",action:"note",note:"Forged delivery note"})};
 await assert.rejects(assigned(session,rewrittenNote),/changed during serialization/);
 const originalSignature={recipientName:"Test Recipient",strokes:[[[0,0],[100,100]]]};
 const rewrittenSignature={...order,action:"complete",signature:originalSignature,toJSON:()=>({orderId:"order123",action:"complete",signature:{recipientName:"Other Recipient",strokes:[[[0,0],[100,100]]]}})};
 await assert.rejects(assigned(session,rewrittenSignature),/changed during serialization/);
 assert.equal(calls,2,"custom serialization cannot change driver target, notes or recipient signature");
 const vanished={...order,toJSON:()=>undefined};
 await assert.rejects(assigned(session,vanished),/unsupported values/);
 assert.equal(calls,2,"custom JSON serialization cannot rewrite custody identity or suppress the request body");
 await assert.rejects(assigned(session,{...order,actorUid:"admin123"}),/unsupported values/);\n await assert.rejects(assigned(session,{...order,tenantId:"otherTenant"}),/unsupported values/);\n assert.equal(calls,2,"spoofed actor or tenant metadata never reaches the custody endpoint");\n const extraCircular={...order,unexpected:circularNote};
 await assert.rejects(assigned(session,extraCircular),/unsupported values/);
 await assert.rejects(assigned(session,{...order,unexpected:12n}),/unsupported values/);
 assert.equal(calls,2,"unexpected unserializable fields are rejected before a custody lock or network call");
 await assert.rejects(assigned(session,{...order,action:"note",note:"x"}),/delivery note/);
 await assert.rejects(assigned(session,{...order,action:"release",reason:"short"}),/release reason/);
 await assert.rejects(assigned(session,{...order,action:"complete",signature:{recipientName:"Test Recipient",strokes:[[[0,0],[1001,2]]]}}),/signature is invalid/);
 await assert.rejects(assigned(session,{...order,action:"complete",signature:{recipientName:"",strokes:[[[0,0],[100,100]]]}}),/recipient's name/);
 assert.equal(calls,2,"invalid inputs and signatures never post or occupy a custody lock");
 const pending=assigned(session,order);
 await assert.rejects(assigned({...session,idToken:"rotated-token"},order),/Another delivery action/);
 await assert.rejects(assigned({uid:"otherDriver123",idToken:"other-token"},order),/Another delivery action/);
 assert.equal(calls,3,"switching users cannot race custody transitions for the same order");
 assert.equal(calls,3,"token rotation cannot reuse a pending request from another auth session");
 resolveResponse?.({ok:true,json:async()=>({ok:true,cloudConfirmed:true})});
 await pending;
 // A rejected server response must not be reported as a successful custody change.
 const denied=assigned(session,{...order,action:"depart"});
 assert.equal(calls,4);
 resolveResponse?.({ok:false,json:async()=>({ok:false,cloudConfirmed:false,message:"Permission denied"})});
 await assert.rejects(denied,/Permission denied/);
 assert.equal(refreshes,2,"authorization denial cannot trigger a cloud readback");
 // A successful HTTP status without an explicit cloud acknowledgement is not success.
 const unconfirmed=assigned(session,{...order,action:"depart"});
 assert.equal(calls,5);
 resolveResponse?.({ok:true,json:async()=>({ok:true,cloudConfirmed:false})});
 await assert.rejects(unconfirmed,/Refresh the queue/);
 assert.equal(refreshes,2);
 // Non-JSON gateway responses must be treated as uncertain, never accepted.
 const gateway=assigned(session,{...order,action:"depart"});
 assert.equal(calls,6);
 resolveResponse?.({ok:false,json:async()=>{throw new Error("HTML gateway response");}});
 await assert.rejects(gateway,/Refresh the queue/);
 assert.equal(refreshes,2);
});
