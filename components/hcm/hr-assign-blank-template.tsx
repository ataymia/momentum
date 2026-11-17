"use client";
import {useRef,useState} from "react";
import {useFirebaseSessionOptional} from "../../lib/firebase-session-context";
import {useWorkspace} from "../../lib/workspace-context";
import {useHcm} from "../../lib/hcm-context";
import {assignHrDocument} from "../../lib/firebase-hr-template-assignment";
import type {HrTemplateRecord} from "../../lib/firebase-hr-template-library";

export function HrAssignBlankTemplate({templates}:{templates:HrTemplateRecord[]}){
 const session=useFirebaseSessionOptional()?.session;
 const {currentUser,data}=useWorkspace();
 const {hcm}=useHcm();
 const workers=hcm.employees.filter(item=>
  data.users.some(user=>user.id===item.userId&&user.role!=="Customer"))
  .map(item=>({id:item.userId,label:data.users.find(user=>user.id===item.userId)?.name??item.employeeNumber}))
  .sort((a,b)=>a.label.localeCompare(b.label));
 const [employeeUid,setEmployeeUid]=useState("");
 const [templateId,setTemplateId]=useState("");
 const [reviewed,setReviewed]=useState(false);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const request=useRef<string|null>(null);
 if(!session||currentUser?.role!=="Administrator"||!templates.length)return null;
 const assign=async()=>{
  if(!employeeUid||!templates.some(t=>t.id===templateId)||!reviewed||busy){
   setMessage("Select a verified worker and uploaded template, then confirm the edition and field map.");return;
  }
  setBusy(true);setMessage("");
  try{
   if(!request.current)request.current=crypto.randomUUID().replaceAll("-","");
   const id=await assignHrDocument(session,employeeUid,templateId,request.current);
   setMessage("Document assigned: "+id+". The employee can open it in onboarding and submit a completed PDF for HR review.");
   request.current=null;setReviewed(false);
  }catch(error){setMessage(error instanceof Error?error.message:"Assignment not confirmed. Retry without changing the selection.");}
  finally{setBusy(false);}
 };
 return <section aria-label="Assign registered HR PDF">
  <h3>Assign a PDF to an employee</h3>
  <div className="prototype-controls">
   <label>Worker <select disabled={busy} value={employeeUid} onChange={e=>{
    setEmployeeUid(e.target.value);setReviewed(false);request.current=null;setMessage("");
   }}><option value="">Choose worker</option>{workers.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
   <label>Registered blank template<select disabled={busy} value={templateId} onChange={e=>{
    setTemplateId(e.target.value);setReviewed(false);request.current=null;setMessage("");
   }}><option value="">Choose form and edition</option>{templates.map(item=><option key={item.id} value={item.id}>
    {item.title} · {item.edition}</option>)}</select></label>
  </div>
  <label><input type="checkbox" disabled={busy} checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>
   I checked the official form edition and worker/company field assignments for this document.
   Final compliance review remains with HR.</label>
  <button type="button" disabled={busy||!employeeUid||!templateId||!reviewed}
   onClick={()=>void assign()}>{busy?"Assigning…":"Assign PDF to worker"}</button>
  {message&&<p role="status">{message}</p>}
 </section>;
}
