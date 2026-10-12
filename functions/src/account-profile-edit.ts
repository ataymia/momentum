import {randomUUID} from "node:crypto";
import {getFirestore} from "firebase-admin/firestore";

/**
 * Server-only account-profile update. Not exposed as a public Function until
 * the legacy shared workspace/commercial Firestore paths are write-protected.
 */
type RecordValue=Record<string, unknown>;
type EditRequest={accountId:string;patch:unknown;expectedCreatorUid?:string};
type ProfileResult={
  accountId:string;
  auditId:string;
  updatedAt:string;
};
type Decision={ok:true;patch:RecordValue}|{ok:false;message:string};

export const PROFILE_FIELDS=[
  "name","contactName","contactRole","phone","mobilePhone","fax","email",
  "streetAddress","city","state","postalCode",
  "deliveryAddressSameAsBusiness","deliveryStreetAddress","deliveryLocation",
  "deliveryPostalCode","notes",
] as const;

const fieldSet=new Set<string>(PROFILE_FIELDS);
const asRecord=(value:unknown):value is RecordValue=>
  Boolean(value&&typeof value==="object"&&!Array.isArray(value));
const string=(value:unknown)=>typeof value==="string"?value.trim():"";
const itemList=(value:RecordValue|undefined):RecordValue[]=>
  Array.isArray(value?.items)?value.items.filter(asRecord):[];

export class AccountProfileEditError extends Error {
  /**
   * @param {number} status Safe HTTP status.
   * @param {string} message End-user-safe explanation.
   */
  constructor(public readonly status:number,message:string){
    super(message);
  }
}

/**
 * Apply only ordinary contact/profile fields. Keep attribution, financial,
 * ownership, pricing, account history and creation metadata immutable.
 * @param {unknown} input Untrusted profile patch.
 * @return {Decision} Allowed normalized fields or a rejection.
 */
export function validateServerProfilePatch(input:unknown):Decision{
  if(!asRecord(input)||!Object.keys(input).length)
    return {ok:false,message:"Supply account profile fields to update."};
  const patch:RecordValue={};
  for(const [field,value] of Object.entries(input)){
    if(!fieldSet.has(field))
      return {ok:false,message:"Only account profile fields may be edited."};
    if(field==="deliveryAddressSameAsBusiness"){
      if(typeof value!=="boolean")
        return {ok:false,message:"Delivery-address option is invalid."};
      patch[field]=value;
      continue;
    }
    const limit=field==="notes"?2000:field==="name"?180:500;
    if(typeof value!=="string"||value.length>limit)
      return {ok:false,message:"Invalid profile field value or length."};
    const trimmed=value.trim();
    if(field==="name"&&!trimmed)
      return {ok:false,message:"The business name must not be blank."};
    patch[field]=trimmed;
  }
  return {ok:true,patch};
}

/**
 * Verify the account's immutable creator from a server-owned record, not
 * client-supplied account.createdByUid or current responsibility.
 * @param {string} uid Firebase-authenticated caller UID.
 * @param {string} role Server-read userAccess role.
 * @param {string} state Server-read userAccess account state.
 * @param {string} accountId Canonical account ID.
 * @param {unknown} proof Server-read provenance document or null.
 * @param {unknown} account Shared current account record.
 * @return {boolean} Whether the caller may edit ordinary profile fields.
 */
export function serverMayEditAccount(
  uid:string,
  role:string,
  state:string,
  accountId:string,
  proof:unknown,
  account:unknown,
):boolean{
  if(!uid||state!=="Active"||!asRecord(account)||
    string(account.id)!==accountId)return false;
  if(role==="Administrator")return true;
  if(role!=="Sales Representative"&&role!=="Sales Manager")return false;
  if(!asRecord(proof)||string(proof.accountId)!==accountId)return false;
  return string(proof.creatorUid)===uid &&
    string(account.createdByUid)===uid;
}

/**
 * Atomic backend mutation for existing account profile fields.
 * This function is deliberately not exported as an HTTPS endpoint while
 * legacy shared-array client writes are broadly allowed by Firestore Rules.
 *
 * @param {string} actorUid UID from verified Firebase Auth, not request body.
 * @param {EditRequest} request Untrusted edit request.
 * @return {Promise<ProfileResult>} Auditable server confirmation.
 */
