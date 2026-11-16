/* eslint-disable max-len, comma-spacing, key-spacing, indent, object-curly-spacing, curly, brace-style, keyword-spacing, arrow-parens, space-before-blocks */
import {createHash,randomUUID} from "node:crypto";
import {getFirestore} from "firebase-admin/firestore";

type Row=Record<string,unknown>;
type ContactField=
 "billingContactName"|"billingEmail"|"billingPhone"|
 "accountsPayableContactName"|"accountsPayableEmail"|"accountsPayablePhone"|
 "onboardingPackageStatus";
type UpdateRequest={
 accountId:string;customerId:string;expectedRevision:number;
 patch:Partial<Record<ContactField,string>>;
};
const values=(value:unknown):value is Row=>
 Boolean(value&&typeof value==="object"&&!Array.isArray(value));
const str=(value:unknown)=>typeof value==="string"?value.trim():"";
const rows=(data:Row|undefined)=>Array.isArray(data?.items)?data.items.filter(values):[];
const uid=/^[A-Za-z0-9_-]{3,128}$/;
const retry=/^[A-Za-z0-9_-]{16,80}$/;
const allowed:readonly ContactField[]=[
 "billingContactName","billingEmail","billingPhone",
 "accountsPayableContactName","accountsPayableEmail",
 "accountsPayablePhone","onboardingPackageStatus",
];
const nameFields=new Set(["billingContactName","accountsPayableContactName"]);
const emailFields=new Set(["billingEmail","accountsPayableEmail"]);
const phoneFields=new Set(["billingPhone","accountsPayablePhone"]);

/** Fail closed without returning customer contact details to unauthorized actors. */
export class CustomerContactUpdateError extends Error {
 /** @param {number} status HTTP status.
  * @param {string} message Client-safe refusal.
  */
 constructor(public readonly status:number,message:string){super(message);}
}
/** Parse a revision-checked, nonbinding contact-only request.
 * No tax IDs, verified tax routes, legal names, credit, billing terms, money,
 * or account ownership can be set by this endpoint.
 * @param {unknown} raw Untrusted client request.
 * @return {UpdateRequest} Sanitized contact profile patch.
 */
