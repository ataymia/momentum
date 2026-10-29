/* eslint-disable max-len,comma-spacing,key-spacing,object-curly-spacing,space-before-blocks,keyword-spacing,curly,brace-style,semi-spacing,arrow-parens,one-var,indent,operator-linebreak,space-before-function-paren */
import {createHash,randomUUID} from "node:crypto";
import {getFirestore} from "firebase-admin/firestore";
type Row=Record<string,unknown>;
const txt=(v:unknown)=>typeof v==="string"?v.trim():"";
const whole=(v:unknown)=>typeof v==="number"&&Number.isInteger(v)&&v>0&&v<=10000;
const idOk=(v:string)=>/^[A-Za-z0-9_-]{8,100}$/.test(v);
const iso=()=>new Date().toISOString();
const cleanName=(v:string)=>v.trim().toLowerCase().replace(/\s+/g," ");
const reserved=/\b(golden\s*eagle|ge[-\s]?(original|sugarfree|tropical|red|blue|strawberry))\b/i;
export class LiveTestProductError extends Error{
  constructor(public readonly status:number,message:string){super(message);}
}
const fail=(status:number,message:string):never=>{
  throw new LiveTestProductError(status,message);
};
const list=(data:FirebaseFirestore.DocumentSnapshot):Row[]=>
  Array.isArray(data.data()?.items)?(data.data()?.items as Row[]):[];
/** Live workspace catalog, deliberately test-only and never sellable.
 * Only the virtual stock register is decremented. Physical inventory shards,
 * commerce, settlements, emails and commissions are never modified here. */