export async function commitTrustedAccountProfileEdit(
  actorUid:string,
  request:EditRequest,
):Promise<ProfileResult>{
  if(!actorUid||!request||!string(request.accountId))
    throw new AccountProfileEditError(400,"Account or authorization missing.");
  const validated=validateServerProfilePatch(request.patch);
  if(!validated.ok)
    throw new AccountProfileEditError(400,validated.message);

  const db=getFirestore();
  const accountId=string(request.accountId);
  const accessRef=db.doc("userAccess/"+actorUid);
  const accountRef=db.doc("domains/workspace/fields/accounts");
  const creatorRef=db.doc("accountCreatorProvenance/"+accountId);
  const commercialRef=db.doc("domains/commercial/fields/_root");
  const activitiesRef=db.doc("domains/workspace/fields/activities");
  const eventsRef=db.collection("accountProfileEditEvents").doc();
  const metaRef=db.doc("platform/meta");

  return db.runTransaction(async(tx)=>{
    const [
      access,accounts,proof,commercial,activities,
    ]=await Promise.all([
      tx.get(accessRef),tx.get(accountRef),tx.get(creatorRef),
      tx.get(commercialRef),tx.get(activitiesRef),
    ]);
    const actor=access.data();
    const rows=itemList(accounts.data());
    const existing=rows.find((item)=>string(item.id)===accountId);
    if(!existing)
      throw new AccountProfileEditError(404,"The account does not exist.");
    if(!serverMayEditAccount(
      actorUid,string(actor?.role),string(actor?.accountState),
      accountId,proof.data(),existing,
    ))throw new AccountProfileEditError(403,"Account edit not authorized.");

    const changed=Object.fromEntries(
      Object.entries(validated.patch).filter(
        ([name,value])=>existing[name]!==value));
    if(!Object.keys(changed).length)
      throw new AccountProfileEditError(409,"No changes to save.");

    const commercialData=commercial.data()?.data;
    const root=asRecord(commercialData)?commercialData:{};
    const accountPatches=asRecord(root.accountPatches)?root.accountPatches:{};
    const priorOverlay=accountPatches[accountId];
    const nextOverlay:RecordValue=asRecord(priorOverlay)?{...priorOverlay}:{};
    for(const [field,value] of Object.entries(changed)){
      if(field in nextOverlay)nextOverlay[field]=value;
    }
    const stamp=new Date().toISOString();
    const auditId="account-profile-"+randomUUID();
    const nextRows=rows.map((row)=>string(row.id)===accountId?
      {...row,...changed}:row);
    // Writing transactionally protects against concurrent account/CRM writes.
    tx.set(accountRef,{items:nextRows});
    if(Object.keys(nextOverlay).some((key)=>changed[key]!==undefined)){
      tx.set(commercialRef,{
        data:{...root,accountPatches:{
          ...accountPatches,[accountId]:nextOverlay,
        }},
      });
    }
    const event={
      id:auditId,accountId,actorUid,at:stamp,
      operation:"Account profile edited",
      changedKeys:Object.keys(changed).sort(),
      before:Object.fromEntries(
        Object.keys(changed).map((field)=>[field,existing[field]??null])),
      after:changed,
    };
    tx.create(eventsRef,event);
    tx.set(activitiesRef,{items:[{
      id:auditId,accountId,userId:actorUid,type:"note",
      title:"Account profile updated",detail:"Profile fields updated.",
      at:stamp,
    },...itemList(activities.data())]});
    const version=stamp+"#"+randomUUID().slice(0,6);
    const paths=[accountRef.path,activitiesRef.path];
    if(Object.keys(nextOverlay).some((key)=>changed[key]!==undefined))
      paths.push(commercialRef.path);
    const versions=Object.fromEntries(paths.map((path)=>[
      path.replace(/[^A-Za-z0-9]+/g,"_"),version,
    ]));
    tx.set(metaRef,{versions},{merge:true});
    return {accountId,auditId,updatedAt:stamp};
  });
}
