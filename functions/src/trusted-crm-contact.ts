/* eslint-disable max-len, comma-spacing, key-spacing, indent, object-curly-spacing, curly, brace-style, keyword-spacing, arrow-parens, space-before-blocks, one-var, no-control-regex */
import {createHash,randomUUID} from "node:crypto";
import {getFirestore} from "firebase-admin/firestore";

type Row=Record<string,unknown>;
type ContactDetails={name:string;role:string;email:string;phone:string;
 decisionRole:"Decision maker"|"Influencer"|"Billing"|"Operations"|"Other";active:boolean};
type Intent={action:"Create"|"Update";locationId:string;contactId:string;
 expectedRevision:number;contact:ContactDetails};
const idPattern=/^[A-Za-z0-9_-]{1,128}$/;
const retryPattern=/^[A-Za-z0-9_-]{16,80}$/;
const roles=["Administrator","Sales Manager","Sales Representative"];
const decisions=["Decision maker","Influencer","Billing","Operations","Other"];
const txt=(x:unknown)=>typeof x==="string"?x.trim():"";
const object=(x:unknown):x is Row=>Boolean(x&&typeof x==="object"&&!Array.isArray(x));
const rows=(x:Row|undefined):Row[]=>Array.isArray(x?.items)?x.items.filter(object):[];
const hex=(x:unknown)=>createHash("sha256").update(JSON.stringify(x)).digest("hex");

/** Safe, deliberately scoped CRM contact exception. */
export class TrustedCrmContactError extends Error{
 constructor(public readonly status:number,message:string){super(message);}
}
function parse(raw:unknown):Intent{
 if(!object(raw)||Object.keys(raw).some(k=>!["action","locationId","contactId","expectedRevision","contact"].includes(k)))
  throw new TrustedCrmContactError(400,"Unknown contact fields.");
 const action=txt(raw.action),locationId=txt(raw.locationId);
 const contactId=txt(raw.contactId);
 if(!["Create","Update"].includes(action)||!idPattern.test(locationId)||
  (action==="Update"&&!idPattern.test(contactId))||
  (action==="Create"&&contactId!==""))
  throw new TrustedCrmContactError(400,"Invalid contact request.");
 if(action==="Update"&&(typeof raw.expectedRevision!=="number"||!Number.isSafeInteger(raw.expectedRevision)||raw.expectedRevision<0))
  throw new TrustedCrmContactError(400,"Contact revision is missing.");
 if(!object(raw.contact)||Object.keys(raw.contact).some(k=>!["name","role","email","phone","decisionRole","active"].includes(k)))
  throw new TrustedCrmContactError(400,"Unrecognized contact details.");
 const name=txt(raw.contact.name),role=txt(raw.contact.role);
 const email=txt(raw.contact.email).toLowerCase(),phone=txt(raw.contact.phone);
 const decisionRole=txt(raw.contact.decisionRole);
 if(name.length<2||name.length>160||role.length<2||role.length>100||
  email.length>254||phone.length>60||
  (email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))||
  !decisions.includes(decisionRole)||typeof raw.contact.active!=="boolean")
  throw new TrustedCrmContactError(400,"Contact details need correction.");
 if([name,role,email,phone].some(x=>/[\u0000-\u001f\u007f]/.test(x)))
  throw new TrustedCrmContactError(400,"Contact text contains invalid characters.");
 return{action:action as "Create"|"Update",locationId,contactId,
  expectedRevision:action==="Update"?Number(raw.expectedRevision):0,
  contact:{name,role,email,phone,decisionRole:decisionRole as ContactDetails["decisionRole"],
   active:raw.contact.active as boolean}};
}

/** Writes independently edited contact records, not canonical billing identity,
 * orders, bonuses, account ownership or customer invitations.
 */
