"use client";
import {useState,useRef,type FormEvent} from "react";
import {useWorkspace} from "../../lib/workspace-context";
import {useHcm} from "../../lib/hcm-context";
import {useFirebaseSessionOptional} from "../../lib/firebase-session-context";
import {HR_TEMPLATE_CHOICES,type HrTemplateKind} from "../../lib/firebase-hr-template-library";
import {
 archiveHrOriginal,listHrOriginals,downloadHrOriginalBytes,reviewHrOriginal,
 type HrOriginalRecord,type HrOriginalSource,type HrOriginalReviewDecision,
} from "../../lib/firebase-hr-signed-original";

/** Restricted, independently reviewed archive of signed worker originals.
 * A scan or e-sign certificate is evidence to review, NOT a verified signature.
 */
export function HrSignedOriginalArchivePanel(){
 const {currentUser,data}=useWorkspace();
 const {hcm}=useHcm();
 const session=useFirebaseSessionOptional()?.session;
 const [employeeUid,setEmployeeUid]=useState("");
 const [kind,setKind]=useState<HrTemplateKind>("W9");
 const [sourceType,setSourceType]=useState<HrOriginalSource>("External e-sign result");
 const [reference,setReference]=useState("");
 const [pdf,setPdf]=useState<File|null>(null);
 const [certificate,setCertificate]=useState<File|null>(null);
 const [confirmed,setConfirmed]=useState(false);
 const [busy,setBusy]=useState(false);
 const [downloadBusy,setDownloadBusy]=useState<string|null>(null);
 const [inspectionProof,setInspectionProof]=useState<{recordId:string;readAuditId:string;sha256:string}|null>(null);
 const [reviewRow,setReviewRow]=useState<string|null>(null);
 const [reviewDecision,setReviewDecision]=useState<HrOriginalReviewDecision>("Return for correction");
 const [reviewReason,setReviewReason]=useState("");
 const [reviewConfirmed,setReviewConfirmed]=useState(false);
 const [reviewBusy,setReviewBusy]=useState(false);
 const reviewRequest=useRef<{fingerprint:string;id:string}|null>(null);
 const [message,setMessage]=useState("");
 const [records,setRecords]=useState<HrOriginalRecord[]>([]);
 const [lastWorker,setLastWorker]=useState("");
 const requestId=useRef<string|null>(null);
 const pdfRef=useRef<HTMLInputElement|null>(null);
 const certRef=useRef<HTMLInputElement|null>(null);
 const workers=hcm.employees.filter(item=>
  data.users.some(user=>user.id===item.userId&&user.role!=="Customer"))
  .map(item=>({
   id:item.userId,
   label:(data.users.find(user=>user.id===item.userId)?.name??item.employeeNumber)+
    " ("+item.classification+")",
  })).sort((a,b)=>a.label.localeCompare(b.label));
 if(currentUser?.role!=="Administrator"||!session)return null;
 const resetRetry=()=>{requestId.current=null;setMessage("");};
 const selectedReview=records.find(item=>item.id===reviewRow);
 const matchingInspection=Boolean(selectedReview&&inspectionProof&&
  inspectionProof.recordId===selectedReview.id&&inspectionProof.sha256===selectedReview.sha256);

 const reload=async(id:string)=>{
  if(!id){setMessage("Select a worker to view their private document register.");return;}
  const result=await listHrOriginals(session,id);
  setRecords(result);setLastWorker(id);
 };
 const download=async(artifact:"Original"|"Certificate",recordId:string)=>{
  if(!session||downloadBusy||busy)return;
  setDownloadBusy(recordId+"-"+artifact);setMessage("");
  try{
   const file=await downloadHrOriginalBytes(session,recordId,artifact);
   if(artifact==="Original"){
    setInspectionProof({recordId,readAuditId:file.readAuditId,sha256:file.sha256});
    setReviewConfirmed(false);
    reviewRequest.current=null;
   }
   const blob=new Blob([file.bytes.buffer],{type:"application/pdf"});
   const url=URL.createObjectURL(blob);
   const a=document.createElement("a");
   a.href=url;a.download=file.fileName;a.style.display="none";
   document.body.append(a);a.click();a.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),30_000);
   setMessage("Private "+artifact.toLowerCase()+" retrieved with verified SHA-256 and an access-audit event. Document compliance still requires independent HR review.");
  }catch(error){
   setMessage(error instanceof Error?error.message:"Private PDF could not be retrieved.");
  }finally{setDownloadBusy(null);}
 };
 const submitReview=async()=>{
  if(!session||reviewBusy||busy||!selectedReview||!matchingInspection||
   !inspectionProof||!reviewConfirmed||reviewReason.trim().length<12){
   setMessage("Download and inspect this original, confirm the review, and record a reason of at least 12 characters without private tax identifiers.");
   return;
  }
  const intent={
   recordId:selectedReview.id,
   expectedStatus:selectedReview.status as "Pending independent HR review"|"Evidence inspected; compliance verification pending",
   decision:reviewDecision,reason:reviewReason.trim(),
   readAuditId:inspectionProof.readAuditId,sha256:inspectionProof.sha256,
  };
  const fingerprint=JSON.stringify(intent);
  if(!reviewRequest.current||reviewRequest.current.fingerprint!==fingerprint)
   reviewRequest.current={fingerprint,id:crypto.randomUUID().replaceAll("-","")};
  setReviewBusy(true);setMessage("");
  try{
   const receipt=await reviewHrOriginal(session,intent,reviewRequest.current.id);
   const latest=await listHrOriginals(session,selectedReview.employeeUid);
   const updated=latest.find(row=>row.id===receipt.recordId);
   if(!updated||updated.status!==receipt.status)
    throw new Error("Review receipt received but record readback is incomplete. Check the worker register before retrying.");
   setRecords(latest);
   setReviewRow(null);setReviewConfirmed(false);setInspectionProof(null);setReviewReason("");
   reviewRequest.current=null;
   setMessage("HR source review recorded: "+receipt.status+
    ". No e-signature, tax compliance, I-9 employer examination, classification or payroll authorization was granted.");
  }catch(error){
   setMessage((error instanceof Error?error.message:"HR review not confirmed.")+
    " Check the source before retrying with the same review ID.");
  }finally{setReviewBusy(false);}
 };
 const submit=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  if(busy)return;
  if(!employeeUid||!pdf||reference.trim().length<5||!confirmed){
   setMessage("Select the worker, signed PDF, evidence reference, and confirm the pending-review restrictions.");
   return;
  }
  setBusy(true);setMessage("");
  try{
   if(!requestId.current)requestId.current=crypto.randomUUID().replaceAll("-","");
   const receipt=await archiveHrOriginal(session,{
    employeeUid,kind,sourceType,reference:reference.trim(),pdf,
    ...(certificate&&sourceType==="External e-sign result"?{certificate}:{}),
   },requestId.current);
   setMessage("Original "+receipt.recordId+" archived and SHA-256 verified. Status: "+
    receipt.status+". This does NOT approve the signature, worker classification, tax form, or I-9 examination.");
   requestId.current=null;
   setConfirmed(false);setPdf(null);setCertificate(null);
   if(pdfRef.current)pdfRef.current.value="";
   if(certRef.current)certRef.current.value="";
   try{await reload(employeeUid);}
   catch{setMessage("Original securely archived, but list refresh failed. Do not upload it again without checking the register.");}
  }catch(error){
   setMessage((error instanceof Error?error.message:"Archive submission not confirmed.")+
    " Do not change the selected PDF when retrying the same request.");
  }finally{setBusy(false);}
 };
 return <section className="prototype-panel" aria-label="Private completed HR document intake">
  <h2>Signed-original archive: restricted HR intake</h2>
  <p className="prototype-note">Upload a completed original only after the paper signing or approved external provider ceremony took place. The server archives immutable PDF bytes, independently rechecks their SHA-256 and links them to the selected worker. New records start as <strong>Pending independent HR review</strong> and may be returned for correction or inspected without being legally approved. This form cannot create e-signatures or complete employer I-9 review.</p>
  <form className="prototype-order-form" onSubmit={event=>void submit(event)}>
   <div className="form-grid">
    <label>Worker
     <select aria-label="Worker for signed original" value={employeeUid} required disabled={busy}
      onChange={e=>{setEmployeeUid(e.target.value);setRecords([]);setLastWorker("");setInspectionProof(null);setReviewRow(null);setReviewConfirmed(false);reviewRequest.current=null;resetRetry();}}>
      <option value="">Choose provisioned worker</option>
      {workers.map(worker=><option key={worker.id} value={worker.id}>{worker.label}</option>)}
     </select>
    </label>
    <label>Form
     <select aria-label="Completed original form kind" value={kind} disabled={busy}
      onChange={e=>{setKind(e.target.value as HrTemplateKind);resetRetry();}}>
      {HR_TEMPLATE_CHOICES.map(item=><option value={item.kind} key={item.kind}>{item.title}</option>)}
     </select>
    </label>
    <label>Signing source
     <select aria-label="Source of signed original" value={sourceType} disabled={busy}
      onChange={e=>{setSourceType(e.target.value as HrOriginalSource);setCertificate(null);
       if(certRef.current)certRef.current.value="";resetRetry();}}>
      <option value="External e-sign result">External e-sign result</option>
      <option value="Paper signed scan">Paper signed scan</option>
     </select>
    </label>
    <label>Source evidence reference (not a tax ID)
     <input value={reference} required minLength={5} maxLength={160} disabled={busy}
      aria-label="Signing provider reference or paper custody reference"
      placeholder="Provider envelope ID or internal custody record"
      onChange={e=>{setReference(e.target.value);resetRetry();}}/>
    </label>
    <label>Completed original PDF (under 8 MB)
     <input ref={pdfRef} type="file" accept=".pdf,application/pdf"
      aria-label="Completed signed original PDF" disabled={busy} required
      onChange={e=>{setPdf(e.target.files?.[0]??null);resetRetry();}}/>
    </label>
    {sourceType==="External e-sign result"&&<label>Provider completion certificate (PDF, optional, under 4 MB)
     <input ref={certRef} type="file" accept=".pdf,application/pdf"
      aria-label="External signing completion certificate" disabled={busy}
      onChange={e=>{setCertificate(e.target.files?.[0]??null);resetRetry();}}/>
    </label>}
   </div>
   <label><input type="checkbox" checked={confirmed} disabled={busy}
    onChange={e=>{setConfirmed(e.target.checked);resetRetry();}}/>
    I am uploading the actual completed original for the selected worker, not a blank template, and understand that HR must separately verify signer identity, correct form revision, worker classification, document review, and I-9 employer examination when applicable.</label>
   <button type="submit" disabled={busy||!session||!confirmed||!pdf||!employeeUid}>
    {busy?"Archiving and verifying original…":"Archive completed original for HR review"}
   </button>
  </form>
  {message&&<p role="status" className="prototype-note">{message}</p>}
  <div className="prototype-controls">
   <h3>{"Worker's protected original register"}</h3>
   <button type="button" disabled={!employeeUid||busy}
    onClick={()=>void reload(employeeUid).catch(e=>setMessage(e instanceof Error?e.message:"Unable to load originals."))}>
    Load worker archive
   </button>
  </div>
  {lastWorker&&<div className="prototype-table-scroll"><table className="prototype-table">
   <thead><tr><th>Form</th><th>Archived</th><th>Hash prefix</th><th>Source</th><th>Independent HR review</th><th>Restricted PDF</th></tr></thead>
   <tbody>{records.map(item=><tr key={item.id}>
    <td>{item.kind}</td><td>{item.createdAt.slice(0,10)}</td>
    <td><code>{item.sha256.slice(0,14)}…</code></td><td>{item.sourceType}{item.hasCertificate?" + certificate":""}</td>
    <td>{item.status}</td>
    <td><button type="button" disabled={downloadBusy!==null||busy||reviewBusy} onClick={()=>void download("Original",item.id)}>Download original</button>
     {item.hasCertificate&&<button type="button" disabled={downloadBusy!==null||busy||reviewBusy} onClick={()=>void download("Certificate",item.id)}>Certificate</button>}
     {item.status!=="Requires correction"&&<button type="button" disabled={reviewBusy||busy} onClick={()=>{setReviewRow(item.id);setReviewReason("");setReviewDecision("Return for correction");setReviewConfirmed(false);reviewRequest.current=null;}}>Review evidence</button>}</td>
   </tr>)}</tbody>
  </table></div>}
  {lastWorker&&records.length===0&&<p className="prototype-note">{"No verified source records in this worker's latest archive window."}</p>}
  {selectedReview&&<div className="prototype-panel" aria-label="HR original source inspection">
   <h3>Inspection decision: {selectedReview.kind}</h3>
   <p className="prototype-note">Status: {selectedReview.status}. Download the original for this exact record before recording an inspection or returning it for correction. A source inspection never verifies a legal signature.</p>
   {!matchingInspection&&<p role="alert" className="prototype-note">No matching server-audited original download for this record. Select Download original in the row above first.</p>}
   <label>Review action
    <select value={reviewDecision} disabled={reviewBusy} onChange={event=>{setReviewDecision(event.target.value as HrOriginalReviewDecision);setReviewConfirmed(false);reviewRequest.current=null;}}>
     <option value="Return for correction">Return for correction (new PDF submission required)</option>
     {selectedReview.status==="Pending independent HR review"&&<option value="Record evidence inspection">Document inspected; legal verification remains pending</option>}
    </select>
   </label>
   <label>Specific HR review note (no SSNs, taxpayer IDs or financial details)
    <textarea value={reviewReason} minLength={12} maxLength={800} rows={3} disabled={reviewBusy}
     onChange={event=>{setReviewReason(event.target.value);setReviewConfirmed(false);reviewRequest.current=null;}}
     placeholder="Record the evidence checked or the exact correction required."/>
   </label>
   <label><input type="checkbox" checked={reviewConfirmed} disabled={reviewBusy||!matchingInspection}
    onChange={event=>setReviewConfirmed(event.target.checked)}/>
    I inspected the original corresponding to this checksum. This action does not approve a legal signature or fulfill employee or contractor compliance requirements.</label>
   <div className="prototype-controls">
    <button type="button" disabled={reviewBusy||busy||!matchingInspection||!reviewConfirmed||reviewReason.trim().length<12}
     onClick={()=>void submitReview()}>{reviewBusy?"Recording source review…":"Record restricted HR review"}</button>
    <button type="button" disabled={reviewBusy} onClick={()=>{setReviewRow(null);setReviewConfirmed(false);setReviewReason("");reviewRequest.current=null;}}>Close review</button>
   </div>
  </div>}

  <p className="prototype-note">{"Files are private and never published as bearer download links. This intake creates evidence records for HR to evaluate; it does not change a worker's onboarding or compliance status or disburse payroll."}</p>
 </section>;
}
