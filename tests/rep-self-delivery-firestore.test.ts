import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
// The server package is installed after the app's postinstall build. Load it
// only when the emulator test runs, not as a root application dependency.
const require=createRequire(import.meta.url);
const {initializeApp,deleteApp}=require("../functions/node_modules/firebase-admin/app");
const {getFirestore}=require("../functions/node_modules/firebase-admin/firestore");

test("server self-delivery atomically verifies rep, approval, exact custody, signature and no duplicate posting",async()=>{
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST,"Run only against the Firestore emulator.");
  const path=new URL("../functions/src/rep-self-delivery.ts",import.meta.url).href;
  const deliveryModule=await import(path);
  const exportsObject=deliveryModule.default??deliveryModule;
  const commit=exportsObject.commitRepSelfDelivery as (uid:string,body:unknown)=>Promise<{
    taskStatus:string;orderStatus:string;cloudConfirmed:boolean;replayed?:boolean;
  }>;
  const app=initializeApp({projectId:"momentum-rules-test"});
  const db=getFirestore(app);
  const rep="rep-self-owner",stranger="rep-self-stranger",orderId="order-rep-self-1";
  const prefix="domains/";
  try{
    await Promise.all([
      db.doc("userAccess/"+rep).set({role:"Sales Representative",accountState:"Active"}),
      db.doc("userAccess/"+stranger).set({role:"Sales Representative",accountState:"Active"}),
      db.doc(prefix+"commercial/fields/orders").set({items:[{
        id:orderId,number:"GE-REP-001",ownerId:rep,accountId:"acct-rep-1",
        status:"Approved",cases:4,lines:[{product:"Golden Eagle Original",cases:4}],
        paymentStatus:"Not invoiced",amount:96,
      },{
        id:"order-rep-unapproved",number:"GE-REP-002",ownerId:rep,accountId:"acct-rep-1",
        status:"Awaiting approval",cases:4,
        lines:[{product:"Golden Eagle Original",cases:4}],
      }]}),
      db.doc(prefix+"workspace/fields/accounts").set({items:[{id:"acct-rep-1",ownerId:rep,name:"Arizona Store",locationName:"Location 1"}]}),
      db.doc(prefix+"workspace/fields/inventory").set({items:[{
        id:"lot-self-1",product:"Golden Eagle Original",
        bestBy:"2027-12-01",receivedAt:"2026-09-01",status:"Available",
      }]}),
      db.doc(prefix+"inventoryLedger/fields/nodes").set({items:[
        {id:"node-warehouse-main",type:"Warehouse",active:true,name:"Warehouse"},
        {id:"node-user-"+rep,type:"Employee custody",active:true,userId:rep,name:"Rep stock"},
        {id:"node-account-acct-rep-1",type:"Customer",active:true,accountId:"acct-rep-1",name:"Store"},
        {id:"node-external",type:"External",active:true,name:"External"},
      ]}),
      db.doc(prefix+"inventoryLedger/fields/movements").set({items:[{
        id:"opening-self-1",lotId:"lot-self-1",product:"Golden Eagle Original",
        quantity:12,type:"Receipt",fromNodeId:"node-external",
        toNodeId:"node-warehouse-main",reason:"Received",actorId:"system",
      }]}),
      db.doc(prefix+"inventoryLedger/fields/reservations").set({items:[]}),
      db.doc(prefix+"delivery/fields/tasks").set({items:[]}),
      db.doc(prefix+"delivery/fields/overrides").set({items:[]}),
      db.doc(prefix+"periodLocks/fields/locks").set({items:[]}),
    ]);
    await assert.rejects(()=>commit(stranger,{action:"claim",orderId}),/Only orders placed by you/);
    await assert.rejects(()=>commit(rep,{action:"claim",orderId:"order-rep-unapproved"}),/Only currently approved/);
    const claimed=await commit(rep,{action:"claim",orderId});
    assert.equal(claimed.taskStatus,"Accepted");
    await assert.rejects(()=>commit(rep,{action:"depart",orderId}),/Load the exact inventory/);
    const packed=await commit(rep,{action:"pack",orderId});
    assert.equal(packed.orderStatus,"Allocated");
    const loaded=await commit(rep,{action:"load",orderId});
    assert.equal(loaded.taskStatus,"Loaded");
    assert.equal((await commit(rep,{action:"load",orderId})).replayed,true);
    const departed=await commit(rep,{action:"depart",orderId});
    assert.equal(departed.orderStatus,"Out for delivery");
    await assert.rejects(()=>commit(rep,{action:"complete",orderId,signature:{recipientName:"",strokes:[]}}),/handwritten signature|required/);
    const signature={recipientName:"Store Receiver",strokes:[[[50,60],[120,110],[210,65]]]};
    const delivered=await commit(rep,{action:"complete",orderId,signature});
    assert.equal(delivered.orderStatus,"Delivered");
    assert.equal(delivered.taskStatus,"Delivered");
    const verified=await commit(rep,{action:"status",orderId});
    assert.equal(verified.cloudConfirmed,true);
    const again=await commit(rep,{action:"complete",orderId,signature});
    assert.equal(again.replayed,true);
    const taskSnap=await db.doc(prefix+"delivery/fields/tasks").get();
    const task=taskSnap.data()?.items.find((row:{orderId:string})=>row.orderId===orderId);
    assert.equal(task.driverId,rep);
    assert.equal(task.signature.recipientName,"Store Receiver");
    assert.equal(JSON.parse(task.signature.strokesJson)[0].length,3);
    assert.equal(task.history[0].type,"Delivered");
    assert.equal(task.history[0].actorId,rep);
    const movementSnap=await db.doc(prefix+"inventoryLedger/fields/movements").get();
    const deliveryMovements=movementSnap.data()?.items.filter((row:{relatedOrderId:string;type:string})=>
      row.relatedOrderId===orderId&&row.type==="Delivery")||[];
    assert.equal(deliveryMovements.length,1);
    assert.equal(deliveryMovements[0].quantity,4);
    assert.equal(deliveryMovements[0].fromNodeId,"node-user-"+rep);
    assert.equal(deliveryMovements[0].toNodeId,"node-account-acct-rep-1");
    const reservationsSnap=await db.doc(prefix+"inventoryLedger/fields/reservations").get();
    assert.equal(reservationsSnap.data()?.items[0].status,"Fulfilled");
    const ordersSnap=await db.doc(prefix+"commercial/fields/orders").get();
    const savedOrder=ordersSnap.data()?.items.find((row:{id:string})=>row.id===orderId);
    assert.equal(savedOrder.status,"Delivered");
    assert.equal(savedOrder.paymentStatus,"Not invoiced");
    await assert.rejects(()=>commit(stranger,{action:"complete",orderId,signature}),/Only orders placed by you/);
  }finally{await deleteApp(app);}
});
