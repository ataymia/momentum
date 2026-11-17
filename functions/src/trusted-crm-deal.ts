/* eslint-disable max-len, comma-spacing, key-spacing, indent, object-curly-spacing, curly, brace-style, keyword-spacing, arrow-parens, space-before-blocks, one-var, no-control-regex */
import {createHash,randomUUID} from "node:crypto";
import {getFirestore} from "firebase-admin/firestore";

type Row=Record<string,unknown>;
const txt=(x:unknown)=>typeof x==="string"?x.trim():"";
const record=(x:unknown):x is Row=>Boolean(x&&typeof x==="object"&&!Array.isArray(x));
const rows=(x:Row|undefined):Row[]=>Array.isArray(x?.items)?x.items.filter(record):[];
const idPattern=/^[A-Za-z0-9_-]{1,128}$/;
const keyPattern=/^[A-Za-z0-9_-]{16,80}$/;
const stages=["Prospecting","Qualified","Sample / evaluation","Commercial review","Order pending","Won","Lost"] as const;
type Stage=typeof stages[number];
type Details={name:string;stage:Stage;estimatedCases?:number;expectedCloseDate:string;
 nextAction:string;nextActionDate:string;lossReason:string};
type Intent={action:"Create"|"Update";locationId:string;dealId:string;
 expectedRevision:number;details:Details};
const sha=(x:unknown)=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
const dateValid=(x:string)=>!x||/^\d{4}-\d{2}-\d{2}$/.test(x)&&
 !Number.isNaN(Date.parse(x))&&new Date(x+"T00:00:00.000Z").toISOString().slice(0,10)===x;

/** Typed refusals from the trusted opportunity transaction. */
export class TrustedCrmDealError extends Error{
 constructor(public readonly status:number,message:string){super(message);}
}
function parse(raw:unknown):Intent{
 if(!record(raw)||Object.keys(raw).some(k=>!["action","locationId","dealId","expectedRevision","details"].includes(k)))
  throw new TrustedCrmDealError(400,"Unexpected opportunity fields.");
 const action=txt(raw.action),locationId=txt(raw.locationId),dealId=txt(raw.dealId);
 if(!["Create","Update"].includes(action)||!idPattern.test(locationId)||
  (action==="Create"&&dealId!=="")||
  (action==="Update"&&(!idPattern.test(dealId)||typeof raw.expectedRevision!=="number"||
   !Number.isSafeInteger(raw.expectedRevision)||raw.expectedRevision<0)))
  throw new TrustedCrmDealError(400,"Invalid opportunity request.");
 if(!record(raw.details)||Object.keys(raw.details).some(k=>!
   ["name","stage","estimatedCases","expectedCloseDate","nextAction","nextActionDate","lossReason"].includes(k)))
  throw new TrustedCrmDealError(400,"Unexpected opportunity details.");
 const name=txt(raw.details.name),stage=txt(raw.details.stage);
 const expectedCloseDate=txt(raw.details.expectedCloseDate);
 const nextAction=txt(raw.details.nextAction);
 const nextActionDate=txt(raw.details.nextActionDate);
 const lossReason=txt(raw.details.lossReason);
 const estimatedCases=raw.details.estimatedCases;
 if(name.length<3||name.length>160||!stages.includes(stage as Stage)||
   (action==="Create"&&(stage==="Won"||stage==="Lost"))||
   nextAction.length>240||lossReason.length>500||!dateValid(expectedCloseDate)||
   !dateValid(nextActionDate)||(!["Won","Lost"].includes(stage)&&
    (!nextAction||!nextActionDate))||(stage==="Lost"&&lossReason.length<3)||
   (estimatedCases!==undefined&&(typeof estimatedCases!=="number"||
    !Number.isSafeInteger(estimatedCases)||estimatedCases<0||estimatedCases>100000000))||
   [name,nextAction,lossReason].some(s=>/[\u0000-\u001f\u007f]/.test(s)))
  throw new TrustedCrmDealError(400,"Enter a valid stage, forecast, next action and follow-up date.");
 return{action:action as "Create"|"Update",locationId,dealId,
  expectedRevision:action==="Update"?Number(raw.expectedRevision):0,
  details:{name,stage:stage as Stage,estimatedCases:estimatedCases as number|undefined,
   expectedCloseDate,nextAction,nextActionDate,lossReason}};
}

