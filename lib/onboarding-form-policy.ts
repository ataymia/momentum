import type { DocumentTemplateKind } from "./document-template-engine";

export type OnboardingFormPolicy = {
  kind: DocumentTemplateKind;
  officialForm: boolean;
  employeeSignatureRequired: boolean;
  signatureMustBeFinalSubmissionStep: boolean;
  accessSubmissionAuditRequired: boolean;
  hardCopyExportRequired: boolean;
  preserveOfficialContent: boolean;
  administratorCompletionRequired: boolean;
  timingNote?: string;
  controlNote: string;
};

const STANDARD: Omit<OnboardingFormPolicy, "kind"> = {
  officialForm: false,
  employeeSignatureRequired: true,
  signatureMustBeFinalSubmissionStep: false,
  accessSubmissionAuditRequired: true,
  hardCopyExportRequired: true,
  preserveOfficialContent: true,
  administratorCompletionRequired: false,
  controlNote: "Retain the completed signed document and its submission evidence.",
};

export const ONBOARDING_FORM_POLICIES: Record<DocumentTemplateKind, OnboardingFormPolicy> = {
  "Employment agreement": { ...STANDARD, kind:"Employment agreement" },
  "Compensation notice": { ...STANDARD, kind:"Compensation notice" },
  "Form W-4": {
    kind:"Form W-4",
    officialForm:true,
    employeeSignatureRequired:true,
    signatureMustBeFinalSubmissionStep:true,
    accessSubmissionAuditRequired:true,
    hardCopyExportRequired:true,
    preserveOfficialContent:true,
    administratorCompletionRequired:false,
    controlNote:"Electronic W-4 flow must preserve required IRS content and instructions, identify the employee, audit submission access, capture the employee e-signature as the final entry, retain the record, and be able to produce a hard copy.",
  },
  "Form W-9": {
    kind:"Form W-9",
    officialForm:true,
    employeeSignatureRequired:true,
    signatureMustBeFinalSubmissionStep:true,
    accessSubmissionAuditRequired:true,
    hardCopyExportRequired:true,
    preserveOfficialContent:true,
    administratorCompletionRequired:false,
    controlNote:"Electronic W-9 flow must preserve the paper-form information and applicable perjury language, identify the payee, audit submission access, capture the payee e-signature as the final entry when a signature is required, and support hard-copy production.",
  },
  "Form I-9": {
    kind:"Form I-9",
    officialForm:true,
    employeeSignatureRequired:true,
    signatureMustBeFinalSubmissionStep:false,
    accessSubmissionAuditRequired:true,
    hardCopyExportRequired:true,
    preserveOfficialContent:true,
    administratorCompletionRequired:true,
    timingNote:"Employee Section 1 is due no later than the first day of employment and may be completed after an offer is accepted. Employer Section 2 is due within three business days after the employee begins work, or the first day for employment lasting fewer than three business days.",
    controlNote:"Employee completion alone cannot close Form I-9. Momentum must preserve the official data sequence and instructions, retain electronic audit/e-sign evidence, and keep an Administrator/employer verification step for Section 2 and any later reverification.",
  },
  "Arizona Form A-4": {
    kind:"Arizona Form A-4",
    officialForm:true,
    employeeSignatureRequired:true,
    signatureMustBeFinalSubmissionStep:false,
    accessSubmissionAuditRequired:true,
    hardCopyExportRequired:true,
    preserveOfficialContent:true,
    administratorCompletionRequired:false,
    timingNote:"Arizona employees subject to state withholding must complete Form A-4 within five days of employment. If not received, the employer uses the state default withholding rate until an election is provided.",
    controlNote:"Retain the employee's signed Arizona withholding election in the employer record and make the completed copy available to the employee; the form is provided to the employer rather than routinely submitted to ADOR.",
  },
  Other: {
    ...STANDARD,
    kind:"Other",
    employeeSignatureRequired:false,
    controlNote:"Template owner must define whether signature, acknowledgment, administrator review, and retention are required before assigning this document.",
  },
};

export function onboardingFormPolicy(kind: DocumentTemplateKind) {
  return ONBOARDING_FORM_POLICIES[kind];
}
