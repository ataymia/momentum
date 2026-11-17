/** Official source pages are used rather than bundled forms that silently go stale. */
export const HR_FORM_SOURCES = [
  { title: "Form I-9", url: "https://www.uscis.gov/i-9", detail: "Employment eligibility verification; employee and employer sections require separate completion." },
  { title: "Form W-4", url: "https://www.irs.gov/forms-pubs/about-form-w-4", detail: "Federal employee withholding certificate and current instructions." },
  { title: "Arizona Form A-4", url: "https://azdor.gov/forms/withholding-forms/arizona-withholding-percentage-election", detail: "Arizona employee withholding election." },
  { title: "Form W-9", url: "https://www.irs.gov/forms-pubs/about-form-w-9", detail: "Taxpayer identification certification for the contractor workflow." },
] as const;

export type ExternalDocumentVerification = {
  method: "External signed original";
  recordReference: string;
  verifiedAt: string;
  verifiedBy: string;
  documentVersion: number;
};

/** Reject malformed or forged-looking browser metadata without throwing in HR pages.
 * External references are an HR attestation, not independent signature or
 * immutable archive evidence. The approved signing/archive process must verify
 * the original record separately.
 */
export function validExternalVerification(value: ExternalDocumentVerification | undefined, version: number) {
  if (!value || typeof value !== "object" || value.method !== "External signed original") return false;
  return Boolean(typeof value.recordReference === "string" && value.recordReference.trim().length >= 5
    && typeof value.verifiedBy === "string" && value.verifiedBy.trim().length > 0
    && typeof value.verifiedAt === "string" && Number.isFinite(Date.parse(value.verifiedAt))
    && Number.isInteger(value.documentVersion) && Number.isInteger(version) && version > 0
    && value.documentVersion === version);
}
