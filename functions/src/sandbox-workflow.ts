/* eslint-disable max-len,comma-spacing,key-spacing,object-curly-spacing,indent,space-before-blocks,keyword-spacing,curly,brace-style,semi */
import {getFirestore} from "firebase-admin/firestore";
import {createHash} from "node:crypto";

type Row=Record<string,unknown>;
const text=(v:unknown)=>typeof v==="string"?v.trim():"";
const qty=(v:unknown)=>typeof v==="number"&&Number.isInteger(v)&&v>0&&v<=10000;
const idOk=(v:string)=>/^[A-Za-z0-9_-]{8,128}$/.test(v);
const now=()=>new Date().toISOString();
const normalizedName=(v:string)=>v.trim().toLowerCase().replace(/\s+/g," ");
const reservedName=/\b(golden\s*eagle|ge[-\s]?(original|sugarfree|tropical|red|blue|strawberry))\b/i;


export class SandboxWorkflowError extends Error{
  constructor(public readonly status:number,message:string){super(message);}
}
const fail=(status:number,message:string):never=>{throw new SandboxWorkflowError(status,message)};

export async function commitSandboxAction(uid:string,payload:unknown){
  if(!payload||typeof payload!=="object"||Array.isArray(payload))fail(400,"Sandbox action required.");
  const input=payload as Row,action=text(input.action),skuId=text(input.skuId);
  if(!idOk(skuId)||!skuId.startsWith("qa-"))fail(400,"Choose a valid sandbox test SKU.");
  const requestId=text(input.requestId);
  if(!idOk(requestId))fail(400,"Unique sandbox request ID required.");
  if(!["createSku","receive","place","deliver"].includes(action))
    fail(400,"Choose a supported sandbox test action.");
  const db=getFirestore(),accessRef=db.doc("userAccess/"+uid);
  const stamp=now();
  if(action==="createSku"){
    // The server is the only writer of SKU metadata and its unique-name index.
    // Never create real products, inventory or financial records from this action.
    const description=text(input.description),shortName=text(input.shortName);
    const casePack=input.casePack;
    if(input.environment!=="sandbox"||description.length<3||description.length>120||
       shortName.length<2||shortName.length>48||
       typeof casePack!=="number"||!Number.isInteger(casePack)||casePack<1||casePack>1000||
       reservedName.test(description)||reservedName.test(shortName))
      fail(400,"Enter a valid fictional test SKU, short label and case pack.");
    const normalized=normalizedName(description);
    const nameId=createHash("sha256").update(normalized).digest("hex");
    const nameRef=db.doc("sandboxProductNames/"+nameId);
    const productRef=db.doc("sandboxProducts/"+skuId);
    return db.runTransaction(async tx=>{
      const [access,product,name]=await Promise.all([
        tx.get(accessRef),tx.get(productRef),tx.get(nameRef),
      ]);
      if(text(access.data()?.role)!=="Administrator"||text(access.data()?.accountState)!=="Active")
        fail(403,"Only an active Administrator can create test SKUs.");
      if(product.exists){
        const prior=product.data();
        if(text(prior?.createdBy)!==uid||text(prior?.requestId)!==requestId||
           normalizedName(text(prior?.description))!==normalized||prior?.casePack!==casePack)
          fail(409,"A different SKU already uses this identifier.");
        return{action,skuId,replayed:true};
      }
      if(name.exists)fail(409,"A sandbox SKU already uses this product name.");
      tx.create(productRef,{id:skuId,description,shortName,casePack,
        active:true,environment:"sandbox",createdBy:uid,createdAt:stamp,requestId});
      tx.create(nameRef,{skuId,descriptionNormalized:normalized,createdAt:stamp});
      return{action,skuId,replayed:false};
    });
  }
  const productRef=db.doc("sandboxProducts/"+skuId);
  const stockRef=db.doc("sandboxInventory/"+skuId);
  const orderId=text(input.orderId);
  const orderRef=db.doc("sandboxOrders/"+(action==="deliver"?orderId:requestId));
  const receiptRef=db.doc("sandboxStockReceipts/"+requestId);
  const invoiceRef=db.doc("sandboxInvoices/"+(action==="deliver"?orderId:requestId));
  return db.runTransaction(async tx=>{
    const [access,sku,stock,receipt,order,invoice]=await Promise.all([
      tx.get(accessRef),tx.get(productRef),tx.get(stockRef),
      tx.get(receiptRef),tx.get(orderRef),tx.get(invoiceRef),
    ]);
    if(text(access.data()?.role)!=="Administrator"||text(access.data()?.accountState)!=="Active")
      fail(403,"Only an active Administrator can use the sandbox.");
    if(!sku.exists||sku.data()?.environment!=="sandbox"||sku.data()?.active!==true)
      fail(404,"The test SKU is unavailable.");
    const previous=stock.data();
    const onHand=typeof previous?.onHand==="number"?previous.onHand:0;
    const cases=Number(input.cases);
    if(action==="receive"){
      if(receipt.exists){
        if(text(receipt.data()?.skuId)!==skuId)fail(409,"Sandbox receipt ID conflict.");
        return{action,skuId,onHand,replayed:true};
      }
      if(!qty(cases)||onHand+cases>100000)
        fail(400,"Enter a positive simulated case quantity within the sandbox limit.");
      tx.set(stockRef,{skuId,onHand:onHand+cases,updatedAt:stamp});
      tx.create(receiptRef,{id:requestId,skuId,cases,actorUid:uid,createdAt:stamp,
        kind:"Sandbox stock only"});
      return{action,skuId,onHand:onHand+cases,replayed:false};
    }
    if(action==="place"){
      if(order.exists){
        const prior=order.data();
    if(!prior)throw new SandboxWorkflowError(409,"Sandbox order data is missing.");
        if(text(prior?.skuId)!==skuId||Number(prior?.cases)!==cases)
          fail(409,"Sandbox test order ID conflict.");
        return{action,skuId,orderId:requestId,replayed:true};
      }
      if(!qty(cases)||cases>onHand)
        fail(409,"Not enough simulated test stock for this sandbox order.");
      tx.create(orderRef,{id:requestId,skuId,cases,status:"Placed",
        createdAt:stamp,createdBy:uid,environment:"sandbox",
        paid:false,invoiceSent:false,commissionEligible:false});
      return{action,skuId,orderId:requestId,replayed:false};
    }
    if(!idOk(orderId))fail(400,"Select an existing sandbox order.");
    if(!order.exists)fail(404,"Sandbox order not found.");
    const prior=order.data();
    if(!prior)throw new SandboxWorkflowError(409,"Sandbox order data is missing.");
    if(text(prior?.skuId)!==skuId)fail(409,"Sandbox order SKU mismatch.");
    if(text(prior?.status)==="Delivered")
      return{action,skuId,orderId,replayed:true};
    if(text(prior?.status)!=="Placed"||!qty(prior?.cases))
      fail(409,"Only placed sandbox orders may be simulated as delivered.");
    if(Number(prior.cases)>onHand)
      fail(409,"Simulated test stock is insufficient to deliver this sandbox order.");
    if(invoice.exists)fail(409,"A sandbox invoice already exists for this order.");
    tx.set(stockRef,{skuId,onHand:onHand-Number(prior.cases),updatedAt:stamp});
    tx.update(orderRef,{status:"Delivered",deliveredAt:stamp,deliveredBy:uid});
    tx.create(invoiceRef,{id:orderId,skuId,orderId,
      number:"TEST-"+orderId,caseCount:Number(prior.cases),
      status:"SIMULATION ONLY",amount:0,createdAt:stamp,
      paymentEligible:false,emailSent:false,environment:"sandbox"});
    return{action,skuId,orderId,onHand:onHand-Number(prior.cases),replayed:false};
  });
}
