/* eslint-disable max-len, comma-spacing, key-spacing, indent, object-curly-spacing, curly, brace-style, keyword-spacing, arrow-parens, space-before-blocks */
import {createHash,randomUUID} from "node:crypto";
import {getFirestore} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";

export const HR_TEMPLATE_KINDS={
 W9:{title:"IRS Form W-9",classification:"Contractor",
  source:"https://www.irs.gov/forms-pubs/about-form-w-9"},
 I9:{title:"USCIS Form I-9",classification:"Employee",
  source:"https://www.uscis.gov/i-9"},
 W4:{title:"IRS Form W-4",classification:"Employee",
  source:"https://www.irs.gov/forms-pubs/about-form-w-4"},
 AZ_A4:{title:"Arizona Form A-4",classification:"Employee",
  source:"https://azdor.gov/forms/withholding-forms/arizona-withholding-percentage-election"},
 CONTRACTOR_AGREEMENT:{title:"Independent contractor agreement",classification:"Contractor",
  source:""},
 EMPLOYEE_AGREEMENT:{title:"Employment agreement",classification:"Employee",
  source:""},
 OTHER:{title:"Other blank HR form",classification:"All workers",source:""},
} as const;
export type HrTemplateKind=keyof typeof HR_TEMPLATE_KINDS;
type FieldHint={
 id:string;label:string;type:"Text"|"Date"|"Checkbox"|"Signature"|"Initials";
 required:boolean;pdfFieldName?:string;signer:"Worker"|"Company";
};
type Draft={
 kind:HrTemplateKind;title:string;edition:string;storagePath:string;
 sha256:string;fields:FieldHint[];blankTemplateConfirmed:true;
};
export type HrTemplateRecord={
 id:string;kind:HrTemplateKind;title:string;edition:string;
 source:string;classification:"Contractor"|"Employee"|"All workers";
 storagePath:string;sha256:string;size:number;generation:string;
 fields:FieldHint[];createdBy:string;createdAt:string;
 status:"Pending HR form and signer review";signedOriginal:false;
};
type Registration={templateId:string;createdAt:string;replayed:boolean;status:"Pending HR form and signer review"};
const str=(v:unknown)=>typeof v==="string"?v.trim():"";
const obj=(v:unknown):v is Record<string,unknown>=>
 Boolean(v&&typeof v==="object"&&!Array.isArray(v));
const ident=/^[A-Za-z0-9_-]{3,128}$/;
const keyPattern=/^[A-Za-z0-9_-]{16,80}$/;
const pathPattern=/^hr-templates\/(W9|I9|W4|AZ_A4|CONTRACTOR_AGREEMENT|EMPLOYEE_AGREEMENT|OTHER)\/([0-9a-f]{8}-[0-9a-f-]{27,36})\/source\.pdf$/;
const maxFile=12*1024*1024;

/** Client-safe rejection from trusted HR form verification. */
export class TrustedHrTemplateError extends Error{
 /** @param {number} status Safe HTTP response status.
  * @param {string} message Client-safe refusal.
  */
 constructor(public readonly status:number,message:string){super(message);}
}

/** Parse only blank PDF template metadata, never worker TINs or document values.
 * @param {unknown} raw Metadata from administrator UI.
 * @return {Draft} Validated immutable template request.
 */
function parseDraft(raw:unknown):Draft{
 if(!obj(raw)||Object.keys(raw).some(k=>![
  "kind","title","edition","storagePath","sha256","fields","blankTemplateConfirmed"].includes(k)))
  throw new TrustedHrTemplateError(400,"Unexpected form-template fields.");
 const kind=str(raw.kind) as HrTemplateKind;
 const source=HR_TEMPLATE_KINDS[kind];
 const title=str(raw.title);
 const edition=str(raw.edition);
 const storagePath=str(raw.storagePath);
 const sha256=str(raw.sha256).toLowerCase();
 if(!source||!/^.{5,120}$/.test(title)||!/^.{1,64}$/.test(edition)||
  !/^[a-f0-9]{64}$/.test(sha256)||raw.blankTemplateConfirmed!==true)
  throw new TrustedHrTemplateError(400,"Form type, edition, checksum or blank-form confirmation is missing.");
 const match=pathPattern.exec(storagePath);
 if(!match||match[1]!==kind)
  throw new TrustedHrTemplateError(400,"Form storage path does not match its permitted category.");
 if(!Array.isArray(raw.fields)||raw.fields.length>80)
  throw new TrustedHrTemplateError(400,"Use up to 80 template field placeholders.");
 const ids=new Set<string>();
 const fields:FieldHint[]=raw.fields.map(field=>{
  if(!obj(field)||Object.keys(field).some(k=>![
   "id","label","type","required","pdfFieldName","signer"].includes(k)))
   throw new TrustedHrTemplateError(400,"Unrecognized form field mapping.");
  const id=str(field.id);
  const label=str(field.label);
  const type=str(field.type);
  const signer=str(field.signer);
  const pdfFieldName=str(field.pdfFieldName);
  if(!/^[A-Za-z0-9_-]{1,60}$/.test(id)||ids.has(id)||
   label.length<2||label.length>100||
   !["Text","Date","Checkbox","Signature","Initials"].includes(type)||
   !["Worker","Company"].includes(signer)||typeof field.required!=="boolean"||
   pdfFieldName.length>120)
   throw new TrustedHrTemplateError(400,"Form field mapping is invalid or duplicated.");
  ids.add(id);
  return{id,label,type:type as FieldHint["type"],required:field.required,
   signer:signer as FieldHint["signer"],
   ...(pdfFieldName?{pdfFieldName}:{})};
 });
 return{kind,title,edition,storagePath,sha256,fields,blankTemplateConfirmed:true};
}

