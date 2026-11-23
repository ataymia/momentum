/* eslint-disable max-len, comma-spacing, space-before-blocks, indent, keyword-spacing, curly, key-spacing, brace-style, semi-spacing, one-var, space-before-function-paren */
import {randomUUID} from "node:crypto";
import {getFirestore} from "firebase-admin/firestore";
import {lotEligibleForAutomaticDelivery} from "./inventory-lot-quality";

type Row=Record<string,unknown>;
type Action="status"|"claim"|"assign"|"pack"|"load"|"depart"|"complete"|"release"|"note";
type Receipt={orderId:string;orderStatus:string;taskStatus:string;cloudConfirmed:boolean;replayed?:boolean;deliveredAt?:string};
const obj=(value:unknown):value is Row=>Boolean(value&&typeof value==="object"&&!Array.isArray(value));
const txt=(value:unknown)=>typeof value==="string"?value.trim():"";
const num=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)?value:0;
const items=(data:Row|undefined):Row[]=>Array.isArray(data?.items)?data.items.filter(obj):[];
const uid=(prefix:string)=>prefix+"-"+randomUUID();
const at=()=>new Date().toISOString();
const key=(s:string)=>s.trim().toLowerCase().replace(/\s+/g," ");
const paths={
  access:(actor:string)=>"userAccess/"+actor,
  commercial:"domains/commercial/fields/orders",
  workspace:"domains/workspace/fields/orders",
  accounts:"domains/workspace/fields/accounts",
  accountPatches:"domains/commercial/fields/_root",
  lots:"domains/workspace/fields/inventory",
  extraLots:"domains/commercial/fields/inventoryLots",
  tasks:"domains/delivery/fields/tasks",
  overrides:"domains/delivery/fields/overrides",
  movements:"domains/inventoryLedger/fields/movements",
  reservations:"domains/inventoryLedger/fields/reservations",
  nodes:"domains/inventoryLedger/fields/nodes",
  locks:"domains/periodLocks/fields/locks",
  meta:"platform/meta",
};
const warehouse="node-warehouse-main";
const node=(actor:string)=>"node-user-"+actor;
const customerNode=(accountId:string)=>"node-account-"+accountId;
/** A safe server-policy rejection for rep self-delivery requests. */
export class RepSelfDeliveryError extends Error{
  /** @param {number} status HTTP status code.
   * @param {string} message Safe error message. */
  constructor(public readonly status:number,message:string){super(message);}
}
const fail=(code:number,message:string):never=>{throw new RepSelfDeliveryError(code,message);};
const expectedLines=(order:Row)=>{
  // A malformed line must not disappear during filtering: a matching header
  // total is not evidence that every original SKU line was accounted for.
  if(order.lines!==undefined&&(!Array.isArray(order.lines)||!order.lines.length||
      order.lines.some((line:unknown)=>!obj(line))))
    fail(409,"This order has invalid SKU lines. Ask Operations to reconcile it.");
  const raw=Array.isArray(order.lines)?order.lines as Row[]:
    [{product:order.product,cases:order.cases}];
  const out=new Map<string,number>();
  for(const row of raw){
    const name=key(txt(row.product)),cases=num(row.cases);
    if(!name||!Number.isInteger(cases)||cases<=0)fail(409,"This order has invalid SKU quantities. Ask Operations to review it.");
    out.set(name,(out.get(name)??0)+cases);
  }
  const total=[...out.values()].reduce((sum,qty)=>sum+qty,0);
  if(!total||total!==num(order.cases))fail(409,"Order lines and total cases do not match.");
  return out;
};
const matchExpected=(expected:Map<string,number>,entries:Array<{product:string;quantity:number}>)=>{
  const totals=new Map<string,number>();
  for(const entry of entries){
    const product=key(entry.product);
    totals.set(product,(totals.get(product)??0)+entry.quantity);
  }
  return totals.size===expected.size&&[...expected].every(([sku,qty])=>totals.get(sku)===qty);
};
const balance=(moves:Row[],lotId:string,nodeId:string)=>
  moves.filter((row)=>txt(row.lotId)===lotId).reduce((value,row)=>
    value+(txt(row.toNodeId)===nodeId?num(row.quantity):0)-
    (txt(row.fromNodeId)===nodeId?num(row.quantity):0),0);
