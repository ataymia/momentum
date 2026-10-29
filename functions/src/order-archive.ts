/* eslint-disable max-len,comma-spacing,key-spacing,object-curly-spacing,space-before-blocks,keyword-spacing,curly,brace-style,semi-spacing,arrow-parens,one-var,indent,operator-linebreak,space-before-function-paren */
import {randomUUID} from "node:crypto";
import {getFirestore} from "firebase-admin/firestore";
import {orderArchiveBlocker,type ArchiveEvidence} from "./order-archive-policy";

type Row=Record<string,unknown>;
const s=(v:unknown)=>typeof v==="string"?v.trim():"";
const rows=(v:FirebaseFirestore.DocumentSnapshot)=>Array.isArray(v.data()?.items)?
 (v.data()?.items as unknown[]).filter((x):x is Row=>Boolean(x&&typeof x==="object"&&!Array.isArray(x))):[];
const linked=(items:Row[],orderId:string)=>items.filter(x=>s(x.orderId)===orderId||s(x.relatedOrderId)===orderId);
const validId=(v:string)=>/^[a-zA-Z0-9_-]{6,120}$/.test(v);
const paths={
 commercial:"domains/commercial/fields/orders",
 legacy:"domains/workspace/fields/orders",
 approvals:"domains/commercial/fields/approvals",
 legacyApprovals:"domains/workspace/fields/approvals",
 tasks:"domains/delivery/fields/tasks",
 overrides:"domains/delivery/fields/overrides",
 invoices:"domains/commerce/fields/invoices",
 payments:"domains/commerce/fields/payments",
 allocations:"domains/commerce/fields/allocations",
 credits:"domains/commerce/fields/credits",
 refunds:"domains/commerce/fields/refunds",
 journals:"domains/accounting/fields/journals",
 movements:"domains/inventoryLedger/fields/movements",
 reservations:"domains/inventoryLedger/fields/reservations",
} as const;
type PathName=keyof typeof paths;
export class OrderArchiveError extends Error{
 constructor(public readonly status:number,message:string){super(message);}
}
const fail=(status:number,message:string):never=>{throw new OrderArchiveError(status,message);};
function archiveEvidence(order:Row,byName:Record<PathName,Row[]>,corrections:Row[]):ArchiveEvidence{
 const orderId=s(order.id);
 const invoices=linked(byName.invoices,orderId);
 const invoiceIds=new Set(invoices.map(x=>s(x.id)));
 const allocations=byName.allocations.filter(a=>invoiceIds.has(s(a.invoiceId)));
 const paymentIds=new Set(allocations.map(x=>s(x.paymentId)));
 const payments=byName.payments.filter(x=>paymentIds.has(s(x.id))||s(x.orderId)===orderId);
 const credits=byName.credits.filter(x=>invoiceIds.has(s(x.invoiceId)));
 const refunds=byName.refunds.filter(x=>paymentIds.has(s(x.paymentId))||s(x.orderId)===orderId);
 const journals=byName.journals.filter(x=>invoiceIds.has(s(x.invoiceId))||s(x.orderId)===orderId);
 return{order,tasks:linked(byName.tasks,orderId),overrides:linked(byName.overrides,orderId),
  invoices,allocations,credits,refunds,payments,journals,
  movements:linked(byName.movements,orderId),
  reservations:linked(byName.reservations,orderId),
  correctionRequests:corrections};
}
/** Atomically marks an inactive/error order and its linked active records as archived.
 * Historical financial, inventory and delivery evidence is never destroyed. */
