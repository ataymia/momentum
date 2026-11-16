/* eslint-disable max-len,comma-spacing,key-spacing,curly,brace-style,indent,space-before-blocks,keyword-spacing,arrow-parens,object-curly-spacing */
import {createHash,randomUUID} from "node:crypto";
import {getFirestore} from "firebase-admin/firestore";

type Row=Record<string,unknown>;
type LeadAction=
  |{action:"Qualify";accountId:string;expectedStage:string;nextStage:"Qualified"|"Sampled";reason:string}
  |{action:"Transfer";accountId:string;expectedOwnerId:string;targetUid:string;reason:string};
type Receipt={eventId:string;accountId:string;action:"Qualify"|"Transfer";recordedAt:string;replayed:boolean;stage?:string;ownerId?:string};
const isRow=(v:unknown):v is Row=>Boolean(v&&typeof v==="object"&&!Array.isArray(v));
const txt=(v:unknown)=>typeof v==="string"?v.trim():"";
const uidPattern=/^[A-Za-z0-9_-]{1,128}$/;
const requestPattern=/^[A-Za-z0-9_-]{16,80}$/;
const items=(v:Row|undefined):Row[]=>Array.isArray(v?.items)?v.items.filter(isRow):[];
const version=(v:string)=>v.replace(/[^A-Za-z0-9]+/g,"_");
const validReason=(v:unknown,minimum:number)=>typeof v==="string"&&v.trim().length>=minimum&&v.trim().length<=500;

export class TrustedCrmLeadError extends Error{
  /** @param {number} status HTTP error.
   * @param {string} message Client-safe rejection.
   */
  constructor(public readonly status:number,message:string){super(message);}
}

/** All fields are allowlisted. Ownership and old state are checked again in Firestore.
 * @param {unknown} raw Untrusted client intent.
 * @return {LeadAction} Strictly validated action.
 */
function parseIntent(raw:unknown):LeadAction{
  if(!isRow(raw))throw new TrustedCrmLeadError(400,"Invalid CRM request.");
  const action=txt(raw.action);
  const required=action==="Qualify"?
    ["action","accountId","expectedStage","nextStage","reason"]:
    ["action","accountId","expectedOwnerId","targetUid","reason"];
  if(!["Qualify","Transfer"].includes(action)||
    Object.keys(raw).some(k=>!required.includes(k)))
    throw new TrustedCrmLeadError(400,"Unrecognized CRM change fields.");
  const accountId=txt(raw.accountId);
  if(!uidPattern.test(accountId)||!validReason(raw.reason,action==="Qualify"?5:8))
    throw new TrustedCrmLeadError(400,"Account ID or evidence reason is invalid.");
  const reason=txt(raw.reason);
  if(action==="Qualify"){
    const expectedStage=txt(raw.expectedStage),nextStage=txt(raw.nextStage);
    if(!["Prospect","Qualified","Sampled"].includes(expectedStage)||
      !["Qualified","Sampled"].includes(nextStage))
      throw new TrustedCrmLeadError(400,"Invalid lead stage request.");
    return{action:"Qualify",accountId,expectedStage,
      nextStage:nextStage as "Qualified"|"Sampled",reason};
  }
  const expectedOwnerId=txt(raw.expectedOwnerId);
  const targetUid=txt(raw.targetUid);
  if(!uidPattern.test(targetUid)||
    (expectedOwnerId&&!uidPattern.test(expectedOwnerId)))
    throw new TrustedCrmLeadError(400,"Invalid representative ID.");
  return{action:"Transfer",accountId,expectedOwnerId,targetUid,reason};
}
const manages=(actor:Row|undefined,actorUid:string,employee:Row|undefined)=>
  txt(actor?.role)==="Sales Manager"&&
  txt(employee?.role)==="Sales Representative"&&
  txt(employee?.managerId)===actorUid&&
  txt(employee?.team)==="Sales"&&
  txt(employee?.accountState)==="Active";

/** Persist one authoritative CRM stage change or manager handoff.
 * Never modifies orders, paid metrics, commercial terms, original sales credit or customer tax data.
 * @param {string} actorUid UID from revoked-token-checked Firebase authentication.
 * @param {unknown} raw Untrusted lead intent.
 * @param {unknown} requestId Stable client retry key.
 * @return {Promise<Receipt>} Durable server receipt.
 */