export async function operateLiveTestProduct(uid:string,payload:unknown){
  if(!payload||typeof payload!=="object"||Array.isArray(payload))
    fail(400,"Valid test-product action required.");
  const input=payload as Row,action=txt(input.action),skuId=txt(input.skuId);
  const requestId=txt(input.requestId);
  if(!idOk(skuId)||!skuId.startsWith("qa-live-")||!idOk(requestId))
    fail(400,"Invalid internal test SKU or request identifier.");
  const db=getFirestore(),accessRef=db.doc("userAccess/"+uid);
  const productRef=db.doc("liveTestProducts/"+skuId);
  const stockRef=db.doc("liveTestInventory/"+skuId);
  const receiptRef=db.doc("liveTestReceipts/"+requestId);
  const stamp=iso();
  if(action==="createSku"){
    const description=txt(input.description),shortName=txt(input.shortName);
    const casePack=input.casePack;
    if(input.testOnly!==true||description.length<3||description.length>120||
       shortName.length<2||shortName.length>48||!whole(casePack)||
       !/^(?:QA|TEST)[ -]/i.test(description)||
       reserved.test(description)||reserved.test(shortName))
      fail(400,"Start the name with QA or TEST and enter a valid fictional product and case pack.");
    const nameRef=db.doc("liveTestProductNames/"+
      createHash("sha256").update(cleanName(description)).digest("hex"));
    return db.runTransaction(async tx=>{
      const [access,product,name,stock]=await Promise.all([
        tx.get(accessRef),tx.get(productRef),tx.get(nameRef),tx.get(stockRef)]);
      if(txt(access.data()?.role)!=="Administrator"||
         txt(access.data()?.accountState)!=="Active")
        fail(403,"An active Administrator is required.");
      if(product.exists){
        if(txt(product.data()?.requestId)===requestId&&
           txt(product.data()?.createdBy)===uid)
          return{action,skuId,replayed:true};
        fail(409,"The test SKU identifier already exists.");
      }
      if(name.exists||stock.exists)fail(409,"A test SKU name or stock record already exists.");
      tx.create(productRef,{id:skuId,description,shortName,casePack,
        active:true,testOnly:true,environment:"production",pricePerCase:0,
        createdBy:uid,createdAt:stamp,requestId});
      tx.create(nameRef,{skuId,name:cleanName(description),createdAt:stamp});
      tx.create(stockRef,{skuId,onHand:0,reserved:0,updatedAt:stamp});
      return{action,skuId,replayed:false};
    });
  }
  if(action==="receive"){
    const cases=input.cases;
    if(!whole(cases))fail(400,"Test quantity must be a positive integer.");
    return db.runTransaction(async tx=>{
      const [access,product,stock,receipt]=await Promise.all([
        tx.get(accessRef),tx.get(productRef),tx.get(stockRef),tx.get(receiptRef)]);
      if(txt(access.data()?.role)!=="Administrator"||
         txt(access.data()?.accountState)!=="Active")
        fail(403,"An active Administrator is required.");
      if(product.data()?.testOnly!==true||product.data()?.environment!=="production")
        fail(404,"Live QA product not found.");
      const previous=stock.data();
      if(!previous)throw new LiveTestProductError(409,"Virtual stock record missing.");
      if(receipt.exists){
        if(txt(receipt.data()?.skuId)!==skuId||receipt.data()?.cases!==cases)
          fail(409,"Test receipt identifier conflict.");
        return{action,skuId,replayed:true,onHand:previous.onHand};
      }
      const before=Number(previous.onHand);
      if(!Number.isInteger(before)||before<0||before+Number(cases)>100000)
        fail(409,"Virtual stock counter is invalid or exceeds its limit.");
      tx.update(stockRef,{onHand:before+Number(cases),updatedAt:stamp});
      tx.create(receiptRef,{id:requestId,skuId,cases,actorUid:uid,
        at:stamp,kind:"Virtual test cases; no physical receipt"});
      return{action,skuId,replayed:false,onHand:before+Number(cases)};
    });
  }
  if(action!=="advance"&&action!=="cancel")fail(400,"Unsupported live-test action.");
  const cancelReason=txt(input.reason);
  if(action==="cancel"&&(cancelReason.length<8||cancelReason.length>500))
    fail(400,"Explain why the virtual test order is being cancelled.");
  const orderId=txt(input.orderId);
  if(!idOk(orderId))fail(400,"Choose a valid test order.");
  const ordersRef=db.doc("domains/commercial/fields/orders");
  const reservationRef=db.doc("liveTestOrderReservations/"+orderId);
  const eventRef=db.doc("liveTestOrderEvents/"+requestId);
  const metaRef=db.doc("platform/meta");
  return db.runTransaction(async tx=>{
    const [access,product,stock,orders,reservation,event,meta]=await Promise.all([
      tx.get(accessRef),tx.get(productRef),tx.get(stockRef),tx.get(ordersRef),
      tx.get(reservationRef),tx.get(eventRef),tx.get(metaRef)]);
    if(txt(access.data()?.role)!=="Administrator"||
       txt(access.data()?.accountState)!=="Active")
      fail(403,"Only an active Administrator can advance an internal QA order.");
    if(product.data()?.testOnly!==true||product.data()?.environment!=="production")
      fail(404,"Live QA product is missing.");
    const rows=list(orders);
    const existing=rows.find(r=>txt(r.id)===orderId);
    if(!existing)throw new LiveTestProductError(409,"QA order not found.");
    if(txt(existing.archivedAt))fail(409,"Archived QA orders cannot be advanced or cancelled.");
    if(existing.testOnly!==true||txt(existing.testSkuId)!==skuId||
      existing.amount!==0||existing.pricePerCase!==0||
      !Array.isArray(existing.lines)||existing.lines.length!==1||
      txt((existing.lines[0] as Row).product)!==txt(product.data()?.description))
      fail(409,"Order is not a verified zero-dollar test-only SKU order.");
    if(event.exists){
      if(txt(event.data()?.orderId)===orderId)return{action,orderId,replayed:true,status:event.data()?.status};
      fail(409,"QA transition request identifier already used.");
    }
    const transitions:Record<string,string>={"Approved":"Allocated",
      "Allocated":"Out for delivery","Out for delivery":"Delivered"};
    const oldStatus=txt(existing.status);
    const canCancel=["Approved","Allocated","Out for delivery"].includes(oldStatus);
    const next=action==="cancel"&&canCancel?"Cancelled":transitions[oldStatus];
    if(!next||action==="cancel"&&!canCancel)
      fail(409,"Only an active pre-delivery QA order can be advanced or cancelled.");
    const cases=Number(existing.cases),data=stock.data();
    if(!data)throw new LiveTestProductError(409,"Virtual stock record missing.");
    if(!Number.isInteger(cases)||cases<1||
      !Number.isInteger(data.onHand)||!Number.isInteger(data.reserved))
      fail(409,"Virtual quantity state is invalid.");
    const updated:Row={...data};
    if(oldStatus==="Approved"){
      if(reservation.exists)fail(409,"This order already has a QA reservation.");
      if(action==="advance"){
        if(data.onHand-data.reserved<cases)fail(409,"Not enough virtual test cases.");
        updated.reserved=data.reserved+cases;
        tx.create(reservationRef,{orderId,skuId,cases,status:"Reserved",createdAt:stamp,actorUid:uid});
      }
    }else{
      if(!reservation.exists||reservation.data()?.cases!==cases||
         txt(reservation.data()?.skuId)!==skuId||
         txt(reservation.data()?.status)!=="Reserved")
        fail(409,"Virtual order reservation does not match.");
      if(next==="Delivered"||next==="Cancelled"){
        if(data.reserved<cases||next==="Delivered"&&data.onHand<cases)fail(409,"Virtual QA stock has changed.");
        if(next==="Delivered")updated.onHand=data.onHand-cases;
        updated.reserved=data.reserved-cases;
        tx.update(reservationRef,{status:next==="Delivered"?"Fulfilled":"Released",
          fulfilledAt:stamp,fulfilledBy:uid});
      }
    }
    updated.updatedAt=stamp;
    tx.set(stockRef,updated);
    tx.set(ordersRef,{items:rows.map(r=>txt(r.id)===orderId?
      {...r,status:next,paymentStatus:"Not invoiced",
        ...(next==="Cancelled"?{cancelledAt:stamp,cancelledBy:uid,cancellationReason:cancelReason}:{})}:r)});
    const version=stamp+"#"+randomUUID().slice(0,6);
    const previousVersions=meta.data()?.versions;
    const pathKey="domains_commercial_fields_orders";
    tx.set(metaRef,{versions:{...(previousVersions&&typeof previousVersions==="object"?previousVersions:{}),
      [pathKey]:version}},{merge:true});
    tx.create(eventRef,{id:requestId,orderId,skuId,fromStatus:oldStatus,
      status:next,cases,at:stamp,actorUid:uid,testOnly:true,
      ...(next==="Cancelled"?{reason:cancelReason}:{}),
      realInventoryChanged:false,financialActivity:false});
    return{action,orderId,replayed:false,status:next,onHand:updated.onHand};
  });
}