function parse(raw:unknown):UpdateRequest{
 if(!values(raw)||Object.keys(raw).some(key=>![
  "accountId","customerId","expectedRevision","patch",
 ].includes(key))||!values(raw.patch))
  throw new CustomerContactUpdateError(400,"Invalid contact profile request.");
 const accountId=str(raw.accountId),customerId=str(raw.customerId);
 const expectedRevision=raw.expectedRevision;
 if(!uid.test(accountId)||!uid.test(customerId)||
  typeof expectedRevision!=="number"||
  !Number.isSafeInteger(expectedRevision)||expectedRevision<0||
  expectedRevision>1000000)
  throw new CustomerContactUpdateError(400,"Account reference or expected revision invalid.");
 const keys=Object.keys(raw.patch);
 if(!keys.length||keys.length>allowed.length||
  keys.some(key=>!allowed.includes(key as ContactField)))
  throw new CustomerContactUpdateError(400,"Only ordinary billing/A-P contacts and preparation status may be updated.");
 const patch:Partial<Record<ContactField,string>>={};
 for(const key of keys as ContactField[]){
  if(typeof raw.patch[key]!=="string")
   throw new CustomerContactUpdateError(400,"Contact field must be text.");
  const value=str(raw.patch[key]);
  if(value.length>160||/[\u0000-\u001F\u007F]/.test(value))
   throw new CustomerContactUpdateError(400,"Contact text invalid or too long.");
  if(emailFields.has(key)&&value&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
   throw new CustomerContactUpdateError(400,"Enter a valid billing or accounts-payable email.");
  if(phoneFields.has(key)&&value&&!/^[+()\d .\-xX]{7,40}$/.test(value))
   throw new CustomerContactUpdateError(400,"Enter a standard business contact phone.");
  if(nameFields.has(key)&&value.length>120)
   throw new CustomerContactUpdateError(400,"Contact name exceeds limit.");
  if(key==="onboardingPackageStatus"&&!["Not started","Prepared"].includes(value))
   throw new CustomerContactUpdateError(400,"Only unverified preparation states are allowed.");
  patch[key]=value;
 }
 return {accountId,customerId,expectedRevision,patch};
}
/** Connected account setup safely updates the linked parent customer and
 * appends one source audit event without inventing commercial/legal approvals.
 * Manager edits are restricted to a wholly managed customer location group.
 * @param {string} actorUid Revocation-verified Firebase UID.
 * @param {unknown} raw Contact-only, revision-checked payload.
 * @param {unknown} id Stable retry ID.
 * @return {Promise<Row>} Server-persisted receipt with no contact PII.
 */
export async function updateTrustedCustomerContacts(
 actorUid:string,raw:unknown,id:unknown,
):Promise<Row>{
 if(!uid.test(actorUid)||typeof id!=="string"||!retry.test(id))
  throw new CustomerContactUpdateError(400,"Invalid customer update retry key.");
 const input=parse(raw);
 const fingerprint=createHash("sha256").update(JSON.stringify(input)).digest("hex");
 const db=getFirestore();
 const actorRef=db.doc("userAccess/"+actorUid);
 const accountsRef=db.doc("domains/workspace/fields/accounts");
 const customersRef=db.doc("domains/workspace/fields/customers");
 const activitiesRef=db.doc("domains/workspace/fields/activities");
 const metaRef=db.doc("platform/meta");
 const keyRef=db.doc("customerContactUpdateKeys/"+actorUid+"_"+id);
 return db.runTransaction(async tx=>{
  const [actorSnap,accountsSnap,customersSnap,activitiesSnap,oldKey]=
   await Promise.all([
    tx.get(actorRef),tx.get(accountsRef),tx.get(customersRef),
    tx.get(activitiesRef),tx.get(keyRef),
   ]);
  const actor=actorSnap.data();
  const role=str(actor?.role);
  if(str(actor?.accountState)!=="Active"||
   !["Administrator","Sales Manager"].includes(role))
   throw new CustomerContactUpdateError(403,
    "Only active customer operations leadership can update connected billing contacts.");
  const accounts=rows(accountsSnap.data());
  const customers=rows(customersSnap.data());
  const account=accounts.find(row=>str(row.id)===input.accountId);
  const customer=customers.find(row=>str(row.id)===input.customerId);
  if(!account||!customer||str(account.customerId)!==input.customerId)
   throw new CustomerContactUpdateError(404,"Linked customer profile not found.");
  if(role==="Sales Manager"){
   const group=accounts.filter(row=>str(row.customerId)===input.customerId);
   if(!group.length||group.length>100)
    throw new CustomerContactUpdateError(403,"Shared customer scope needs Administrator review.");
   const others=[...new Set(group.map(row=>str(row.ownerId))
    .filter(owner=>owner&&owner!==actorUid))];
   if(group.some(row=>!str(row.ownerId))||others.length>25)
    throw new CustomerContactUpdateError(403,"Unassigned or cross-territory billing group requires Administrator.");
   const ownerRecords=await Promise.all(others.map(owner=>
    tx.get(db.doc("userAccess/"+owner))));
   if(ownerRecords.some(snap=>
    str(snap.data()?.role)!=="Sales Representative"||
    str(snap.data()?.accountState)!=="Active"||
    str(snap.data()?.team)!=="Sales"||
    str(snap.data()?.managerId)!==actorUid))
    throw new CustomerContactUpdateError(403,"Customer group includes another manager's accounts.");
  }
  if(oldKey.exists){
   const previous=oldKey.data();
   if(str(previous?.fingerprint)!==fingerprint||
    str(previous?.actorUid)!==actorUid||
    str(previous?.customerId)!==input.customerId)
    throw new CustomerContactUpdateError(409,"Customer update key conflicts with a prior request.");
   return{customerId:input.customerId,accountId:input.accountId,
    revision:previous?.revision,updatedAt:str(previous?.updatedAt),replayed:true};
  }
  const revision=typeof customer.contactRevision==="number"?
   customer.contactRevision:0;
  if(!Number.isSafeInteger(revision)||revision<0||revision!==input.expectedRevision)
   throw new CustomerContactUpdateError(409,"Customer profile changed. Refresh before editing.");
  // A contact update may not reset or downgrade any externally reviewed
  // onboarding package. Such a transition needs a dedicated HR/legal reviewer.
  if(input.patch.onboardingPackageStatus!==undefined&&
   !["Not started","Prepared"].includes(
    str(customer.onboardingPackageStatus)||"Not started"))
   throw new CustomerContactUpdateError(409,
    "Existing reviewed package cannot be changed from contact setup.");
  const changed=(Object.keys(input.patch) as ContactField[])
   .filter(key=>str(customer[key])!==input.patch[key]);
  if(!changed.length)
   throw new CustomerContactUpdateError(409,"No new contact changes to save.");
  const now=new Date().toISOString();
  const updated:Row={
   ...customer,...input.patch,contactRevision:revision+1,
   contactUpdatedAt:now,contactUpdatedBy:actorUid,
  };
  if(input.patch.onboardingPackageStatus==="Prepared"){
   updated.onboardingPackagePreparedAt=now;
   updated.onboardingPackagePreparedBy=actorUid;
  }
  if(input.patch.onboardingPackageStatus==="Not started"){
   delete updated.onboardingPackagePreparedAt;
   delete updated.onboardingPackagePreparedBy;
  }
  const nextCustomers=customers.map(row=>
   str(row.id)===input.customerId?updated:row);
  const activities=rows(activitiesSnap.data());
  const activity={id:"act-"+randomUUID(),userId:actorUid,
   accountId:input.accountId,at:now,type:"note",
   title:"Billing and A/P contact preparation updated",
   detail:"Nonbinding contact fields: "+changed.join(", ")+
    ". No tax, credit, order, provider or signature verification."};
  const nextActivities=[activity,...activities];
  if(Buffer.byteLength(JSON.stringify({items:nextCustomers}),"utf8")>900000||
   Buffer.byteLength(JSON.stringify({items:nextActivities}),"utf8")>900000)
   throw new CustomerContactUpdateError(409,"Customer register capacity requires operations review.");
  const eventId=randomUUID();
  tx.set(customersRef,{items:nextCustomers});
  tx.set(activitiesRef,{items:nextActivities});
  tx.set(metaRef,{versions:{
   [customersRef.path.replace(/[^A-Za-z0-9]+/g,"_")]:
    now+"#"+randomUUID().slice(0,6),
   [activitiesRef.path.replace(/[^A-Za-z0-9]+/g,"_")]:
    now+"#"+randomUUID().slice(0,6),
  }},{merge:true});
  tx.create(db.doc("customerContactUpdateAudit/"+eventId),{
   eventId,actorUid,accountId:input.accountId,
   customerId:input.customerId,changedFields:changed,
   beforeRevision:revision,afterRevision:revision+1,at:now,
   legalVerified:false,creditApproved:false,financialPosting:false,
  });
  tx.create(keyRef,{actorUid,customerId:input.customerId,
   accountId:input.accountId,fingerprint,
   revision:revision+1,updatedAt:now,eventId});
  return{customerId:input.customerId,accountId:input.accountId,
   revision:revision+1,updatedAt:now,replayed:false};
 });
}