/** Download and hash the immutable admin-uploaded original.
 * A client SHA claim is not evidence until the server has read the actual bytes.
 * @param {string} storagePath Category/UUID/source.pdf.
 * @return {Promise<{sha256:string,size:number,generation:string}>} Verified source details.
 */
async function verifiedSource(storagePath:string){
 const file=getStorage().bucket().file(storagePath);
 const [metadata]=await file.getMetadata();
 const size=Number(metadata.size);
 if(metadata.contentType!=="application/pdf"||!Number.isFinite(size)||
  size<8||size>maxFile)
  throw new TrustedHrTemplateError(400,"An immutable PDF under 12 MB is required.");
 const [bytes]=await file.download();
 if(bytes.length!==size||bytes.subarray(0,5).toString("ascii")!=="%PDF-")
  throw new TrustedHrTemplateError(400,"Uploaded form is not a valid PDF header or size.");
 return{sha256:createHash("sha256").update(bytes).digest("hex"),
  size,generation:String(metadata.generation??"")};
}

/** Register a source-verified, non-signed template for separate HR/legal review.
 * @param {string} actorUid Verified Firebase identity.
 * @param {unknown} raw Untrusted template metadata.
 * @param {unknown} rawRequestId Idempotent retry key.
 * @return {Promise<Registration>} Immutable pending-review receipt.
 */
export async function registerTrustedHrTemplate(
 actorUid:string,raw:unknown,rawRequestId:unknown,
):Promise<Registration>{
 if(!ident.test(actorUid)||typeof rawRequestId!=="string"||
  !keyPattern.test(rawRequestId))
  throw new TrustedHrTemplateError(400,"Invalid template request ID.");
 const draft=parseDraft(raw);
 const db=getFirestore();
 const actorRef=db.doc("userAccess/"+actorUid);
 const actor=await actorRef.get();
 if(actor.data()?.accountState!=="Active"||actor.data()?.role!=="Administrator")
  throw new TrustedHrTemplateError(403,"Active Administrator access required.");
 let actual:Awaited<ReturnType<typeof verifiedSource>>;
 try{actual=await verifiedSource(draft.storagePath);}
 catch(error){
  if(error instanceof TrustedHrTemplateError)throw error;
  throw new TrustedHrTemplateError(503,
   "Uploaded form cannot be read and verified. Do not register it as complete.");
 }
 if(actual.sha256!==draft.sha256||!actual.generation)
  throw new TrustedHrTemplateError(409,"Uploaded PDF hash/generation differs from the source.");
 const hash=createHash("sha256").update(JSON.stringify(draft)).digest("hex");
 const requestRef=db.doc("hrTemplateRegistrationKeys/"+actorUid+"_"+rawRequestId);
 return db.runTransaction(async tx=>{
  const [access,prior]=await Promise.all([tx.get(actorRef),tx.get(requestRef)]);
  if(access.data()?.accountState!=="Active"||access.data()?.role!=="Administrator")
   throw new TrustedHrTemplateError(403,"Administrator access was revoked.");
  if(prior.exists){
   if(str(prior.data()?.fingerprint)!==hash)
    throw new TrustedHrTemplateError(409,"Request ID reused for another form.");
   const templateId=str(prior.data()?.templateId);
   const proof=templateId?await tx.get(db.doc("hrTemplateCatalog/"+templateId)):null;
   if(!proof?.exists||str(proof.data()?.sha256)!==actual.sha256)
    throw new TrustedHrTemplateError(409,"Prior template needs original-file reconciliation.");
   return{templateId,createdAt:str(prior.data()?.createdAt),
    status:"Pending HR form and signer review" as const,replayed:true};
  }
  const templateId="hrtemplate-"+randomUUID();
  const createdAt=new Date().toISOString();
  const policy=HR_TEMPLATE_KINDS[draft.kind];
  const record:HrTemplateRecord={
   id:templateId,kind:draft.kind,title:draft.title,edition:draft.edition,
   source:policy.source,classification:policy.classification,
   storagePath:draft.storagePath,sha256:actual.sha256,
   size:actual.size,generation:actual.generation,fields:draft.fields,
   createdBy:actorUid,createdAt,status:"Pending HR form and signer review",
   signedOriginal:false,
  };
  tx.create(db.doc("hrTemplateCatalog/"+templateId),record);
  tx.create(requestRef,{actorUid,templateId,createdAt,fingerprint:hash});
  tx.create(db.doc("hrTemplateAudit/"+templateId),{
   actorUid,templateId,kind:draft.kind,createdAt,
   event:"Immutable blank form registered; awaiting edition and signer review",
   sha256:actual.sha256,generation:actual.generation,
  });
  return{templateId,createdAt,status:record.status,replayed:false};
 });
}

/** Administrator-only bounded listing; never a source of signed worker records.
 * @param {string} actorUid Verified Firebase identity.
 * @return {Promise<HrTemplateRecord[]>} Up to 40 pending template records.
 */
export async function listTrustedHrTemplates(actorUid:string){
 if(!ident.test(actorUid))throw new TrustedHrTemplateError(400,"Invalid requester.");
 const db=getFirestore();
 const actor=await db.doc("userAccess/"+actorUid).get();
 if(actor.data()?.accountState!=="Active"||actor.data()?.role!=="Administrator")
  throw new TrustedHrTemplateError(403,"Administrator review required.");
 const snap=await db.collection("hrTemplateCatalog")
  .orderBy("createdAt","desc").limit(40).get();
 return snap.docs.map(doc=>doc.data() as HrTemplateRecord);
}