const activeReserved=(rows:Row[],lotId:string,exceptOrderId?:string)=>
  rows.filter((row)=>txt(row.lotId)===lotId&&txt(row.status)==="Active"&&
    (!exceptOrderId||txt(row.orderId)!==exceptOrderId))
    .reduce((sum,row)=>sum+num(row.quantity),0);
const event=(actor:string,type:string,note?:string)=>({
  id:uid("rep-delivery-event"),type,at:at(),actorId:actor,...(note?{note}:{}),
});
const signatureDraft=(value:unknown)=>{
  if(!obj(value)||!Array.isArray(value.strokes))return fail(400,"The customer's handwritten signature is required.");
  const strokes=value.strokes;
  if(!strokes.length||strokes.length>80)fail(400,"Invalid recipient signature. Please sign again.");
  let count=0;
  for(const stroke of strokes){
    if(!Array.isArray(stroke)||stroke.length<2||stroke.length>300)fail(400,"Signature stroke is invalid.");
    count+=stroke.length;
    if(!stroke.every((pt:unknown)=>Array.isArray(pt)&&pt.length===2&&
      pt.every((v:unknown)=>typeof v==="number"&&Number.isFinite(v))&&
      pt[0]>=0&&pt[0]<=1000&&pt[1]>=0&&pt[1]<=300))fail(400,"Signature points are invalid.");
  }
  if(count<2||count>1200)fail(400,"Please sign again using shorter strokes.");
  const name=txt(value.recipientName);
  if(!name||name.length>120)fail(400,"Enter the name of the person receiving the order.");
  return {strokes,name};
};
/**
 * Server-only, atomic, role-restricted rep delivery. The browser is never
 * granted write access to the shared delivery or inventory ledger arrays.
 * @param {string} actor Authenticated Firebase UID.
 * @param {unknown} body Untrusted action request.
 * @return {Promise<Receipt>} Confirmed server state.
 */
