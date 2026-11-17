"use client";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {useFirebaseSessionOptional} from "../../lib/firebase-session-context";
import {
 archiveHrOriginal,listHrOriginals,type HrOriginalRecord,
} from "../../lib/firebase-hr-signed-original";
import {HR_TEMPLATE_CHOICES,type HrTemplateKind} from "../../lib/firebase-hr-template-library";
import {HrPdfEditor} from "./hr-pdf-editor";

/** Worker-side PDF completion and private HR intake. Not employer approval. */
export function HrWorkerDocumentSubmission(){
 const session=useFirebaseSessionOptional()?.session;
 const [kind,setKind]=useState<HrTemplateKind>("W4");
 const [file,setFile]=useState<File|null>(null);
 const [completed,setCompleted]=useState<File|null>(null);
 const [attested,setAttested]=useState(false);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const [records,setRecords]=useState<HrOriginalRecord[]>([]);
 const [loaded,setLoaded]=useState(false);
 const pending=useRef<{fingerprint:string;id:string}|null>(null);
 const reset=()=>{pending.current=null;setAttested(false);setNotice("");};
 useEffect(()=>{
  if(!session)return;
  let alive=true;
  void listHrOriginals(session).then(rows=>{if(alive){setRecords(rows);setLoaded(true);}})
   .catch(()=>{if(alive){setLoaded(true);}});
  return()=>{alive=false;};
 },[session]);
 const submit=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  if(!session||!file||busy||!attested)return;
  const chosen=completed??file;
  const fingerprint=[kind,chosen.name,chosen.size,chosen.lastModified].join("|");
  if(!pending.current||pending.current.fingerprint!==fingerprint)
   pending.current={fingerprint,id:crypto.randomUUID().replaceAll("-","")};
  setBusy(true);setNotice("");
  try{
   const receipt=await archiveHrOriginal(session,{
    employeeUid:session.uid,kind,
    sourceType:"Employee-submitted PDF (unverified)",
    reference:"Authenticated worker self-service submission",
    pdf:chosen,attestedByWorker:true,
   },pending.current.id);
   if(receipt.employeeUid!==session.uid)
    throw new Error("Submission was not linked to the signed-in worker.");
   pending.current=null;
   setFile(null);setCompleted(null);setAttested(false);
   setNotice("Document "+receipt.recordId+
    " saved privately for HR review. This is not a compliance approval.");
   try{setRecords(await listHrOriginals(session));setLoaded(true);}
   catch{setNotice("Document securely saved, but the status list did not refresh. Do not submit a duplicate.");}
  }catch(error){
   setNotice(error instanceof Error?error.message:
    "Document submission not verified. Keep the file and retry with the same request.");
  }finally{setBusy(false);}
 };
 if(!session)return <p>Sign in before submitting HR documents.</p>;
 return <section aria-label="Worker HR PDF submission" className="onboarding-panel">
  <h3>Complete and submit a PDF</h3>
  <p>Upload your employment form, fill available PDF fields, and submit it privately for HR review. Only HR can approve the completed paperwork.</p>
  <div>
   <div className="prototype-controls">
    <label>Document type<select value={kind} disabled={busy} onChange={event=>{
     setKind(event.target.value as HrTemplateKind);reset();
    }}>{HR_TEMPLATE_CHOICES.map(item=><option key={item.kind} value={item.kind}>{item.title}</option>)}</select></label>
    <label>PDF to complete<input type="file" accept="application/pdf,.pdf" disabled={busy}
     onChange={event=>{setFile(event.target.files?.[0]??null);setCompleted(null);reset();}}/></label>
   </div>
  </div>
  {file&&<HrPdfEditor source={file} onInvalidated={()=>setCompleted(null)} onPrepared={edited=>{
   setCompleted(edited);reset();
  }}/>}
  {completed&&<p role="status">Completed file ready: {completed.name}</p>}
  <form onSubmit={event=>void submit(event)}>
   {file&&<label><input type="checkbox" checked={attested} disabled={busy}
    onChange={event=>setAttested(event.target.checked)}/>
    I am submitting my own document. Any signature or initials I added are mine and
    intended as my marks. I understand HR must independently review this document.</label>}
   <button type="submit" disabled={!file||!attested||busy}>
    {busy?"Submitting securely…":"Submit PDF to HR"}</button>
  </form>
  {notice&&<p role="status">{notice}</p>}
  {loaded&&<div>
   <h4>Documents received by HR</h4>
   {records.length===0?<p>No submitted PDFs yet.</p>:
    <ul>{records.slice(0,10).map(item=><li key={item.id}>
     {item.kind} · {item.createdAt.slice(0,10)} · {item.status}
    </li>)}</ul>}
  </div>}
 </section>;
}
