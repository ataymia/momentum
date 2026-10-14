import type {Account, WorkspaceUser} from "./types";

/**
 * Authoritative account-edit policy for a future trusted Firestore write boundary.
 * Pass the authenticated UID and access record verified on the server.
 * NEVER infer account creation from ownerId, originatorId, or display names.
 */
export type VerifiedAccountEditor = {
  uid:string;
  role:WorkspaceUser["role"];
  accountState:"Active"|"Pending"|"Suspended"|"Disabled";
};

/** Profile fields only. Ownership, lifecycle, pricing, finance, credit and audit fields are excluded. */
export const ACCOUNT_PROFILE_EDITABLE_FIELDS=[
  "name","contactName","contactRole","phone","mobilePhone","fax","email",
  "streetAddress","city","state","postalCode",
  "deliveryAddressSameAsBusiness","deliveryStreetAddress","deliveryLocation",
  "deliveryPostalCode","notes",
] as const satisfies readonly (keyof Account)[];
export type AccountProfileEditableField=typeof ACCOUNT_PROFILE_EDITABLE_FIELDS[number];
export type AccountProfileEdit=Partial<Pick<Account,AccountProfileEditableField>>;
/** Must come from a server-owned immutable record, never from client-supplied fields. */
export type VerifiedAccountCreator={
  accountId:string;
  creatorUid:string;
};
export type AccountProfileEditDecision=
  | {ok:true; updated:Account}
  | {ok:false; reason:string};

const allowed=new Set<string>(ACCOUNT_PROFILE_EDITABLE_FIELDS);
const maxLength=(field:string)=>field==="notes"?2000:field==="name"?180:500;
const forbiddenKeys =new Set(["id","createdAt","createdByUid","ownerId","originatorId","accountManagerId","closerId",
  "responsibilityStartedAt","lifetimeCases","reorderCount","pricingTier","pricingUpdatedBy","pricingUpdatedAt",
  "programPricePerCase","programPricingEffectiveDate","programPricingExpirationDate"]);

/**
 * This function is a pure policy and field validator, NOT a server authorization endpoint.
 * The server must verify actor.uid and actor.role from Firebase Auth and userAccess/{uid};
 * retrieve a separate protected creator-provenance record (never trust the
 * shared account createdByUid alone), validate the current account in a
 * transaction, enforce this
 * decision and commit under a version precondition.
 */
export function validateAccountProfileEdit(
  actor:VerifiedAccountEditor,
  current:Account,
  untrustedPatch:unknown,
  verifiedCreator:VerifiedAccountCreator|null=null,
):AccountProfileEditDecision{
  if(actor.accountState!=="Active"||!actor.uid.trim())
    return {ok:false,reason:"The employee is not active and authenticated."};
  const trustedCreator=Boolean(verifiedCreator&&
    verifiedCreator.accountId===current.id&&
    verifiedCreator.creatorUid===actor.uid&&
    current.createdByUid===verifiedCreator.creatorUid);
  if(actor.role!=="Administrator"&&!trustedCreator)
    return {ok:false,reason:"Only the original creator or a full Administrator may edit this account."};
  if(!untrustedPatch||typeof untrustedPatch!=="object"||Array.isArray(untrustedPatch))
    return {ok:false,reason:"Account changes must be a field object."};
  const patch=untrustedPatch as Record<string,unknown>;
  const keys=Object.keys(patch);
  if(!keys.length)return {ok:false,reason:"No profile changes were supplied."};
  if(keys.some((key)=>forbiddenKeys.has(key)||!allowed.has(key)))
    return {ok:false,reason:"Account ownership, history, financial fields and unknown fields cannot be changed."};
  for(const field of keys){
    const value=patch[field];
    if(field==="deliveryAddressSameAsBusiness"){
      if(typeof value!=="boolean")return {ok:false,reason:"Delivery address preference must be a boolean."};
      continue;
    }
    if(typeof value!=="string"||value.length>maxLength(field))
      return {ok:false,reason:"Profile changes require valid text within the field limit."};
    if(field==="name"&&!value.trim())
      return {ok:false,reason:"Account name cannot be blank."};
  }
  const updated={...current,...patch} as Account;
  // The allowlist prevents even an Administrator from silently rewriting attribution.
  // Backend must persist this as a single atomic edit with actor, event time, and revision.
  return {ok:true,updated};
}
