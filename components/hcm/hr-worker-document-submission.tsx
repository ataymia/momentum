"use client";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {useFirebaseSessionOptional} from "../../lib/firebase-session-context";
import type {FirebaseAuthSession} from "../../lib/firebase-auth-rest";
import {
 archiveHrOriginal,listHrOriginals,type HrOriginalRecord,
} from "../../lib/firebase-hr-signed-original";
import {HR_TEMPLATE_CHOICES,type HrTemplateKind} from "../../lib/firebase-hr-template-library";
import {HrPdfEditor} from "./hr-pdf-editor";
import {
 listHrDocumentAssignments,downloadAssignedHrDocument,type AssignedHrDocument,
} from "../../lib/firebase-hr-template-assignment";

/** Worker-side PDF completion and private HR intake. Not employer approval. */
export function HrWorkerDocumentSubmission(){
 const session=useFirebaseSessionOptional()?.session;
 if(!session)return <p>Sign in before submitting HR documents.</p>;
 return <WorkerHrDocumentSubmissionSession key={session.uid} session={session}/>;
}

function WorkerHrDocumentSubmissionSession({session}:{session:FirebaseAuthSession}){
 const [kind,setKind]=useState<HrTemplateKind>("W4");
 const [file,setFile]=useState<File|null>(null);
 const [completed,setCompleted]=useState<File|null>(null);
 const [needsEdited,setNeedsEdited]=useState(false);
 const [attested,setAttested]=useState(false);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const [records,setRecords]=useState<HrOriginalRecord[]>([]);
 const [assignments,setAssignments]=useState<AssignedHrDocument[]>([]);
 const [selectedAssignment,setSelectedAssignment]=useState<string|null>(null);
 const [opening,setOpening]=useState(false);
 const [loaded,setLoaded]=useState(false);
 const [originalsError,setOriginalsError]=useState(false);
 const [assignmentsError,setAssignmentsError]=useState(false);
 const pending=useRef<{fingerprint:string;id:string}|null>(null);
 const filePicker=useRef<HTMLInputElement|null>(null);
 const reset=()=>{pending.current=null;setAttested(false);setNotice("");};
 useEffect(()=>{
  if(!session)return;
  let alive=true;
  void Promise.allSettled([
   listHrOriginals(session),listHrDocumentAssignments(session),
  ]).then(([originals,assigned])=>{
   if(!alive)return;
   if(originals.status==="fulfilled"){setRecords(originals.value);setLoaded(true);setOriginalsError(false);}
   else{setLoaded(false);setRecords([]);setOriginalsError(true);}
   if(assigned.status==="fulfilled"){setAssignments(assigned.value);setAssignmentsError(false);}
   else{setAssignments([]);setAssignmentsError(true);}
  });
  return()=>{alive=false;};
 },[session]);
 const openAssigned=async(id:string)=>{
  if(!session||opening||busy)return;
  setOpening(true);setNotice("");
  try{
   const assigned=assignments.find(item=>item.id===id&&item.status==="Assigned");
   if(!assigned)throw new Error("Choose a pending HR assignment.");
   const blank=await downloadAssignedHrDocument(session,id);
   setFile(blank);setCompleted(null);setNeedsEdited(true);setSelectedAssignment(id);
   setKind(assigned.kind);reset();
  }catch(error){setNotice(error instanceof Error?error.message:"Assigned PDF could not be opened.");}
  finally{setOpening(false);}
 };
 const submit=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  if(!file||busy||opening||!attested)return;
  if((selectedAssignment||needsEdited)&&!completed){
   setNotice("Finish creating the current edited PDF before submitting it to HR, or select another already-completed PDF.");return;
  }
  const chosen=completed??file;
  const fingerprint=[kind,chosen.name,chosen.size,chosen.lastModified,selectedAssignment??""].join("|");
  if(!pending.current||pending.current.fingerprint!==fingerprint)
   pending.current={fingerprint,id:crypto.randomUUID().replaceAll("-","")};
  setBusy(true);setNotice("");
  try{
   const receipt=await archiveHrOriginal(session,{
    employeeUid:session.uid,kind,
    sourceType:"Employee-submitted PDF (unverified)",
    reference:"Authenticated worker self-service submission",
    pdf:chosen,attestedByWorker:true,
    ...(selectedAssignment?{assignmentId:selectedAssignment}:{}),
   },pending.current.id);
   if(receipt.employeeUid!==session.uid)
    throw new Error("Submission was not linked to the signed-in worker.");
   pending.current=null;
   setFile(null);setCompleted(null);setNeedsEdited(false);setAttested(false);setSelectedAssignment(null);
   if(filePicker.current)filePicker.current.value="";
   setNotice("Document "+receipt.recordId+
    " saved privately for HR review. This is not a compliance approval.");
   try{
    const [saved,remaining]=await Promise.all([
     listHrOriginals(session),listHrDocumentAssignments(session),
    ]);
    setRecords(saved);setAssignments(remaining);setLoaded(true);setOriginalsError(false);setAssignmentsError(false);
   }
   catch{setNotice("Document securely saved, but the status list did not refresh. Do not submit a duplicate.");}
  }catch(error){
   setNotice(error instanceof Error?error.message:
    "Document submission not verified. Keep the file and retry with the same request.");
  }finally{setBusy(false);}
 };
 return <section aria-label="Worker HR PDF submission" className="onboarding-panel">
  <h3>Complete and submit a PDF</h3>
  <p>Upload your employment form, fill available PDF fields, and submit it privately for HR review. Only HR can approve the completed paperwork.</p>
  {assignmentsError&&<p role="status">Assigned form list could not be verified. Refresh before relying on it.</p>}
  {assignments.some(row=>row.status==="Assigned")&&<div>
   <label>Assigned blank forms <select disabled={opening||busy}
    value="" onChange={event=>void openAssigned(event.target.value)}>
    <option value="">Open a form assigned by HR</option>
    {assignments.filter(row=>row.status==="Assigned").map(row=><option key={row.id} value={row.id}>
     {row.title} · {row.edition}
    </option>)}
   </select></label>
  </div>}
  <div>
   <div className="prototype-controls">
    <label>Document type<select value={kind} disabled={busy||opening} onChange={event=>{
     setKind(event.target.value as HrTemplateKind);setSelectedAssignment(null);
     setFile(null);setCompleted(null);setNeedsEdited(false);if(filePicker.current)filePicker.current.value="";reset();
    }}>{HR_TEMPLATE_CHOICES.map(item=><option key={item.kind} value={item.kind}>{item.title}</option>)}</select></label>
    <label>PDF to complete<input ref={filePicker} type="file" accept="application/pdf,.pdf" disabled={busy||opening}
     onChange={event=>{setFile(event.target.files?.[0]??null);setCompleted(null);setNeedsEdited(false);setSelectedAssignment(null);reset();}}/></label>
   </div>
  </div>
  {file&&<HrPdfEditor source={file} disabled={busy||opening} onInvalidated={()=>{
   setCompleted(null);setNeedsEdited(true);reset();
  }} onPrepared={edited=>{
   setCompleted(edited);setNeedsEdited(false);reset();
  }}/>}
  {completed&&<p role="status">Completed file ready: {completed.name}</p>}
  <form onSubmit={event=>void submit(event)}>
   {file&&<label><input type="checkbox" checked={attested} disabled={busy||opening||Boolean((selectedAssignment||needsEdited)&&!completed)}
    onChange={event=>setAttested(event.target.checked)}/>
    I am submitting my own document. Any signature or initials I added are mine and
    intended as my marks. I understand HR must independently review this document.</label>}
   <button type="submit" disabled={!file||!attested||busy||opening||Boolean((selectedAssignment||needsEdited)&&!completed)}>
    {busy?"Submitting securely…":"Submit PDF to HR"}</button>
  </form>
  {notice&&<p role="status">{notice}</p>}
  {originalsError&&<p role="status">Submitted document history could not be verified. Do not assume no records exist.</p>}
  {loaded&&<div>
   <h4>Documents received by HR</h4>
   {records.length===0?<p>No submitted PDFs yet.</p>:
    <ul>{records.slice(0,10).map(item=><li key={item.id}>
     {item.kind} · {item.createdAt.slice(0,10)} · {item.status}
    </li>)}</ul>}
  </div>}
 </section>;
}