export async function saveTrustedCrmContact(
 actorUid:string,rawIntent:unknown,rawRequestId:unknown,
):Promise<{contactId:string;revision:number;updatedAt:string;replayed:boolean}>{
 if(!idPattern.test(actorUid)||typeof rawRequestId!=="string"||
   !retryPattern.test(rawRequestId))
  throw new TrustedCrmContactError(400,"Invalid contact request ID.");
 const intent=parse(rawIntent),fingerprint=hex(intent);
 const db=getFirestore();
 const actorRef=db.doc("userAccess/"+actorUid);
 const accountsRef=db.doc("domains/workspace/fields/accounts");
 const contactsRef=db.doc("domains/crm/fields/contacts");
 const keyRef=db.doc("crmContactRequestKeys/"+actorUid+"_"+rawRequestId);
 const metaRef=db.doc("platform/meta");
 return db.runTransaction(async tx=>{
  const [actorSnap,accountsSnap,contactsSnap,keySnap]=await Promise.all([
   tx.get(actorRef),tx.get(accountsRef),tx.get(contactsRef),tx.get(keyRef),
  ]);
  const actor=actorSnap.data(),role=txt(actor?.role);
  if(txt(actor?.accountState)!=="Active"||!roles.includes(role))
   throw new TrustedCrmContactError(403,"Active sales access required.");
  const account=rows(accountsSnap.data()).find(a=>txt(a.id)===intent.locationId);
  if(!account||!txt(account.customerId))
   throw new TrustedCrmContactError(404,"Authorized customer location not found.");
  const ownerUid=txt(account.ownerId);
  if(role==="Sales Representative"&&ownerUid!==actorUid)
   throw new TrustedCrmContactError(403,"Contact is outside your assigned locations.");
  if(role==="Sales Manager"&&ownerUid!==actorUid){
   const owner=ownerUid?(await tx.get(db.doc("userAccess/"+ownerUid))).data():null;
   if(txt(owner?.role)!=="Sales Representative"||txt(owner?.managerId)!==actorUid||
    txt(owner?.accountState)!=="Active"||txt(owner?.team)!=="Sales")
    throw new TrustedCrmContactError(403,"Contact is outside your managed team.");
  }
  if(keySnap.exists){
   const prior=keySnap.data();
   if(txt(prior?.actorUid)!==actorUid||txt(prior?.fingerprint)!==fingerprint)
    throw new TrustedCrmContactError(409,"Request ID conflicts with another contact change.");
   return{contactId:txt(prior?.contactId),revision:Number(prior?.revision),
    updatedAt:txt(prior?.updatedAt),replayed:true};
  }
  const current=rows(contactsSnap.data());
  const previous=intent.action==="Update"?
   current.find(c=>txt(c.id)===intent.contactId):undefined;
  if(intent.action==="Update"&&
   (!previous||txt(previous.locationId)!==intent.locationId||
    txt(previous.customerId)!==txt(account.customerId)||
    txt(previous.createdBy)==="system"||previous.primary===true))
   throw new TrustedCrmContactError(404,"Editable contact not found.");
  const priorRevision=previous?(typeof previous.revision==="number"&&Number.isSafeInteger(previous.revision)?previous.revision:0):0;
  if(previous&&priorRevision!==intent.expectedRevision)
   throw new TrustedCrmContactError(409,"Contact changed. Refresh before updating.");
  if(current.some(c=>txt(c.locationId)===intent.locationId&&
   txt(c.id)!==intent.contactId&&txt(c.name).toLowerCase()===intent.contact.name.toLowerCase()))
   throw new TrustedCrmContactError(409,"A contact with that name already exists at this location.");
  if(intent.action==="Create"&&txt(account.contactName).toLowerCase()===intent.contact.name.toLowerCase())
   throw new TrustedCrmContactError(409,"This person is already the account's primary contact.");
  const updatedAt=new Date().toISOString();
  const contactId=previous?intent.contactId:"contact-"+randomUUID();
  const revision=priorRevision+1;
  const next:Row={
   ...(previous??{}),...intent.contact,id:contactId,
   scope:"Location",customerId:txt(account.customerId),locationId:intent.locationId,
   primary:false,createdAt:txt(previous?.createdAt)||updatedAt,
   createdBy:txt(previous?.createdBy)||actorUid,
   revision,updatedAt,updatedBy:actorUid,
  };
  const contacts=previous?current.map(c=>txt(c.id)===contactId?next:c):[...current,next];
  if(Buffer.byteLength(JSON.stringify({items:contacts}),"utf8")>900000)
   throw new TrustedCrmContactError(409,"Contact register needs maintenance before adding more records.");
  const eventId="crm-contact-"+randomUUID();
  tx.set(contactsRef,{items:contacts});
  tx.create(keyRef,{actorUid,contactId,revision,updatedAt,fingerprint,eventId});
  tx.create(db.doc("crmContactAudit/"+eventId),{
   eventId,actorUid,contactId,locationId:intent.locationId,
   action:intent.action,revision,at:updatedAt,financialPosting:false,
  });
  tx.set(metaRef,{versions:{
   [contactsRef.path.replace(/[^A-Za-z0-9]+/g,"_")]:updatedAt+"#"+randomUUID().slice(0,6),
  }},{merge:true});
  return{contactId,revision,updatedAt,replayed:false};
 });
}
