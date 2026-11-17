import {validateNewAccountContact} from "./account-creation";
import {findAccountDuplicate} from "./duplicate-engine";
import {normalizePostalCode} from "./territory-engine";
import type {Account} from "./types";

/** CRM lead creation uses the existing Account/Customer source of truth, never a parallel lead table. */
export type LeadCreateDraft={
  legalBusinessName:string;
  locationName:string;
  city:string;
  streetAddress:string;
  postalCode:string;
  channel:string;
  contactName:string;
  contactRole:string;
  phone:string;
  email:string;
  territoryReason:string;
};
export type LeadCreatePayload={
  legalBusinessName:string;
  name:string;
  customerName:string;
  locationName:string;
  location:string;
  streetAddress:string;
  postalCode:string;
  channel:string;
  contactName:string;
  contactRole:string;
  phone:string;
  email:string;
  taxDocumentType:"Undetermined";
  deliveryAddressSameAsBusiness:true;
};
export type LeadCreateValidation={ok:true;payload:LeadCreatePayload;territoryReason:string}|{ok:false;message:string;duplicateAccountId?:string};

export function validateLeadCreateDraft(
  draft:LeadCreateDraft, accounts:readonly Account[],
):LeadCreateValidation {
  const name=draft.legalBusinessName.trim();
  const city=draft.city.trim();
  const locationName=draft.locationName.trim()||name;
  const postalCode=normalizePostalCode(draft.postalCode);
  const email=draft.email.trim().toLowerCase();
  const phone=draft.phone.trim();
  const candidate={
    name,location:city,channel:draft.channel.trim(),
    contactName:draft.contactName.trim(),contactRole:draft.contactRole.trim(),
    phone,email,
  };
  const valid=validateNewAccountContact(candidate);
  if(!valid.ok)return{ok:false,message:valid.message};
  if(name.length>160||locationName.length>160||city.length>120)return{ok:false,message:"The business, location or city name is too long."};
  if(!postalCode)return{ok:false,message:"Enter a valid five-digit or ZIP+4 postal code."};
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return{ok:false,message:"Enter a valid business contact email."};
  if(phone.length>60)return{ok:false,message:"Contact phone exceeds 60 characters."};
  if(!draft.streetAddress.trim())return{ok:false,message:"Business street address is required for geographic and duplicate-account review."};
  const payload:LeadCreatePayload={
    legalBusinessName:name,name,customerName:name,locationName,
    location:city,streetAddress:draft.streetAddress.trim(),postalCode,
    channel:candidate.channel,contactName:candidate.contactName,
    contactRole:candidate.contactRole,phone,email,
    taxDocumentType:"Undetermined",deliveryAddressSameAsBusiness:true,
  };
  const duplicate=findAccountDuplicate([...accounts],payload);
  if(duplicate)return{ok:false,message:"Potential duplicate lead or account. Review the existing record before creating another.",duplicateAccountId:duplicate.account.id};
  return{ok:true,payload,territoryReason:draft.territoryReason.trim()};
}
