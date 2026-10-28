/** Business-identity capture is not tax/license verification. */
export type TaxIdentityInput={
  legalBusinessName?:string;
  ein?:string;
  azTptLicenseNumber?:string;
  taxDocumentType?:string;
};
export type TaxFieldErrors=Partial<Record<keyof TaxIdentityInput,string>>;
export const digitsOnly=(value:string)=>value.replace(/\D/g,"");

export function validateTaxIdentity(input:TaxIdentityInput,requireLegalName=true):TaxFieldErrors{
  const errors:TaxFieldErrors={};
  if(requireLegalName&&!input.legalBusinessName?.trim())errors.legalBusinessName="Enter the exact legal business name shown on the license or registration.";
  if(input.ein?.trim()&&!/^(?:\d{2}-?\d{7})$/.test(input.ein.trim()))errors.ein="EIN must contain exactly 9 digits.";
  if(input.azTptLicenseNumber?.trim()&&!/^\d{8}$/.test(input.azTptLicenseNumber.trim()))errors.azTptLicenseNumber="Arizona TPT license number must contain 8 digits.";
  if(input.taxDocumentType&&!["Undetermined","Taxable","Resale 5000A","Exemption 5000"].includes(input.taxDocumentType))errors.taxDocumentType="Select a supported tax documentation route.";
  if(input.taxDocumentType==="Resale 5000A"&&!input.azTptLicenseNumber?.trim())errors.azTptLicenseNumber="Enter the TPT number shown on the resale certificate, or leave documentation as Undetermined until collected.";
  return errors;
}

export function taxIdentityMissing(input:TaxIdentityInput):string[]{
  const missing:string[]=[];
  if(!input.legalBusinessName?.trim())missing.push("Legal business name");
  if(!input.ein?.trim())missing.push("EIN or permitted alternative identification review");
  if(!input.azTptLicenseNumber?.trim())missing.push("Arizona TPT license number or documented exception");
  if(!input.taxDocumentType||input.taxDocumentType==="Undetermined")missing.push("Tax documentation classification");
  return missing;
}
