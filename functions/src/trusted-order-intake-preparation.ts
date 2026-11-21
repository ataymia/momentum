/* eslint-disable max-len, comma-spacing, key-spacing, indent, object-curly-spacing, curly, brace-style, keyword-spacing, arrow-parens, space-before-blocks, operator-linebreak, one-var */
import {getFirestore,type Transaction,type Firestore} from "firebase-admin/firestore";
import {OrderIntakeError,type OrderIntakeRecord} from "./trusted-order-intake";

type Row=Record<string,unknown>;
type Terms="COD"|"Prepaid"|"Net 7"|"Net 15"|"Net 30"|"Custom";
type ManualTerms={pricePerCase:number;terms:Terms;priceEvidence:string};
export type Preparation={status:"Prepared"|"Needs pricing";orderId?:string;invoiceId?:string;message:string;replayed?:boolean};
const row=(v:unknown):v is Row=>Boolean(v&&typeof v==="object"&&!Array.isArray(v));
const string=(v:unknown)=>typeof v==="string"?v.trim():"";
const list=(v:unknown,name:string):Row[]=>{
 if(v===undefined)return[];
 if(!Array.isArray(v)||v.some(item=>!row(item)))throw new OrderIntakeError(409,name+" requires source reconciliation.");
 return v;
};
const priceCents=(v:unknown)=>typeof v==="number"&&Number.isSafeInteger(Math.round(v*100))&&v>0&&Math.abs(v*100-Math.round(v*100))<0.0001?Math.round(v*100):null;
const idPattern=/^intake-[0-9a-f-]{36}$/;
const termsOptions=new Set<Terms>(["COD","Prepaid","Net 7","Net 15","Net 30","Custom"]);
const arizonaToday=()=>{
 const values=new Intl.DateTimeFormat("en-US",{timeZone:"America/Phoenix",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
 const get=(type:string)=>values.find(part=>part.type===type)?.value??"";
 return get("year")+"-"+get("month")+"-"+get("day");
};
export function parseManualPreparation(raw:unknown):ManualTerms|null{
 if(raw===null||raw===undefined)return null;
 if(!row(raw)||Object.keys(raw).some(k=>!["pricePerCase","terms","priceEvidence"].includes(k)))
  throw new OrderIntakeError(400,"Invalid order preparation details.");
 const terms=string(raw.terms) as Terms;
 const evidence=string(raw.priceEvidence);
 if(!priceCents(raw.pricePerCase)||!termsOptions.has(terms)||evidence.length<10||evidence.length>240)
  throw new OrderIntakeError(400,"Enter the confirmed case price, payment terms and pricing evidence (10–240 characters).");
 return{pricePerCase:raw.pricePerCase as number,terms,priceEvidence:evidence};
}
/** Prepare one canonical order plus one INTERNAL draft invoice atomically.
 * Source prices are never inferred from product catalog or provisional partner tiers.
 * Auto-preparation uses only an explicitly ACTIVE account program and verified terms.
 * @param {Transaction} tx The same Firestore transaction as the approval decision.
 * @param {Firestore} db Project database.
 * @param {OrderIntakeRecord} intake Trusted approved source.
 * @param {string} actor Reviewer identity.
 * @param {ManualTerms|null} manual Explicit documented price/terms, if needed.
 * @return {Promise<Preparation>} Durable reference or actionable pricing hold.
 */
export async function prepareApprovedIntakeInTransaction(
 tx:Transaction,db:Firestore,intake:OrderIntakeRecord,actor:string,manual:ManualTerms|null,
):Promise<Preparation>{
 if(intake.status!=="Approved"||!idPattern.test(intake.id))
  throw new OrderIntakeError(409,"Only a source-approved request may become an order.");
 const idsuffix=intake.id.slice(7);
 const orderId="ord-intake-"+idsuffix;
 const invoiceId="invoice-"+orderId;
 const orderRef=db.doc("domains/commercial/fields/orders");
 const invoiceRef=db.doc("domains/commerce/fields/invoices");
 const accountsRef=db.doc("domains/workspace/fields/accounts");
 const customersRef=db.doc("domains/workspace/fields/customers");
 const rootRef=db.doc("domains/commercial/fields/_root");
 const ownerRef=db.doc("userAccess/"+intake.ownerAtSubmission);
 const requesterRef=db.doc("userAccess/"+intake.requestedByUid);
 const [ordersSnap,invoicesSnap,accountsSnap,customersSnap,rootSnap,ownerSnap,requesterSnap]=await Promise.all([
  tx.get(orderRef),tx.get(invoiceRef),tx.get(accountsRef),tx.get(customersRef),
  tx.get(rootRef),tx.get(ownerRef),tx.get(requesterRef),
 ]);
 const orders=list(ordersSnap.data()?.items,"Sales orders");
 const invoices=list(invoicesSnap.data()?.items,"Invoices");
 const currentOrder=orders.find(o=>o.id===orderId||o.sourceIntakeId===intake.id);
 const currentInvoice=invoices.find(i=>i.id===invoiceId||i.sourceIntakeId===intake.id);
 if(currentOrder||currentInvoice){
  if(!currentOrder||!currentInvoice||currentOrder.id!==orderId||
    currentInvoice.id!==invoiceId||currentOrder.accountId!==intake.accountId||
    currentInvoice.orderId!==orderId||currentInvoice.accountId!==intake.accountId)
   throw new OrderIntakeError(409,"This approved request has a partial or conflicting order/invoice. Reconciliation required.");
  return{status:"Prepared",orderId,invoiceId,message:"Order and draft invoice already exist.",replayed:true};
 }
 const accounts=list(accountsSnap.data()?.items,"Customer accounts");
 const customers=list(customersSnap.data()?.items,"Customers");
 const base=accounts.find(a=>a.id===intake.accountId);
 if(!base)throw new OrderIntakeError(409,"Customer account was removed or changed. Reconcile the request.");
 const root=row(rootSnap.data()?.data)?rootSnap.data()!.data as Row:{};
 const patches=row(root.accountPatches)?root.accountPatches as Row:{};
 const patch=row(patches[intake.accountId])?patches[intake.accountId] as Row:{};
 const account={...base,...patch};
 if(string(base.customerId)!==intake.customerId)
  throw new OrderIntakeError(409,"Original customer ownership changed. Reconcile before preparing an invoice.");
 const customerBase=customers.find(c=>c.id===intake.customerId);
 const customerPatches=row(root.customerPatches)?root.customerPatches as Row:{};
 const customerPatch=row(customerPatches[intake.customerId])?customerPatches[intake.customerId] as Row:{};
 const customer={...customerBase,...customerPatch};
 const ownerStatus=ownerSnap.data(),requesterStatus=requesterSnap.data();
 const owner=string(account.ownerId);
 const validOwner=owner===intake.ownerAtSubmission&&ownerStatus?.accountState==="Active"&&
  ["Administrator","Sales Manager","Sales Representative"].includes(string(ownerStatus.role));
 if(!validOwner)return{status:"Needs pricing",message:"Assign an active sales owner to the customer before preparing the order."};
 const creditedRepId=requesterStatus?.role==="Sales Representative"&&requesterStatus?.accountState==="Active"?intake.requestedByUid:undefined;
 const day=arizonaToday();
 const programPrice=priceCents(account.programPricePerCase);
 const activeProgram=account.programPricingStatus==="Active"&&programPrice!==null&&
  (typeof account.programPricingEffectiveDate!=="string"||account.programPricingEffectiveDate<=day)&&
  (typeof account.programPricingExpirationDate!=="string"||account.programPricingExpirationDate>=day)&&
  string(account.programPricingLabel).length>=3;
 const customerTerms=string(customer.paymentTerms);
 const trustedTerms:Terms|null=customerTerms==="COD"?"COD":
  customerTerms==="Net 30"&&customer.creditStatus==="Net 30 Approved"?"Net 30":null;
 const unitCents=manual?priceCents(manual.pricePerCase):activeProgram?programPrice:null;
 const terms=manual?.terms??trustedTerms;
 if(manual?.terms==="Net 30"&&customer.creditStatus!=="Net 30 Approved")
  throw new OrderIntakeError(409,"Net 30 requires a recorded approved credit decision.");
 if(manual?.terms==="Custom"&&!string(customer.customPaymentTerms))
  throw new OrderIntakeError(409,"Custom terms must be documented in the customer record.");
 if(!unitCents||!terms)return{status:"Needs pricing",message:"Confirm the authorized price per case and payment terms before creating the order and invoice."};
 if(!Array.isArray(intake.lines)||intake.lines.length<1||intake.lines.length>12||
   intake.lines.some(l=>!Number.isSafeInteger(l.cases)||l.cases<1||l.cases>10000||!string(l.description)))
  throw new OrderIntakeError(409,"Original request quantities or SKU identities need reconciliation.");
 const count=intake.lines.reduce((sum,l)=>sum+l.cases,0);
 if(count!==intake.totalCases||count>10000)throw new OrderIntakeError(409,"Request case totals differ from source lines.");
 const totalCents=count*unitCents;
 if(!Number.isSafeInteger(totalCents)||totalCents>10000000000)
  throw new OrderIntakeError(409,"Invoice total exceeds supported limits.");
 const amount=totalCents/100,price=unitCents/100;
 const stamp=new Date().toISOString();
 const number="GE-"+idsuffix.slice(0,8).toUpperCase()+"-"+idsuffix.slice(-4).toUpperCase();
 const orderLines=intake.lines.map((l,i)=>({
  id:orderId+"-line-"+(i+1),product:l.description,cases:l.cases,
  pricePerCase:price,amount:l.cases*unitCents/100,inventoryAvailableAtOrder:0,
  lowStockApprovalRequired:true,
 }));
 const order={id:orderId,number,sourceIntakeId:intake.id,accountId:intake.accountId,cases:count,
  pricePerCase:price,amount,status:"Approved",placedAt:day,ownerId:owner,
  ...(creditedRepId?{creditedRepId}:{}),
  product:orderLines.length===1?orderLines[0].product:"Multiple products",
  priceBasis:manual?"Admin-confirmed price: "+manual.priceEvidence:"Active account program: "+string(account.programPricingLabel),
  paymentStatus:"Not invoiced",inventoryAvailableAtOrder:0,lowStockApprovalRequired:true,lines:orderLines};
 const invoice={id:invoiceId,number:"INV-"+number.replace(/^GE-/,""),sourceIntakeId:intake.id,
  orderId,accountId:intake.accountId,issuedAt:stamp,createdAt:stamp,terms,
  total:amount,status:"Draft",linesSnapshot:orderLines.map(l=>({
   id:l.id,product:l.product,cases:l.cases,pricePerCase:l.pricePerCase,amount:l.amount,
  }))};
 if(JSON.stringify([...orders,order]).length>700000||JSON.stringify([...invoices,invoice]).length>700000)
  throw new OrderIntakeError(409,"Order or invoice register capacity requires reconciliation.");
 tx.set(orderRef,{items:[...orders,order]},{merge:true});
 tx.set(invoiceRef,{items:[...invoices,invoice]},{merge:true});
 tx.set(db.doc("platform/meta"),{versions:{
  domains_commercial_fields_orders:stamp,
  domains_commerce_fields_invoices:stamp,
 }},{merge:true});
 return{status:"Prepared",orderId,invoiceId,
  message:"Sales order and linked internal draft invoice prepared. Inventory, tax and customer issuance require separate verification."};
}
/** Repair an already approved request without creating duplicate orders.
 * @param {string} uid Verified Administrator UID.
 * @param {unknown} id Source request.
 * @param {unknown} raw Manual pricing evidence.
 * @return {Promise<Preparation>} Saved references or pricing hold.
 */
export async function prepareTrustedApprovedIntake(uid:string,id:unknown,raw:unknown):Promise<Preparation>{
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(uid)||typeof id!=="string"||!idPattern.test(id))
  throw new OrderIntakeError(400,"Invalid approved request identifier.");
 const manual=parseManualPreparation(raw);
 const db=getFirestore();
 return db.runTransaction(async tx=>{
  const [access,intakeSnap]=await Promise.all([
   tx.get(db.doc("userAccess/"+uid)),tx.get(db.doc("commerceOrderIntakes/"+id)),
  ]);
  if(access.data()?.role!=="Administrator"||access.data()?.accountState!=="Active")
   throw new OrderIntakeError(403,"Active Administrator approval required.");
  if(!intakeSnap.exists)throw new OrderIntakeError(404,"Request not found.");
  const record=intakeSnap.data() as OrderIntakeRecord;
  if(record.status!=="Approved")throw new OrderIntakeError(409,"Request has not been approved.");
  const result=await prepareApprovedIntakeInTransaction(tx,db,record,uid,manual);
  if(result.status==="Prepared")tx.update(intakeSnap.ref,{
   preparationStatus:"Prepared",orderId:result.orderId,invoiceId:result.invoiceId,
   preparedAt:new Date().toISOString(),preparedBy:uid,
  });
  return result;
 });
}