export async function commitTrustedCrmLead(
  actorUid:string,raw:unknown,requestId:unknown,
):Promise<Receipt>{
  if(!uidPattern.test(actorUid)||typeof requestId!=="string"||
    !requestPattern.test(requestId))
    throw new TrustedCrmLeadError(400,"Invalid CRM request ID.");
  const intent=parseIntent(raw);
  const fingerprint=createHash("sha256").update(JSON.stringify(intent)).digest("hex");
  const db=getFirestore();
  const actorRef=db.doc("userAccess/"+actorUid);
  const accountRef=db.doc("domains/workspace/fields/accounts");
  const activitiesRef=db.doc("domains/workspace/fields/activities");
  const historyRef=db.doc("domains/crm/fields/responsibilityHistory");
  const requestRef=db.doc("crmLeadChangeRequests/"+actorUid+"_"+requestId);
  const metaRef=db.doc("platform/meta");
  return db.runTransaction(async tx=>{
    const [actorSnap,accountSnap,activitiesSnap,historySnap,priorSnap]=await Promise.all([
      tx.get(actorRef),tx.get(accountRef),tx.get(activitiesRef),
      tx.get(historyRef),tx.get(requestRef),
    ]);
    const actor=actorSnap.data() as Row|undefined;
    const role=txt(actor?.role);
    if(txt(actor?.accountState)!=="Active"||
      !["Administrator","Sales Manager","Sales Representative"].includes(role))
      throw new TrustedCrmLeadError(403,"An active authorized sales identity is required.");
    const oldAccounts=items(accountSnap.data());
    const account=oldAccounts.find(row=>txt(row.id)===intent.accountId);
    if(!account)throw new TrustedCrmLeadError(404,"Lead not found.");
    const ownerUid=txt(account.ownerId);
    const oldOwnerSnap=ownerUid?await tx.get(db.doc("userAccess/"+ownerUid)):null;
    const oldOwner=oldOwnerSnap?.data() as Row|undefined;
    const targetSnap=intent.action==="Transfer"?
      await tx.get(db.doc("userAccess/"+intent.targetUid)):null;
    const target=targetSnap?.data() as Row|undefined;
    const isAdmin=role==="Administrator";
    const own=ownerUid===actorUid;
    const managedOwner=manages(actor,actorUid,oldOwner);
    if(!isAdmin&&role==="Sales Manager"&&!own&&!managedOwner)
      throw new TrustedCrmLeadError(403,"This account is outside your management scope.");
    if(role==="Sales Representative"&&!own)
      throw new TrustedCrmLeadError(403,"Only the assigned representative may update this lead.");
    const history=items(historySnap.data());
    const activities=items(activitiesSnap.data());
    const prior=priorSnap.data();
    if(priorSnap.exists){
      if(txt(prior?.actorUid)!==actorUid||
        txt(prior?.fingerprint)!==fingerprint)
        throw new TrustedCrmLeadError(409,"This request ID belongs to another change.");
      const eventId=txt(prior?.eventId);
      const proof=await tx.get(db.doc("crmLeadEvents/"+eventId));
      if(!eventId||!proof.exists)
        throw new TrustedCrmLeadError(409,"Previous CRM change needs reconciliation.");
      return{
        eventId,accountId:intent.accountId,action:intent.action,
        recordedAt:txt(prior?.recordedAt),replayed:true,
        ...(intent.action==="Qualify"?{stage:intent.nextStage}:{ownerId:intent.targetUid}),
      };
    }
    if(!["Prospect","Qualified","Sampled"].includes(txt(account.stage)))
      throw new TrustedCrmLeadError(409,"Customer lifecycle cannot be moved back into the lead pipeline.");
    if(intent.action==="Qualify"){
      if(txt(account.stage)!==intent.expectedStage)
        throw new TrustedCrmLeadError(409,"Lead stage changed. Refresh before editing.");
      const allowed=(intent.expectedStage==="Prospect"&&intent.nextStage==="Qualified")||
        (intent.expectedStage==="Qualified"&&intent.nextStage==="Sampled")||
        (intent.expectedStage==="Sampled"&&intent.nextStage==="Qualified"&&role!=="Sales Representative");
      if(!allowed)throw new TrustedCrmLeadError(409,"The requested stage transition is not allowed.");
    }else{
      if(role==="Sales Representative")
        throw new TrustedCrmLeadError(403,"Only authorized management may reassign accounts.");
      if(ownerUid!==intent.expectedOwnerId)
        throw new TrustedCrmLeadError(409,"Account responsibility changed. Refresh first.");
      if(ownerUid===intent.targetUid)
        throw new TrustedCrmLeadError(409,"This representative already owns the account.");
      if(txt(target?.accountState)!=="Active"||
        txt(target?.role)!=="Sales Representative"||
        txt(target?.team)!=="Sales")
        throw new TrustedCrmLeadError(403,"Select an active sales representative.");
      if(!isAdmin&&!manages(actor,actorUid,target))
        throw new TrustedCrmLeadError(403,"Manager cannot assign a representative outside their direct team.");
    }
    const at=new Date().toISOString();
    const eventId="crm-lead-"+randomUUID();
    const updated:Row=intent.action==="Qualify"?
      {...account,stage:intent.nextStage,lastActivity:"Lead stage qualified",
        nextAction:intent.nextStage==="Sampled"?
          "Confirm sample feedback and purchasing decision":"Confirm buyer needs and next visit"}:
      {...account,ownerId:intent.targetUid,accountManagerId:intent.targetUid,
        responsibilityStartedAt:at,
        lastActivity:"Sales responsibility assigned",
        // Assignment is not legal territory verification or a new sales credit.
        nextAction:"Confirm assigned representative handoff and territory review"};
    const nextAccounts={items:oldAccounts.map(row=>row.id===intent.accountId?updated:row)};
    const activity={id:"act-"+randomUUID(),accountId:intent.accountId,
      type:"note",title:intent.action==="Qualify"?
        "Lead qualification updated":"Sales responsibility transferred",
      detail:intent.action==="Qualify"?
        txt(account.stage)+" → "+intent.nextStage+". "+intent.reason:
        (ownerUid||"Unassigned")+" → "+intent.targetUid+". "+intent.reason+
          " Historical order credit and distribution rights unchanged.",
      at,userId:actorUid};
    const nextActivities={items:[activity,...activities]};
    const changed:Record<string,string>={
      [version(accountRef.path)]:at+"#"+randomUUID().slice(0,6),
      [version(activitiesRef.path)]:at+"#"+randomUUID().slice(0,6),
    };
    if(Buffer.byteLength(JSON.stringify(nextAccounts),"utf8")>900_000||
      Buffer.byteLength(JSON.stringify(nextActivities),"utf8")>900_000)
      throw new TrustedCrmLeadError(409,"CRM register needs reconciliation or archival review.");
    tx.set(accountRef,nextAccounts);
    tx.set(activitiesRef,nextActivities);
    if(intent.action==="Transfer"){
      const record={id:eventId,locationId:intent.accountId,
        ...(ownerUid?{fromUserId:ownerUid}:{}),
        toUserId:intent.targetUid,effectiveAt:at,reason:intent.reason,
        changedBy:actorUid};
      const nextHistory={items:[record,...history]};
      if(Buffer.byteLength(JSON.stringify(nextHistory),"utf8")>900_000)
        throw new TrustedCrmLeadError(409,"Responsibility history requires archival review.");
      tx.set(historyRef,nextHistory);
      changed[version(historyRef.path)]=at+"#"+randomUUID().slice(0,6);
    }
    tx.create(db.doc("crmLeadEvents/"+eventId),{
      eventId,actorUid,accountId:intent.accountId,requestId,
      action:intent.action,recordedAt:at,reason:intent.reason,
      beforeStage:txt(account.stage),afterStage:txt(updated.stage),
      beforeOwnerId:ownerUid,afterOwnerId:txt(updated.ownerId),
      source:"Authenticated CRM lead transaction",
    });
    tx.create(requestRef,{actorUid,fingerprint,eventId,recordedAt:at});
    tx.set(metaRef,{versions:changed},{merge:true});
    return{eventId,accountId:intent.accountId,action:intent.action,
      recordedAt:at,replayed:false,
      ...(intent.action==="Qualify"?{stage:intent.nextStage}:{ownerId:intent.targetUid})};
  });
}
