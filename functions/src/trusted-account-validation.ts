type RecordValue=Record<string, unknown>;
type ValidCreation={ok:true;record:RecordValue;customerName:string;
  legalBusinessName:string;ein?:string;azTptLicenseNumber?:string;
  taxDocumentType?:string}|
  {ok:false;message:string};

export const object=(value:unknown):value is RecordValue=>
  Boolean(value&&typeof value==="object"&&!Array.isArray(value));
export const str=(value:unknown)=>typeof value==="string"?value.trim():"";
const validZip=(value:string)=>/^\d{5}$/.test(value);
/**
 * Validate account creation fields independently of client UI checks.
 * Never accept ownership, creator, status, revenue or pricing from a caller.
 * @param {unknown} input Untrusted account-creation payload.
 * @return {ValidCreation} Sanitized writable profile or rejection.
 */
export function validateTrustedAccountCreation(input:unknown):ValidCreation {
  if (!object(input)) {
    return {ok: false, message: "Account details are required."};
  }
  const identityAllowed=[
    "legalBusinessName", "ein", "azTptLicenseNumber", "taxDocumentType",
  ];
  const allowed=[
    "name", "customerName", "locationName", "location", "channel",
    "contactName", "contactRole", "phone", "mobilePhone", "fax", "email",
    "streetAddress", "postalCode", "deliveryAddressSameAsBusiness",
    "deliveryStreetAddress", "deliveryLocation", "deliveryPostalCode",
  ];
  if (Object.keys(input).some((key)=>
    !allowed.includes(key)&&!identityAllowed.includes(key))) {
    return {ok: false, message: "Creation cannot set account history."};
  }
  const legalBusinessName=str(input.legalBusinessName);
  if (!legalBusinessName || str(input.name)!==legalBusinessName) {
    return {ok:false,
      message:"Legal business name must match the account name and licensing."};
  }
  const ein=str(input.ein);
  const azTptLicenseNumber=str(input.azTptLicenseNumber);
  const taxDocumentType=str(input.taxDocumentType)||"Undetermined";
  if (ein&&!/^\d{2}-?\d{7}$/.test(ein)) {
    return {ok:false,message:"Invalid EIN."};
  }
  if (azTptLicenseNumber&&!/^\d{8}$/.test(azTptLicenseNumber)) {
    return {ok:false,message:"Invalid Arizona TPT number."};
  }
  if (!["Undetermined","Taxable","Resale 5000A","Exemption 5000"]
    .includes(taxDocumentType)) {
    return {ok:false,message:"Invalid tax documentation route."};
  }
  if (taxDocumentType==="Resale 5000A"&&!azTptLicenseNumber) {
    return {ok:false,message:"Resale documentation needs a TPT number."};
  }
  const required=["name", "location", "channel", "contactName", "contactRole"];
  if (required.some((key)=>!str(input[key]))) {
    return {ok: false, message: "Business and contact details are required."};
  }
  if (!str(input.phone)&&!str(input.mobilePhone)&&!str(input.email)) {
    return {ok: false, message: "At least one contact method is required."};
  }
  if (!validZip(str(input.postalCode))) {
    return {ok: false, message: "A five-digit ZIP code is required."};
  }
  const same=input.deliveryAddressSameAsBusiness!==false;
  if (!same&&(!str(input.deliveryStreetAddress)||
    !str(input.deliveryLocation)||
    !validZip(str(input.deliveryPostalCode)))) {
    return {ok: false, message: "Complete the separate delivery address."};
  }
  const record:RecordValue={};
  for (const key of allowed) {
    const value=input[key];
    if (value===undefined) continue;
    if (key==="deliveryAddressSameAsBusiness") {
      if (typeof value!=="boolean") {
        return {ok: false, message: "Invalid delivery-address option."};
      }
      record[key]=value;
    } else if (typeof value==="string"&&value.length<=500) {
      record[key]=value.trim();
    } else {
      return {ok: false, message: "An account field is invalid or too long."};
    }
  }
  const customerName=legalBusinessName;
  if (str(input.email)&&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(input.email))) {
    return {ok: false, message: "The contact email is invalid."};
  }
  return {ok:true,record,customerName,legalBusinessName,ein,
    azTptLicenseNumber,taxDocumentType};
}

/**
 * Duplicate guard for concurrent server-side new account requests.
 * Keeps the legacy shared account register as the source of truth.
 * @param {RecordValue[]} accounts Current account records.
 * @param {RecordValue} candidate Sanitized location to create.
 * @return {boolean} Whether a high-confidence duplicate exists.
 */
export function potentialDuplicateAccount(
  accounts:RecordValue[],
  candidate:RecordValue,
):boolean {
  const name=str(candidate.name).toLowerCase();
  const zip=str(candidate.postalCode);
  const street=str(candidate.streetAddress).toLowerCase();
  const phone=str(candidate.phone).replace(/\D/g, "");
  return accounts.some((account)=>{
    const sameName=str(account.name).toLowerCase()===name;
    const sameZip=str(account.postalCode)===zip;
    const sameStreet=Boolean(street)&&
      str(account.streetAddress).toLowerCase()===street;
    const samePhone=Boolean(phone)&&
      str(account.phone).replace(/\D/g, "")===phone;
    return sameName&&sameZip&&(sameStreet||samePhone);
  });
}

