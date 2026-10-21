/** Arizona Department of Revenue: TPT licenses are eight digits; resale proof is Form 5000A, not a number. */
export type ArizonaTaxCertificateType = "5000A" | "5000";
export const AZ_TPT_LICENSE_PATTERN = /^[0-9]{8}$/;
export function normalizeAzTptLicenseNumber(input:string):string|null {
  const value=input.trim();
  return !value||AZ_TPT_LICENSE_PATTERN.test(value) ? value : null;
}
export function validArizonaTaxCertificateType(value:string|undefined):boolean {
  return value===undefined||value===""||value==="5000A"||value==="5000";
}
/** A secure external document reference is an identifier, NOT the document itself. */
export function validTaxCertificateReference(value:string|undefined):boolean {
  return value===undefined||value.length<=200&&/^[\w\- ./#:]+$/.test(value);
}