export async function commitRepSelfDelivery(actor:string,body:unknown):Promise<Receipt>{
  return commitDelivery(actor,body,false);
}
/** Assigned driver workflow, with authorization distinct from rep self-delivery. */
export async function commitAssignedDelivery(actor:string,body:unknown):Promise<Receipt>{
  return commitDelivery(actor,body,true);
}
async function commitDelivery(actor:string,body:unknown,assigned:boolean):Promise<Receipt>{
  if(!actor||!obj(body))return fail(400,"Invalid self-delivery request.");
  const action=txt(body.action) as Action;
  const orderId=txt(body.orderId);
  if(!(assigned?["status","claim","assign","pack","load","depart","complete","release","note"]:["status","claim","pack","load","depart","complete"]).includes(action)||
     !/^[A-Za-z0-9_-]{5,120}$/.test(orderId))fail(400,"Invalid order or self-delivery step.");
  const proof=action==="complete"?signatureDraft(body.signature):undefined;
  const db=getFirestore();
  const allPaths=[paths.access(actor),paths.commercial,paths.workspace,paths.accounts,paths.accountPatches,paths.lots,
    paths.extraLots,paths.tasks,paths.overrides,paths.movements,paths.reservations,paths.nodes,paths.locks];
  const refs=allPaths.map((path)=>db.doc(path));
  const meta=db.doc(paths.meta);
  return db.runTransaction(async(tx)=>{
    // All transaction reads precede writes, including access revocation/locks.
    const snapshots=await Promise.all(refs.map((ref)=>tx.get(ref)));
    const saved=new Map(allPaths.map((path,index)=>[path,snapshots[index].data() as Row|undefined]));
    const rows=(path:string)=>items(saved.get(path));
    const access=saved.get(paths.access(actor));
    const role=txt(access?.role);
    const management=assigned&&["Administrator","Operations"].includes(role);
    const driver=assigned&&role==="Delivery Driver";
    if(txt(access?.accountState)!=="Active"||!(assigned?(management||driver):role==="Sales Representative"))fail(403,"An active authorized delivery role is required.");
    if(assigned&&action==="assign"&&!management)fail(403,"Only Operations or Administrator may assign a driver.");
    if(assigned&&action==="claim"&&!driver)fail(403,"Only a driver may claim a delivery.");
    if(assigned&&action==="complete"&&!driver)fail(403,"Recipient proof must be captured by the assigned driver.");

    const commercial=rows(paths.commercial),workspace=rows(paths.workspace);
    const order=commercial.find((item)=>txt(item.id)===orderId)||
      workspace.find((item)=>txt(item.id)===orderId);
    if(!order)return fail(404,"Order not found.");
    if(assigned&&order.testOnly===true)fail(403,"Test-only orders cannot enter the ordinary driver workflow.");
    if(!assigned&&txt(order.ownerId)!==actor)fail(403,"Only orders placed by you qualify for self-delivery.");
    const copy=commercial.find((item)=>txt(item.id)===orderId);
    const second=workspace.find((item)=>txt(item.id)===orderId);
    if(copy&&second&&(txt(copy.status)!==txt(second.status)||
       txt(copy.accountId)!==txt(second.accountId)||num(copy.cases)!==num(second.cases)))
      fail(409,"Order registers disagree. Ask Operations to reconcile this order.");
    const accountId=txt(order.accountId);
    const account=rows(paths.accounts).find((item)=>txt(item.id)===accountId);
    const rootData=saved.get(paths.accountPatches)?.data;
    const accountPatches=obj(rootData)&&obj(rootData.accountPatches)?
      rootData.accountPatches as Row:{};
    const patch=accountPatches[accountId];
    const effectiveOwner=obj(patch)&&typeof patch.ownerId==="string"?
      txt(patch.ownerId):txt(account?.ownerId);
    if(!account||(!assigned&&effectiveOwner!==actor))
      return fail(403,"This account is no longer assigned to you for self-delivery.");

    const tasks=rows(paths.tasks),overrides=rows(paths.overrides);
    if(overrides.some((row)=>txt(row.orderId)===orderId))
      fail(409,"This order already has an administrative delivery record.");
    const active=tasks.filter((row)=>txt(row.orderId)===orderId&&txt(row.status)!=="Cancelled");
    if(active.length>1)fail(409,"Duplicate delivery assignments require Operations reconciliation.");
    const task=active[0];
    // A driver may claim an unassigned order, but must not probe the status
    // of another driver's order or an unassigned order by guessing its ID.
    if(assigned&&driver&&action==="status"&&(!task||txt(task.driverId)!==actor))
      fail(403,"Only the assigned driver may inspect this delivery.");
    if(task&&txt(task.driverId)!==actor&&!management)
      fail(409,"Another delivery person has this order. Ask Operations before proceeding.");
    const chosen=action==="assign"?txt(body.driverId):task?txt(task.driverId):actor;
    if(assigned&&action==="assign"&&(!/^[A-Za-z0-9_-]{1,128}$/.test(chosen)||chosen===actor))fail(400,"Choose an eligible driver.");
    if(assigned&&(task||action==="assign")){
      if(!chosen||chosen.includes("/"))fail(409,"Invalid assigned driver.");
      const driverAccess=(await tx.get(db.doc(paths.access(chosen)))).data();
      if(txt(driverAccess?.accountState)!=="Active"||txt(driverAccess?.role)!=="Delivery Driver")fail(409,"Assigned delivery driver is not active; Operations must reconcile.");
    }
    if(assigned&&management&&!task&&!["status","assign"].includes(action))fail(409,"Assign a driver first.");
    if(assigned&&driver&&!task&&!["status","claim"].includes(action))fail(409,"Claim this delivery before changing it.");
    const custodian=assigned?chosen:actor;
    const status=txt(order.status),taskStatus=txt(task?.status);
    const response=(oStatus=status,tStatus=taskStatus,stamp?:string,replayed?:boolean):Receipt=>({
      orderId,orderStatus:oStatus,taskStatus:tStatus||"Unclaimed",
      cloudConfirmed:true,...(stamp?{deliveredAt:stamp}:{}),...(replayed?{replayed:true}:{}),
    });
    if(action==="status"){
      if(status==="Delivered"&&taskStatus==="Delivered"){
        const signed=obj(task?.signature)&&typeof task.signature.strokesJson==="string"&&
          task.signature.strokesJson.length>5&&
          txt(task.signature.capturedBy)===custodian&&
          Array.isArray(task?.history)&&task.history.some((entry)=>
            obj(entry)&&txt(entry.type)==="Delivered"&&txt(entry.actorId)===custodian);
        const posted=rows(paths.movements).filter((entry)=>
          txt(entry.relatedOrderId)===orderId&&txt(entry.type)==="Delivery");
        const correctInventory=matchExpected(expectedLines(order),posted.map((entry)=>({
          product:txt(entry.product),quantity:num(entry.quantity),
        })))&&posted.every((entry)=>txt(entry.fromNodeId)===node(custodian)&&
          txt(entry.toNodeId)===customerNode(accountId));
        if(!signed||!correctInventory)return {...response(),cloudConfirmed:false};
      }
      return response();
    }
    if(status==="Cancelled"||status==="Draft"||status==="Awaiting approval"||status==="Paid"||
       !["Approved","Allocated","Out for delivery","Delivered"].includes(status))
      fail(409,"Only currently approved, unpaid orders can enter self-delivery.");

    const stamp=at(),today=new Intl.DateTimeFormat("en-US",{
      timeZone:"America/Phoenix",year:"numeric",month:"2-digit",day:"2-digit",
    }).formatToParts(new Date());
    const date=(name:string)=>today.find((part)=>part.type===name)?.value||"";
    const localDay=date("year")+"-"+date("month")+"-"+date("day");
    if(rows(paths.locks).some((row)=>txt(row.domain)==="Inventory"&&!row.releasedAt&&
      txt(row.startDate)<=localDay&&txt(row.endDate)>=localDay))
      fail(409,"Inventory period is locked. Contact Operations.");
    const movements=rows(paths.movements),reservations=rows(paths.reservations);
    const existingDelivery=movements.filter((row)=>txt(row.relatedOrderId)===orderId&&txt(row.type)==="Delivery");
    const touched=new Map<string,Row[]>();
    const set=(path:string,entries:Row[])=>touched.set(path,entries);
    const changedOrder=(next:string)=>{
      if(copy)set(paths.commercial,commercial.map((row)=>txt(row.id)===orderId?{...row,status:next}:row));
      if(second)set(paths.workspace,workspace.map((row)=>txt(row.id)===orderId?{...row,status:next}:row));
    };
    const newTask=(next:Row)=>set(paths.tasks,[...tasks.filter((row)=>txt(row.id)!==txt(next.id)),next]);
    const updateTask=(next:string,type:string,extra:Row={})=>{
      if(!task)fail(409,"Claim this delivery before continuing.");
      const nextTask={...task,...extra,status:next,history:[
        event(actor,type),...(Array.isArray(task.history)?task.history:[]),
      ]};
      newTask(nextTask);
    };
    const lots=new Map<string,Row>();
    for(const lot of [...rows(paths.lots),...rows(paths.extraLots)])lots.set(txt(lot.id),lot);
    const nodes=rows(paths.nodes);
    const staffNode=node(custodian),locationNode=customerNode(accountId);
    const getNode=(id:string)=>nodes.find((row)=>txt(row.id)===id);
    const expected=expectedLines(order);
    const activeForOrder=reservations.filter((row)=>txt(row.orderId)===orderId&&txt(row.status)==="Active");
    const anyOrderTransfer=movements.filter((row)=>txt(row.relatedOrderId)===orderId&&
      txt(row.type)==="Transfer");
    const loaded=anyOrderTransfer.filter((row)=>txt(row.fromNodeId)===warehouse&&
      txt(row.toNodeId)===staffNode);
    const conflictingTransfers=anyOrderTransfer.length!==loaded.length;
    const loadedCases=loaded.map((movement)=>({
      product:txt(lots.get(txt(movement.lotId))?.product),quantity:num(movement.quantity),
    }));
    if(action==="note"){
      const note=txt(body.note);
      if(!task||note.length<3||note.length>500)fail(400,"Enter a delivery note of 3–500 characters.");
      const last=Array.isArray(task.history)?task.history[0]:undefined;
      if(task.note===note&&obj(last)&&last.actorId===actor)return response(status,taskStatus,undefined,true);
      newTask({...task,note,history:[event(actor,"Note",note),...(Array.isArray(task.history)?task.history:[])]});
    }else if(action==="release"){
      const reason=txt(body.reason);
      if(reason.length<8||reason.length>500)fail(400,"Enter a release reason of 8–500 characters.");
      if(!task||taskStatus!=="Accepted"||!["Approved","Allocated"].includes(status)||anyOrderTransfer.length||existingDelivery.length)fail(409,"Only an unloaded assignment can be released.");
      if(status==="Allocated"){
        const planned=activeForOrder.map((r)=>({product:txt(lots.get(txt(r.lotId))?.product),quantity:num(r.quantity)}));
        if(!matchExpected(expected,planned))fail(409,"Reservations require reconciliation before release.");
        set(paths.reservations,reservations.map((r)=>txt(r.orderId)===orderId&&txt(r.status)==="Active"?{...r,status:"Released",releasedAt:stamp}:r));
        changedOrder("Approved");
      }else if(activeForOrder.length)fail(409,"Unexpected reservation requires reconciliation.");
      newTask({...task,status:"Cancelled",cancelledAt:stamp,cancelledBy:actor,history:[event(actor,"Cancelled",reason),...(Array.isArray(task.history)?task.history:[])]});
    }else if(action==="claim"||action==="assign"){
      if(task&&txt(task.driverId)===custodian&&taskStatus==="Accepted"&&status==="Approved")return response(status,"Accepted",undefined,true);
      if(task||status!=="Approved"||activeForOrder.length||anyOrderTransfer.length||existingDelivery.length)
        fail(409,"This order is already assigned or in fulfillment. Ask Operations to review it.");
      const fresh={id:uid("rep-delivery"),orderId,driverId:custodian,status:"Accepted",
        acceptedAt:stamp,acceptedBy:actor,history:[event(actor,action==="assign"?"Assigned":"Accepted",assigned?"Delivery driver assigned or claimed approved order.":"Sales Rep claimed own approved order.")],collections:[]};
      set(paths.tasks,[fresh,...tasks]);
    }else if(action==="pack"){
      if(taskStatus!=="Accepted")fail(409,"Claim your own delivery before reserving inventory.");
      if(status==="Allocated"&&activeForOrder.length){
        const reserved=activeForOrder.map((row)=>({
          product:txt(lots.get(txt(row.lotId))?.product),quantity:num(row.quantity),
        }));
        if(!matchExpected(expected,reserved))
          fail(409,"Existing reservations do not match the exact ordered SKUs and cases.");
        return response("Allocated","Accepted",undefined,true);
      }
      if(status!=="Approved"||activeForOrder.length||anyOrderTransfer.length||existingDelivery.length)
        fail(409,"Inventory has previous movements or reservations. Operations must reconcile it.");
      const availableLots=[...lots.values()].filter((lot)=>lotEligibleForAutomaticDelivery(lot,localDay))
        .sort((a,b)=>(txt(a.bestBy)||"9999").localeCompare(txt(b.bestBy)||"9999")||
          txt(a.receivedAt).localeCompare(txt(b.receivedAt)));
      const additions:Row[]=[];
      for(const [product,required] of expected){
        let remaining=required;
        for(const lot of availableLots.filter((row)=>key(txt(row.product))===product)){
          const lotId=txt(lot.id);
          const already=additions.filter((row)=>txt(row.lotId)===lotId).reduce((sum,row)=>sum+num(row.quantity),0);
          const balanceAvailable=balance(movements,lotId,warehouse)-
            activeReserved(reservations,lotId)-already;
          const quantity=Math.min(remaining,Math.max(0,balanceAvailable));
          if(quantity<=0)continue;
          additions.push({id:uid("rep-reservation"),orderId,lotId,quantity,status:"Active",createdAt:stamp,createdBy:actor});
          remaining-=quantity;
          if(remaining===0)break;
        }
        if(remaining>0)fail(409,"Not enough available sellable warehouse inventory for "+product+".");
      }
      set(paths.reservations,[...additions,...reservations]);
      changedOrder("Allocated");
      updateTask("Accepted","Note",{note:"Exact SKU quantities reserved for self-delivery."});
    }else if(action==="load"){
      if(taskStatus==="Loaded"&&status==="Allocated"&&matchExpected(expected,loadedCases))
        return response(status,"Loaded",undefined,true);
      if(taskStatus!=="Accepted"||status!=="Allocated"||anyOrderTransfer.length||existingDelivery.length)
        fail(409,"The order must be reserved and not previously loaded.");
      if(!getNode(warehouse))fail(409,"Warehouse location is missing.");
      const savedStaffNode=getNode(staffNode);
      if(savedStaffNode&&(txt(savedStaffNode.type)!=="Employee custody"||
          txt(savedStaffNode.userId)!==custodian))
        fail(409,"Rep inventory custody node is invalid.");
      if(!savedStaffNode){
        set(paths.nodes,[...nodes,{id:staffNode,name:assigned?"Delivery driver custody":"Sales Rep custody",
          type:"Employee custody",active:true,userId:custodian}]);
      }
      const planned=activeForOrder.map((reservation)=>({
        product:txt(lots.get(txt(reservation.lotId))?.product),quantity:num(reservation.quantity),
      }));
      if(!activeForOrder.length||!matchExpected(expected,planned))
        fail(409,"Reservations do not match the exact ordered SKUs and cases.");
      for(const reservation of activeForOrder){
        const lotId=txt(reservation.lotId),quantity=num(reservation.quantity),lot=lots.get(lotId);
        if(!lot||!lotEligibleForAutomaticDelivery(lot,localDay)||!Number.isInteger(quantity)||quantity<=0||
          balance(movements,lotId,warehouse)-activeReserved(reservations,lotId,orderId)<quantity)
          fail(409,"Warehouse cannot safely transfer the reserved cases.");
      }
      const adds=activeForOrder.map((reservation):Row=>({
        id:uid("rep-load"),lotId:txt(reservation.lotId),
        product:txt(lots.get(txt(reservation.lotId))?.product),
        quantity:num(reservation.quantity),type:"Transfer",fromNodeId:warehouse,toNodeId:staffNode,
        relatedOrderId:orderId,reason:assigned?"Assigned delivery loaded stock":"Sales Rep self-delivery loaded stock",at:stamp,actorId:actor,
      }));
      set(paths.movements,[...adds,...movements]);
      updateTask("Loaded","Loaded",{loadedAt:stamp});
    }else if(action==="depart"){
      if(taskStatus==="In transit"&&status==="Out for delivery")
        return response(status,"In transit",undefined,true);
      if(taskStatus!=="Loaded"||status!=="Allocated")
        fail(409,"Load the exact inventory before starting delivery.");
      if(conflictingTransfers||!matchExpected(expected,loadedCases)||existingDelivery.length)
        fail(409,"Driver custody does not match the ordered SKU quantities.");
      for(const movement of loaded)if(balance(movements,txt(movement.lotId),staffNode)<num(movement.quantity))
        fail(409,"Rep custody is missing stock. Ask Operations to reconcile it.");
      changedOrder("Out for delivery");
      updateTask("In transit","Departed",{departedAt:stamp});
    }else if(action==="complete"){
      if(taskStatus==="Delivered"&&status==="Delivered"){
        const savedSignature=task?.signature;
        const sameProof=obj(savedSignature)&&savedSignature.strokesJson===JSON.stringify(proof!.strokes)&&txt(savedSignature.recipientName)===proof!.name&&txt(savedSignature.capturedBy)===actor;
        const posted=matchExpected(expected,existingDelivery.map((m)=>({product:txt(m.product),quantity:num(m.quantity)})))&&existingDelivery.every((m)=>txt(m.fromNodeId)===staffNode&&txt(m.toNodeId)===locationNode);
        if(!sameProof||!posted)fail(409,"Existing signed delivery evidence differs or requires reconciliation; do not sign again.");
        return response("Delivered","Delivered",txt(task?.deliveredAt),true);
      }
      if(taskStatus!=="In transit"||status!=="Out for delivery"||!task?.loadedAt||!task?.departedAt)
        fail(409,"Only an in-transit, fully loaded self-delivery can be completed.");
      if(existingDelivery.length||conflictingTransfers||!matchExpected(expected,loadedCases))
        fail(409,"Existing delivery posting or incomplete SKU load requires Operations reconciliation.");
      const savedLocation=getNode(locationNode);
      if(savedLocation&&(txt(savedLocation.type)!=="Customer"||
        txt(savedLocation.accountId)!==accountId))
        fail(409,"Customer inventory node is invalid.");
      if(!savedLocation){
        set(paths.nodes,[...nodes,{id:locationNode,name:txt(account.locationName)||txt(account.name),
          type:"Customer",active:true,accountId}]);
      }
      for(const movement of loaded){
        if(balance(movements,txt(movement.lotId),staffNode)<num(movement.quantity))
          fail(409,"Insufficient rep custody balance for the full order.");
      }
      if(loaded.some((movement)=>!lotEligibleForAutomaticDelivery(lots.get(txt(movement.lotId))??{},localDay)))
        fail(409,"A loaded lot lacks current best-by or quality clearance. Refer to Operations.");
      const posted=loaded.map((movement):Row=>({
        id:uid("rep-delivered"),lotId:txt(movement.lotId),product:txt(movement.product),
        quantity:num(movement.quantity),type:"Delivery",fromNodeId:staffNode,toNodeId:locationNode,
        relatedOrderId:orderId,reason:assigned?"Signed assigned delivery":"Signed Sales Rep self-delivery",at:stamp,actorId:actor,
      }));
      set(paths.movements,[...posted,...movements]);
      set(paths.reservations,reservations.map((row)=>txt(row.orderId)===orderId&&
        txt(row.status)==="Active"?{...row,status:"Fulfilled",fulfilledAt:stamp}:row));
      const deliveredEvent=event(actor,"Delivered",assigned?"Recipient signed assigned delivery.":"Recipient signed Sales Rep self-delivery.");
      const signature={strokesJson:JSON.stringify(proof!.strokes),recipientName:proof!.name,
        signedAt:stamp,capturedBy:actor};
      // The invoice trigger reads the same signed-delivery task and validates
      // the signature against this Delivered event before queuing any email.
      newTask({...task,status:"Delivered",deliveredAt:stamp,signature,history:[
        {...deliveredEvent,at:stamp},...(Array.isArray(task.history)?task.history:[]),
      ]});
      changedOrder("Delivered");
    }
    if(!touched.size)fail(409,"Delivery stage was not updated.");
    for(const [path,records] of touched)tx.set(db.doc(path),{items:records});
    const version=stamp+"#"+randomUUID().slice(0,6);
    const versions:Record<string,string>={};
    for(const path of touched.keys())versions[path.replace(/[^A-Za-z0-9]+/g,"_")]=version;
    tx.set(meta,{versions},{merge:true});
    return response(
      action==="pack"?"Allocated":action==="depart"?"Out for delivery":action==="complete"?"Delivered":action==="release"?"Approved":status,
      action==="claim"||action==="assign"||action==="pack"?"Accepted":action==="load"?"Loaded":action==="depart"?"In transit":action==="release"?"Cancelled":action==="note"?taskStatus:"Delivered",
      action==="complete"?stamp:undefined,
    );
  });
}
