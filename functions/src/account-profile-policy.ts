type RecordValue=Record<string,unknown>;
type Decision={ok:true;patch:RecordValue}|{ok:false;message:string};

export const PROFILE_FIELDS=[
  "name","contactName","contactRole","phone","mobilePhone","fax","email",
  "streetAddress","city","state","postalCode",
  "deliveryAddressSameAsBusiness","deliveryStreetAddress","deliveryLocation",
  "deliveryPostalCode","notes",
] as const;

const fieldSet=new Set<string>(PROFILE_FIELDS);
export const asRecord=(value:unknown):value is RecordValue=>
  Boolean(value&&typeof value==="object"&&!Array.isArray(value));
export const string=(value:unknown)=>typeof value==="string"?value.trim():"";

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

