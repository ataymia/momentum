import type {EmploymentRecord,EmployeeDocument} from "./hcm-engine";
import {validExternalVerification} from "./hr-document-controls";
import {i9RetentionReviewDate} from "./hr-electronic-forms";
export type DocumentKind="I-9"|"W-4"|"Arizona A-4"|"W-9";
export type FormEvidence={kind:DocumentKind;status:"Externally verified signed original"|"Missing secure verification";recordId?:string};
export type HiringReadiness={userId:string;classification:string;hireDate?:string;formEvidence:FormEvidence[];blockers:string[];retentionReviewDate?:string;productionReady:false};
const formPatterns:Record<DocumentKind,RegExp>={
 "I-9":/(?:^|\b)(?:form\s*)?i[-\s]?9(?:\b|$)/i,
 "W-4":/(?:^|\b)(?:form\s*)?w[-\s]?4(?:\b|$)/i,
 "Arizona A-4":/(?:arizona|az|form)\s*(?:form\s*)?a[-\s]?4\b/i,
 "W-9":/(?:^|\b)(?:form\s*)?w[-\s]?9(?:\b|$)/i,
};
export function requiredForms(classification:EmploymentRecord["classification"]):DocumentKind[]{
 if(classification==="Contractor")return ["W-9"];
 if(classification==="Hourly"||classification==="Salary")return ["I-9","W-4","Arizona A-4"];
 return [];
}
/** A local checklist is never proof of compliant completion. Server receipt, original, Section 2,
 * state reporting, retention and employer account verification still require independent evidence. */
export function hiringReadiness(employee:EmploymentRecord,documents:EmployeeDocument[]):HiringReadiness{
 const blockers:string[]=[];
 if(employee.classification==="Not configured")blockers.push("Worker classification is unverified; do not assume employee or contractor status.");
 if(!employee.hireDate)blockers.push("First day of work / engagement has not been confirmed.");
 const formEvidence:FormEvidence[]=requiredForms(employee.classification).map(kind=>{
  const matching=documents.filter(d=>d.userId===employee.userId&&formPatterns[kind].test(d.title)).sort((a,b)=>b.version-a.version);
  const confirmed=matching.find(d=>d.status==="Available"&&validExternalVerification(d.verification,d.version));
  if(!confirmed)blockers.push(kind+": no verified signed official original linked to a secure record.");
  return {kind,status:confirmed?"Externally verified signed original" as const:"Missing secure verification" as const,recordId:confirmed?.id};
 });
 if(employee.classification==="Hourly"||employee.classification==="Salary"){
  blockers.push("Form I-9 Section 2 employer examination and authorized representative signature require separate trusted verification.");
  blockers.push("Arizona new-hire reporting receipt, employer registration and payroll withholding setup are not verified by HCM document metadata.");
  blockers.push("Work state and applicability of Arizona A-4 must be established from verified employment details.");
 }
 let retentionReviewDate:string|undefined;
 if(employee.hireDate&&(employee.classification==="Hourly"||employee.classification==="Salary")){
  try{retentionReviewDate=i9RetentionReviewDate(employee.hireDate,employee.separationDate);}catch{blockers.push("Hire/separation date is invalid for calculating an I-9 retention review date.");}
 }
 blockers.push("Approved production signing, signed-byte integrity, access/retention and compliance/legal acceptance remain unverified.");
 return {userId:employee.userId,classification:employee.classification,hireDate:employee.hireDate,formEvidence,blockers,retentionReviewDate,productionReady:false};
}