/** Server-owned opportunity writes. Won is explicitly a CRM status, not cash, order or stock. */
export async function saveTrustedCrmDeal(
 actorUid:string,raw:unknown,requestId:unknown,
):Promise<{dealId:string;revision:number;updatedAt:string;replayed:boolean}>{
 if(!idPattern.test(actorUid)||typeof requestId!=="string"||!keyPattern.test(requestId))
  throw new TrustedCrmDealError(400,"Invalid opportunity request ID.");
 const intent=parse(raw),fingerprint=sha(intent),db=getFirestore();
 const actorRef=db.doc("userAccess/"+actorUid);
 const accountRef=db.doc("domains/workspace/fields/accounts");
 const dealsRef=db.doc("domains/crm/fields/opportunities");
 const keyRef=db.doc("crmDealRequestKeys/"+actorUid+"_"+requestId);
 return db.runTransaction(async tx=>{
  const [actorSnap,accountSnap,dealsSnap,priorSnap]=await Promise.all([
   tx.get(actorRef),tx.get(accountRef),tx.get(dealsRef),tx.get(keyRef),
  ]);
  const actor=actorSnap.data(),role=txt(actor?.role);
  if(txt(actor?.accountState)!=="Active"||
    !["Administrator","Sales Manager","Sales Representative"].includes(role))
   throw new TrustedCrmDealError(403,"Active sales access required.");
  const account=rows(accountSnap.data()).find(row=>txt(row.id)===intent.locationId);
  if(!account||!txt(account.customerId)||!txt(account.ownerId))
   throw new TrustedCrmDealError(404,"Assigned customer location not found.");
  const ownerId=txt(account.ownerId);
  if(role==="Sales Representative"&&ownerId!==actorUid)
   throw new TrustedCrmDealError(403,"Opportunity is outside your account ownership.");
  if(role==="Sales Manager"&&ownerId!==actorUid){
   const owner=(await tx.get(db.doc("userAccess/"+ownerId))).data();
   if(txt(owner?.role)!=="Sales Representative"||txt(owner?.managerId)!==actorUid||
    txt(owner?.accountState)!=="Active"||txt(owner?.team)!=="Sales")
    throw new TrustedCrmDealError(403,"Opportunity is outside your managed team.");
  }
  if(priorSnap.exists){
   const prior=priorSnap.data();
   if(txt(prior?.actorUid)!==actorUid||txt(prior?.fingerprint)!==fingerprint)
    throw new TrustedCrmDealError(409,"Opportunity request ID already used.");
   return{dealId:txt(prior?.dealId),revision:Number(prior?.revision),
    updatedAt:txt(prior?.updatedAt),replayed:true};
  }
  const current=rows(dealsSnap.data());
  const old=intent.action==="Update"?current.find(row=>txt(row.id)===intent.dealId):undefined;
  if(intent.action==="Update"&&(!old||txt(old.locationId)!==intent.locationId||
   txt(old.customerId)!==txt(account.customerId)))
   throw new TrustedCrmDealError(404,"Editable opportunity not found.");
  const revision=old&&typeof old.revision==="number"&&Number.isSafeInteger(old.revision)?
   old.revision:0;
  if(old&&revision!==intent.expectedRevision)
   throw new TrustedCrmDealError(409,"Opportunity changed. Refresh before editing.");
  if(old&&txt(old.status)!=="Open"&&txt(old.stage)!==intent.details.stage)
   throw new TrustedCrmDealError(409,"Closed opportunities cannot silently reopen or change outcome.");
  const at=new Date().toISOString();
  const dealId=old?intent.dealId:"opportunity-"+randomUUID();
  const d=intent.details;
  const status=d.stage==="Won"?"Won":d.stage==="Lost"?"Lost":"Open";
  const next:Row={...(old??{}),id:dealId,
   customerId:txt(account.customerId),locationId:intent.locationId,
   ownerId,createdAt:txt(old?.createdAt)||at,createdBy:txt(old?.createdBy)||actorUid,
   name:d.name,stage:d.stage,status,
   nextAction:d.nextAction,nextActionDate:d.nextActionDate,
   updatedAt:at,updatedBy:actorUid,revision:revision+1};
  // Firestore refuses undefined values, including inside arrays of contact/deal rows.
  // Explicitly remove cleared optional fields rather than serializing undefined.
  if(d.estimatedCases!==undefined)next.estimatedCases=d.estimatedCases;
  else delete next.estimatedCases;
  if(d.expectedCloseDate)next.expectedCloseDate=d.expectedCloseDate;
  else delete next.expectedCloseDate;
  if(d.stage==="Lost")next.lossReason=d.lossReason;
  else delete next.lossReason;
  const nextDeals=old?current.map(x=>txt(x.id)===dealId?next:x):[next,...current];
  if(Buffer.byteLength(JSON.stringify({items:nextDeals}),"utf8")>900000)
   throw new TrustedCrmDealError(409,"Opportunity register needs maintenance.");
  const eventId="crm-deal-"+randomUUID();
  tx.set(dealsRef,{items:nextDeals});
  tx.create(keyRef,{actorUid,dealId,revision:revision+1,updatedAt:at,fingerprint});
  tx.create(db.doc("crmDealAudit/"+eventId),{
   eventId,actorUid,dealId,locationId:intent.locationId,
   fromStage:txt(old?.stage)||null,toStage:d.stage,revision:revision+1,
   financialPosting:false,inventoryPosting:false,createdAt:at,
  });
  tx.set(db.doc("platform/meta"),{versions:{
   [dealsRef.path.replace(/[^A-Za-z0-9]+/g,"_")]:at+"#"+randomUUID().slice(0,6),
  }},{merge:true});
  return{dealId,revision:revision+1,updatedAt:at,replayed:false};
 });
}
