import {randomUUID} from "node:crypto";
import {getFirestore} from "firebase-admin/firestore";

type Entry={lotId:string;fromNodeId:string;quantity:number};
type BusinessRecord=Record<string,unknown>;
const isObject=(value:unknown):value is BusinessRecord=>
  Boolean(value&&typeof value==="object"&&!Array.isArray(value));
const txt=(v:unknown)=>typeof v==="string"?v.trim():"";
const items=(doc:BusinessRecord|undefined)=>
  Array.isArray(doc?.items)?doc.items.filter(isObject):[] as BusinessRecord[];
const key=(value:string)=>value.trim().toLowerCase();

export class DeliveryOverrideError extends Error {
  constructor(public readonly status:number,message:string){super(message);}
}
const fail=(status:number,message:string):never=>{throw new DeliveryOverrideError(status,message);};

export async function commitAdminDeliveryOverride(
  actorId:string,body:unknown,
):Promise<{orderId:string;deliveredAt:string;movementIds:string[]}>{
  if(!isObject(body))return fail(400,"Delivery details are missing.");
  const orderId=txt(body.orderId);
  const reason=txt(body.reason);
  const performedBy=txt(body.performedBy);
  const deliveredAt=txt(body.deliveredAt);
  const stamp=new Date().toISOString();
  const date=Date.parse(deliveredAt);
  if(!orderId||reason.length<5||reason.length>500||!performedBy||
    !Number.isFinite(date)||date>Date.now()+300000)
    return fail(400,"Enter an eligible order, actual delivery time, who delivered it and a clear reason.");
  if(!Array.isArray(body.allocations)||!body.allocations.length||body.allocations.length>100)
    return fail(400,"Choose the inventory lots and source locations actually delivered.");
  const allocations:Entry[]=[];
  for(const raw of body.allocations){
    if(!isObject(raw)||!txt(raw.lotId)||!txt(raw.fromNodeId)||
      !Number.isInteger(raw.quantity)||Number(raw.quantity)<=0)
      return fail(400,"Each lot needs a valid source and positive whole-case quantity.");
    allocations.push({
      lotId:txt(raw.lotId),fromNodeId:txt(raw.fromNodeId),
      quantity:Number(raw.quantity),
    });
  }
  const firestore=getFirestore();
  const prefix="domains/";
  const commercialRef=firestore.doc(prefix+"commercial/fields/orders");
  const workspaceRef=firestore.doc(prefix+"workspace/fields/orders");
  const accountsRef=firestore.doc(prefix+"workspace/fields/accounts");
  const workspaceLotsRef=firestore.doc(prefix+"workspace/fields/inventory");
  const extraLotsRef=firestore.doc(prefix+"commercial/fields/inventoryLots");
  const movementsRef=firestore.doc(prefix+"inventoryLedger/fields/movements");
  const nodesRef=firestore.doc(prefix+"inventoryLedger/fields/nodes");
  const reservationsRef=firestore.doc(prefix+"inventoryLedger/fields/reservations");
  const tasksRef=firestore.doc(prefix+"delivery/fields/tasks");
  const overridesRef=firestore.doc(prefix+"delivery/fields/overrides");
  const activityRef=firestore.doc(prefix+"commercial/fields/activities");
  const auditRef=firestore.collection("adminDeliveryOverrides").doc(orderId);
  const metaRef=firestore.doc("platform/meta");
  return firestore.runTransaction(async(tx)=>{
    const [commercialSnap,workspaceSnap,accountsSnap,workspaceLotsSnap,
      extraLotsSnap,movementsSnap,nodesSnap,reservationsSnap,tasksSnap,
      overridesSnap,activitySnap,auditSnap]=await Promise.all([
      tx.get(commercialRef),tx.get(workspaceRef),tx.get(accountsRef),
      tx.get(workspaceLotsRef),tx.get(extraLotsRef),tx.get(movementsRef),
      tx.get(nodesRef),tx.get(reservationsRef),tx.get(tasksRef),
      tx.get(overridesRef),tx.get(activityRef),tx.get(auditRef),
    ]);
    if(auditSnap.exists)return fail(409,"This order already has an administrative delivery override.");
    const commercialOrders=items(commercialSnap.data());
    const workspaceOrders=items(workspaceSnap.data());
    const order=commercialOrders.find((row)=>txt(row.id)===orderId)??
      workspaceOrders.find((row)=>txt(row.id)===orderId);
    if(!order)return fail(404,"Order was not found in the shared order register.");
    const status=txt(order.status);
    if(!["Approved","Allocated","Out for delivery","Paid"].includes(status))
      return fail(409,"Only approved or fulfillment-stage orders can be delivered by override.");
    const placedAt=Date.parse(txt(order.placedAt));
    if(Number.isFinite(placedAt)&&date<placedAt)
      return fail(400,"Delivery time cannot be before the order was placed.");
    const accountId=txt(order.accountId);
    const account=items(accountsSnap.data()).find((row)=>txt(row.id)===accountId);
    if(!account)return fail(409,"The account location is missing. Reconcile it first.");
    const expected=new Map<string,number>();
    const lines=Array.isArray(order.lines)&&order.lines.length?
      order.lines.filter(isObject):[{
        product:order.product,cases:order.cases,
      } as BusinessRecord];
    for(const line of lines){
      const product=key(txt(line.product));
      const quantity=Number(line.cases);
      if(!product||!Number.isInteger(quantity)||quantity<=0)
        return fail(409,"The order's SKU lines are incomplete. Repair them before delivery.");
      expected.set(product,(expected.get(product)??0)+quantity);
    }
    const lots=new Map<string,BusinessRecord>();
    for(const lot of [...items(workspaceLotsSnap.data()),
      ...items(extraLotsSnap.data())])lots.set(txt(lot.id),lot);
    const nodes=items(nodesSnap.data());
    const sourceNodes=new Map(nodes.map((node)=>[txt(node.id),node]));
    const movements=items(movementsSnap.data());
    if(movements.some((movement)=>txt(movement.relatedOrderId)===orderId&&
      txt(movement.type)==="Delivery"))
      return fail(409,"A delivery movement already exists. Reconcile it instead of posting another.");
    if(!movements.length)
      return fail(409,"The inventory movement ledger is empty. Operations must reconcile stock first.");
    const customerNodeId="node-account-"+accountId;
    const customerNode=sourceNodes.get(customerNodeId);
    const nextNodes=customerNode?nodes:[...nodes,{
      id:customerNodeId,name:(txt(account.locationName)||txt(account.name))+
        " customer location",type:"Customer",active:true,accountId,
    }];
    if(customerNode&&txt(customerNode.type)!=="Customer")
      return fail(409,"The customer custody location is invalid.");
    const observed=new Map<string,number>();
    const movementsToAdd:BusinessRecord[]=[];
    const working=movements.slice();
    for(const entry of allocations){
      const lot=lots.get(entry.lotId);
      const source=sourceNodes.get(entry.fromNodeId);
      if(!lot||txt(lot.status)==="Quality hold"||!source||
        source.active!==true||
        !["Warehouse","Vehicle","Bin","Employee custody"].includes(txt(source.type)))
        return fail(409,"A selected inventory lot or source cannot be used for delivery.");
      const product=key(txt(lot.product));
      if(!expected.has(product))
        return fail(409,"A selected inventory lot does not match an ordered SKU.");
      const available=working
        .filter((row)=>txt(row.lotId)===entry.lotId)
        .reduce((sum,row)=>sum+
          (txt(row.toNodeId)===entry.fromNodeId?Number(row.quantity)||0:0)-
          (txt(row.fromNodeId)===entry.fromNodeId?Number(row.quantity)||0:0),0);
      if(available+0.0001<entry.quantity)
        return fail(409,"The selected source does not have the recorded stock. Reconcile custody first.");
      observed.set(product,(observed.get(product)??0)+entry.quantity);
      const movement={
        id:"admin-delivery-"+randomUUID(),lotId:entry.lotId,
        product:txt(lot.product),quantity:entry.quantity,type:"Delivery",
        fromNodeId:entry.fromNodeId,toNodeId:customerNodeId,
        relatedOrderId:orderId,reason:"Admin delivery override: "+reason,
        at:deliveredAt,actorId,
      };
      movementsToAdd.push(movement);
      working.push(movement);
    }
    if([...expected].some(([product,quantity])=>observed.get(product)!==quantity)||
      observed.size!==expected.size)
      return fail(409,"Posted case quantities must exactly match every ordered SKU.");
    const overridden={
      id:"admin-override-"+randomUUID(),orderId,actorId,
      recordedAt:stamp,deliveredAt,performedBy,reason,
      movementIds:movementsToAdd.map((row)=>txt(row.id)),
      kind:"Admin override",status:"Delivered",
    };
    const nextOrder=(entry:BusinessRecord)=>({
      ...entry,status:"Delivered",paymentStatus:txt(entry.paymentStatus)==="Not invoiced"?
        "Open":entry.paymentStatus,
    });
    const transactionWrites=[
      movementsRef.path,overridesRef.path,commercialRef.path,
      activityRef.path,
    ];
    tx.set(movementsRef,{items:[...movementsToAdd,...movements]});
    tx.set(overridesRef,{items:[overridden,...items(overridesSnap.data())]});
    if(!customerNode){tx.set(nodesRef,{items:nextNodes});transactionWrites.push(nodesRef.path);}
    if(commercialOrders.some((entry)=>txt(entry.id)===orderId)){
      tx.set(commercialRef,{items:commercialOrders.map((entry)=>
        txt(entry.id)===orderId?nextOrder(entry):entry)});
    }else{
      // Legacy order imported into the original shared workspace domain.
      tx.set(workspaceRef,{items:workspaceOrders.map((entry)=>
        txt(entry.id)===orderId?nextOrder(entry):entry)});
      transactionWrites.splice(transactionWrites.indexOf(commercialRef.path),1);
      transactionWrites.push(workspaceRef.path);
    }
    const tasks=items(tasksSnap.data());
    const existingTask=tasks.find((entry)=>txt(entry.orderId)===orderId&&
      txt(entry.status)!=="Cancelled");
    if(existingTask){
      if(txt(existingTask.status)==="Delivered")
        return fail(409,"The delivery driver has already recorded this delivery.");
      const closed={
        ...existingTask,status:"Cancelled",cancelledAt:stamp,
        cancelledBy:actorId,
        note:"Delivery completed outside assigned driver route: "+reason,
        history:[...Array.isArray(existingTask.history)?
          existingTask.history:[],{
          id:"admin-close-"+randomUUID(),type:"Cancelled",
          at:stamp,actorId,note:"Admin override ended driver assignment: "+reason,
        }],
      };
      tx.set(tasksRef,{items:tasks.map((entry)=>
        txt(entry.id)===txt(existingTask.id)?closed:entry)});
      transactionWrites.push(tasksRef.path);
    }
    const reservations=items(reservationsSnap.data());
    if(reservations.some((row)=>txt(row.orderId)===orderId&&
      txt(row.status)==="Active")){
      tx.set(reservationsRef,{items:reservations.map((row)=>
        txt(row.orderId)===orderId&&txt(row.status)==="Active"?
          {...row,status:"Fulfilled",fulfilledAt:stamp}:row)});
      transactionWrites.push(reservationsRef.path);
    }
    const activities=items(activitySnap.data());
    tx.set(activityRef,{items:[{
      id:"act-admin-delivery-"+randomUUID(),accountId,
      type:"order",title:"Administrative delivery override",
      detail:"Order "+txt(order.number)+" delivered by "+performedBy+
        ". Approved by Administrator. Reason: "+reason,
      at:stamp,userId:actorId,
    },...activities]});
    tx.create(auditRef,overridden);
    const version=stamp+"#"+randomUUID().slice(0,6);
    const versions:Record<string,string>={};
    for(const path of transactionWrites){
      versions[path.replace(/[^A-Za-z0-9]+/g,"_")]=version;
    }
    tx.set(metaRef,{versions},{merge:true});
    return {orderId,deliveredAt,movementIds:overridden.movementIds};
  });
}
