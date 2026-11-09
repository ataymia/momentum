/* eslint-disable comma-spacing, keyword-spacing, arrow-parens, key-spacing, curly, brace-style, semi-spacing, space-before-blocks */
import {createHash,randomUUID} from "node:crypto";
import {getFirestore} from "firebase-admin/firestore";
import {
  syntheticVisitLocationId,validCrmVisitRequestId,
  validateTrustedCrmVisit,
} from "./trusted-crm-visit-validation";

type Row=Record<string,unknown>;
/** @param {unknown} value Possible Firestore object. @return {boolean} Whether it is a record. */
const isRow=(value:unknown):value is Row=>
  Boolean(value&&typeof value==="object"&&!Array.isArray(value));
/** @param {unknown} value Untrusted field. @return {string} Trimmed string or empty. */
const text=(value:unknown)=>typeof value==="string"?value.trim():"";
/** @param {Row|undefined} data Field document. @return {Row[]} Valid record items. */
const items=(data:Row|undefined):Row[]=>
  Array.isArray(data?.items)?data.items.filter(isRow):[];

export class TrustedCrmVisitError extends Error {
  /** @param {number} status HTTP status. @param {string} message Safe error for the caller. */
  constructor(public readonly status:number,message:string){super(message);}
}

type VisitResult={
  visitId:string;sampleId?:string;occurredAt:string;replayed:boolean;
};

/**
 * Idempotent Firestore transaction. A browser cannot choose the actor, event
 * time, link to a foreign customer, create a sale, or decrement inventory.
 * Samples and physical visits succeed or fail together.
 * @param {string} actorUid Firebase identity proven by caller.
 * @param {unknown} untrusted Untrusted form payload.
 * @param {unknown} requestId Idempotency key from the signed-in client.
 * @return {Promise<VisitResult>} Authenticated server receipt.
 */
export async function commitTrustedCrmFieldVisit(
  actorUid:string,untrusted:unknown,requestId:unknown,
):Promise<VisitResult> {
  if (!actorUid || !validCrmVisitRequestId(requestId)) {
    throw new TrustedCrmVisitError(400,"Invalid visit request ID.");
  }
  const validated=validateTrustedCrmVisit(untrusted);
  if (!validated.ok)throw new TrustedCrmVisitError(400,validated.message);
  const input=validated.value;
  const fingerprint=createHash("sha256")
    .update(JSON.stringify(input)).digest("hex");
  const db=getFirestore();
  const accessRef=db.doc("userAccess/"+actorUid);
  const accountsRef=db.doc("domains/workspace/fields/accounts");
  const interactionsRef=db.doc("domains/crm/fields/interactions");
  const metaRef=db.doc("platform/meta");
  const requestRef=db.doc(
    "crmFieldVisitRequests/"+actorUid+"_"+requestId);
  return db.runTransaction(async tx=>{
    // Read auth state and record ownership INSIDE the transaction.
    const [access,accounts,interactions,previous]=await Promise.all([
      tx.get(accessRef),tx.get(accountsRef),tx.get(interactionsRef),
      tx.get(requestRef),
    ]);
    const actor=access.data();
    const role=text(actor?.role);
    if (actor?.accountState!=="Active" ||
      !["Administrator","Sales Manager","Sales Representative"]
        .includes(role)) {
      throw new TrustedCrmVisitError(
        403,"An active sales employee session is required.");
    }
    const existing=items(interactions.data());
    if (previous.exists) {
      const p=previous.data();
      if (text(p?.fingerprint)!==fingerprint ||
        text(p?.actorUid)!==actorUid) {
        throw new TrustedCrmVisitError(
          409,"This request ID belongs to different visit details.");
      }
      const visitId=text(p?.visitId);
      const sampleId=text(p?.sampleId)||undefined;
      if (!existing.some(v=>v.id===visitId) ||
        (sampleId&&!existing.some(v=>v.id===sampleId))) {
        throw new TrustedCrmVisitError(
          409,"Previously committed visit requires record reconciliation.");
      }
      return{
        visitId,sampleId,occurredAt:text(p?.occurredAt),replayed:true,
      };
    }

    let locationId="";
    if (input.accountId) {
      const account=items(accounts.data())
        .find(item=>text(item.id)===input.accountId);
      if (!account)throw new TrustedCrmVisitError(
        404,"Linked customer location does not exist.");
      const ownerId=text(account.ownerId);
      if (role==="Administrator" || ownerId===actorUid) {
        locationId=input.accountId;
      } else if (!ownerId) {
        if (role==="Sales Manager" ||
          (role==="Sales Representative"&&
            account.stage==="Prospect")) {
          locationId=input.accountId;
        }
      } else if (role==="Sales Manager") {
        const ownerAccess=await tx.get(db.doc("userAccess/"+ownerId));
        const owner=ownerAccess.data();
        // Team-wide scope follows actual access records. An inactive owner
        // cannot grant a broader account scope.
        const managedTeams=Array.isArray(actor?.managedTeams)?
          actor.managedTeams:[];
        if (owner?.accountState==="Active"&&
          (owner.managerId===actorUid ||
           managedTeams.includes(owner.team))&&
          ["Sales Manager","Sales Representative"].includes(
            text(owner.role))) {
          locationId=input.accountId;
        }
      }
      if (!locationId)throw new TrustedCrmVisitError(
        403,"That customer location is outside your authorized sales scope.");
    } else {
      // Unmatched freehand visits are never silently made customers.
      locationId=syntheticVisitLocationId(input.businessName);
    }

    const occurredAt=new Date().toISOString();
    const visitId="interaction-"+randomUUID();
    const visit:Row={
      id:visitId,locationId,userId:actorUid,type:"Visit",occurredAt,
      summary:input.summary,physicalVisit:true,
      visitUnsuccessful:input.unsuccessful,
      prospectRating:input.score,
      quickVisitBusinessName:input.businessName,
      ...(input.nextAction?{nextAction:input.nextAction}:{}),
      ...(input.nextActionDate?{nextActionDate:input.nextActionDate}:{}),
    };
    const sampleId=input.sampleProduct?
      "interaction-"+randomUUID():undefined;
    const sample:Row|undefined=sampleId?{
      id:sampleId,locationId,userId:actorUid,type:"Sample",occurredAt,
      summary:"Field sample: "+input.sampleQuantity+
        " can(s) of "+input.sampleProduct,
      quickVisitBusinessName:input.businessName,
      sampleProduct:input.sampleProduct,
      sampleQuantity:input.sampleQuantity,
      sampleUnit:"can",sampleInventoryLinked:false,
    }:undefined;
    const next=[visit,...(sample?[sample]:[]),...existing];
    if (Buffer.byteLength(JSON.stringify({items:next}),"utf8")>900_000) {
      throw new TrustedCrmVisitError(
        409,"CRM interaction ledger is at capacity; contact operations.");
    }
    tx.set(interactionsRef,{items:next});
    tx.create(db.doc("crmFieldVisitProvenance/"+visitId),{
      visitId,sampleId:sampleId??null,actorUid,occurredAt,
      locationId,requestId,
      evidence:"Server-authenticated, user-attested physical visit",
    });
    tx.create(requestRef,{
      actorUid,fingerprint,visitId,sampleId:sampleId??null,
      occurredAt,
    });
    const version=occurredAt+"#"+randomUUID().slice(0,6);
    tx.set(metaRef,{versions:{
      [interactionsRef.path.replace(/[^A-Za-z0-9]+/g,"_")]:version,
    }},{merge:true});
    return{visitId,sampleId,occurredAt,replayed:false};
  });
}