export async function archiveOrder(uid:string,payload:unknown){
 if(!payload||typeof payload!=="object"||Array.isArray(payload))fail(400,"Archive request required.");
 const input=payload as Row,orderId=s(input.orderId),reason=s(input.reason),confirmation=s(input.confirmation);
 if(!validId(orderId)||reason.length<12||reason.length>500||confirmation!=="ARCHIVE")
  fail(400,"Choose an order, explain the error (12+ characters), and confirm ARCHIVE.");
 const db=getFirestore(),archiveRef=db.doc("archivedOrders/"+orderId);
 const accessRef=db.doc("userAccess/"+uid),metaRef=db.doc("platform/meta");
 const correctionsRef=db.collection("deliveryCorrectionRequests").where("orderId","==",orderId).limit(40);
 const refs=Object.fromEntries(Object.entries(paths).map(([k,path])=>[k,db.doc(path)])) as Record<PathName,FirebaseFirestore.DocumentReference>;
 const stamped=new Date().toISOString();
 return db.runTransaction(async tx=>{
  // Query reads, idempotency reads and every related shard read occur before writes.
  const [access,existing,meta,...snapshots]=await Promise.all([
   tx.get(accessRef),tx.get(archiveRef),tx.get(metaRef),
   ...Object.values(refs).map(ref=>tx.get(ref))]);
  if(access.data()?.role!=="Administrator"||access.data()?.accountState!=="Active")
   fail(403,"Only an active Administrator may archive an order.");
  if(existing.exists){
   if(s(existing.data()?.archivedBy)===uid)return{orderId,archived:true,replayed:true};
   fail(409,"This order was already archived.");
  }
  const keys=Object.keys(refs) as PathName[];
  const records=Object.fromEntries(keys.map((key,index)=>[key,rows(snapshots[index])])) as Record<PathName,Row[]>;
  const order=records.commercial.find(x=>s(x.id)===orderId)||
   records.legacy.find(x=>s(x.id)===orderId);
  if(!order)fail(404,"Order not found in current production records.");
  const correctionSnapshot=await tx.get(correctionsRef);
  const corrections=correctionSnapshot.docs.map(x=>({...x.data(),id:x.id}));
  const evidence=archiveEvidence(order,records,corrections);
  const blocker=orderArchiveBlocker(evidence);
  if(blocker)fail(409,blocker);
  // Reject ambiguous QA reservations instead of silently leaving virtual stock locked.
  const isTest=order.testOnly===true,skuId=s(order.testSkuId);
  const qaRef=isTest?db.doc("liveTestOrderReservations/"+orderId):null;
  const stockRef=isTest&&skuId?db.doc("liveTestInventory/"+skuId):null;
  const [qaReservation,qaStock]=await Promise.all([
   qaRef?tx.get(qaRef):Promise.resolve(null),
   stockRef?tx.get(stockRef):Promise.resolve(null)]);
  if(isTest&&(!skuId||!stockRef||!qaStock?.exists))fail(409,"QA virtual stock record is missing.");
  const held=qaReservation?.data()?.status==="Reserved";
  const heldCases=Number(qaReservation?.data()?.cases??0);
  const reserved=Number(qaStock?.data()?.reserved??0);
  if(held&&(!Number.isInteger(heldCases)||heldCases<1||reserved<heldCases))
   fail(409,"QA reservation is inconsistent; reconcile virtual stock before archival.");
  const invoiceIds=new Set(evidence.invoices.map(x=>s(x.id)));
  const activeDocumentUpdates:Partial<Record<PathName,Row[]>>={};
  for(const key of ["commercial","legacy"] as const)
   if(records[key].some(x=>s(x.id)===orderId))
    activeDocumentUpdates[key]=records[key].map(x=>s(x.id)===orderId?{
     ...x,archivedAt:stamped,archivedBy:uid,archiveReason:reason}:x);
  for(const key of ["approvals","legacyApprovals"] as const)
   if(records[key].some(x=>s(x.recordId)===orderId))
    activeDocumentUpdates[key]=records[key].map(x=>s(x.recordId)===orderId?{
     ...x,archivedAt:stamped,archiveReason:reason,status:x.status==="Pending"?"Returned":x.status}:x);
  if(evidence.tasks.length)
   activeDocumentUpdates.tasks=records.tasks.map(x=>s(x.orderId)===orderId?{
    ...x,archivedAt:stamped,archiveReason:reason}:x);
  if(evidence.invoices.length)
   activeDocumentUpdates.invoices=records.invoices.map(x=>invoiceIds.has(s(x.id))?{
    ...x,archivedAt:stamped,status:"Void",voidReason:"Archived unfulfilled/error order: "+reason}:x);
  const snapshot={
   orderId,orderNumber:s(order.number),archivedAt:stamped,archivedBy:uid,reason,
   testOnly:isTest,originalOrder:order,
   approvals:[...records.approvals,...records.legacyApprovals].filter(x=>s(x.recordId)===orderId),
   tasks:evidence.tasks,overrides:evidence.overrides,invoices:evidence.invoices,
   payments:evidence.payments,allocations:evidence.allocations,credits:evidence.credits,
   refunds:evidence.refunds,journals:evidence.journals,
   inventoryMovements:evidence.movements,inventoryReservations:evidence.reservations,
   corrections,restorable:false,policyVersion:1,
  };
  tx.create(archiveRef,snapshot);
  const touched:string[]=[];
  for(const [key,list] of Object.entries(activeDocumentUpdates) as Array<[PathName,Row[]]>){
   tx.set(refs[key],{items:list});touched.push(refs[key].path);
  }
  if(held&&qaRef&&stockRef&&qaStock){
   tx.update(stockRef,{reserved:reserved-heldCases,updatedAt:stamped});
   tx.update(qaRef,{status:"Released",releasedAt:stamped,releasedBy:uid,reason:"Administrator archive"});
  }
  const oldVersions=meta.data()?.versions;
  const versions={...(oldVersions&&typeof oldVersions==="object"?oldVersions:{})} as Record<string,string>;
  for(const path of touched)versions[path.replace(/\//g,"_")]=stamped+"#"+randomUUID().slice(0,6);
  tx.set(metaRef,{versions},{merge:true});
  return{orderId,archived:true,replayed:false,recordId:archiveRef.id};
 });
}
