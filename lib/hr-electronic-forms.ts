/**
 * Secure HR e-form records. No tax identifiers, identity-document scans, or PDF field values
 * belong in this metadata. Only a verified backend may write Firestore and Storage records.
 *
 * The signing transport is intentionally NOT live until an approved DocuSign production account,
 * audited templates, webhook verification, and legal acceptance are in place.
 */
export const HR_EFORM_DEFINITIONS={
  I9:{title:"Form I-9",officialSource:"https://www.uscis.gov/i-9",requiresEmployerSection:true},
  W4:{title:"Form W-4",officialSource:"https://www.irs.gov/forms-pubs/about-form-w-4",requiresEmployerSection:false},
  AZ_A4:{title:"Arizona Form A-4",officialSource:"https://azdor.gov/forms/withholding-forms/arizona-withholding-percentage-election",requiresEmployerSection:false},
} as const;

export type HrEFormKey=keyof typeof HR_EFORM_DEFINITIONS;
export type HrEFormStatus=
 |"Not started"
 |"Awaiting employee"
 |"Awaiting employer verification"
 |"Awaiting secure archive"
 |"Archived"
 |"Returned for correction"
 |"Voided";

export type HrEFormExamMethod="In person"|"Approved E-Verify alternative";
export type HrEFormEmployerExamination={
  examinerUid:string;
  examinedAt:string;
  section2SignedAt:string;
  method:HrEFormExamMethod;
  // Must be established by trusted employer configuration, never from an employee checkbox.
  remoteEligibilityVerified?:boolean;
};
export type HrEFormServerEvidence={
  /** Provider-completed is not identical to a browser redirect or a signed-in employee clicking Save. */
  providerEnvelopeId:string;
  providerCompletionVerifiedAt?:string;
  employeeSignedAt?:string;
  pdfSha256?:string;
  certificateSha256?:string;
  /** Confirmation that W-4 signature was the final form-submission entry. */
  w4FinalSignatureChecked?:boolean;
  w4PerjuryAcknowledged?:boolean;
  employerExamination?:HrEFormEmployerExamination;
};

/** A non-sensitive index entry for the server-owned Firestore collection hrSignedFormRecords. */
export type HrEFormRecord={
  id:string;
  employeeUid:string;
  formKey:HrEFormKey;
  formEdition:string;
  status:HrEFormStatus;
  provider:"DocuSign";
  providerEnvelopeId:string;
  issuedAt:string;
  completedAt?:string;
  signedPdfStoragePath?:string;
  certificateStoragePath?:string;
  lastEventAt:string;
  createdBy:string;
  // The completed originals are retained; prior records are never replaced on correction.
};

const SEGMENT=/^[A-Za-z0-9_-]{3,128}$/;
function safeSegment(value:string,label:string){
  if(!SEGMENT.test(value))throw new Error(`Invalid ${label} for private HR archive.`);
  return value;
}

/** Paths must be assembled only inside a trusted server, not from raw user-provided storage paths. */
export function hrSignedArtifactPaths(employeeUid:string,formKey:HrEFormKey,artifactId:string){
  safeSegment(employeeUid,"employee ID");
  safeSegment(artifactId,"archive ID");
  if(!Object.prototype.hasOwnProperty.call(HR_EFORM_DEFINITIONS,formKey))throw new Error("Unsupported HR form.");
  const root=`hr-private/${employeeUid}/${formKey}/${artifactId}`;
  return {signedPdf:`${root}/signed.pdf`,certificate:`${root}/certificate.pdf`};
}

function timestamp(value?:string){return Boolean(value&&!Number.isNaN(new Date(value).getTime()));}
function sha256(value?:string){return Boolean(value&&/^[a-f0-9]{64}$/i.test(value));}

/**
 * Server-side pre-archive guard. This is necessary but not sufficient to establish regulatory
 * compliance: the webhook signature, actual PDF bytes, form edition, and provider audit must also
 * be authenticated by the server before the fields are populated.
 */
export function hrArchiveBlockers(formKey:HrEFormKey,evidence:HrEFormServerEvidence):string[]{
  const blockers:string[]=[];
  if(!evidence.providerEnvelopeId.trim()||!timestamp(evidence.providerCompletionVerifiedAt))
    blockers.push("Provider completion not verified by the backend.");
  if(!timestamp(evidence.employeeSignedAt))blockers.push("Employee signature evidence missing.");
  if(!sha256(evidence.pdfSha256)||!sha256(evidence.certificateSha256))
    blockers.push("Signed PDF or completion certificate missing verified SHA-256 evidence.");
  if(formKey==="I9"){
    const exam=evidence.employerExamination;
    if(!exam?.examinerUid||!timestamp(exam.examinedAt)||!timestamp(exam.section2SignedAt))
      blockers.push("Employer document examination and signed Section 2 required.");
    if(exam?.method==="Approved E-Verify alternative"&&!exam.remoteEligibilityVerified)
      blockers.push("Remote I-9 examination requires verified eligibility for the alternative procedure.");
    if(exam&&!["In person","Approved E-Verify alternative"].includes(exam.method))
      blockers.push("Unsupported I-9 examination method.");
  }
  if(formKey==="W4"&&(!evidence.w4FinalSignatureChecked||!evidence.w4PerjuryAcknowledged))
    blockers.push("W-4 final-signature and perjury-statement checks required.");
  return blockers;
}

/** I-9 retention is at least 3 years after hire or 1 year after separation, whichever is later.
 * This returns a minimum review date, NOT permission to automatically delete an I-9.
 */
export function i9RetentionReviewDate(hireDate:string,separationDate?:string):string{
  const ISO=/^\d{4}-\d{2}-\d{2}$/;
  const parse=(value:string)=>{
    if(!ISO.test(value))throw new Error("Expected YYYY-MM-DD date.");
    const d=new Date(`${value}T00:00:00.000Z`);
    if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==value)
      throw new Error("Invalid calendar date.");
    return d;
  };
  const addYears=(date:Date,years:number)=>{
    const d=new Date(date.getTime());
    d.setUTCFullYear(d.getUTCFullYear()+years);
    return d;
  };
  const three=addYears(parse(hireDate),3);
  if(!separationDate)return three.toISOString().slice(0,10);
  const one=addYears(parse(separationDate),1);
  return new Date(Math.max(three.getTime(),one.getTime())).toISOString().slice(0,10);
}
