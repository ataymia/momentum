"use client";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {useFirebaseSessionOptional} from "../../lib/firebase-session-context";
import {useWorkspace} from "../../lib/workspace-context";
import {inspectHrPdf} from "../../lib/hr-pdf-editor-engine";
import {mapHrPdfFields} from "../../lib/hr-pdf-mapping";
import {
 HR_TEMPLATE_CHOICES,listHrTemplates,registerHrTemplate,uploadBlankHrTemplate,
 type HrTemplateKind,type HrTemplateFieldHint,
 type HrTemplateRecord,type UploadedHrTemplate,type HrTemplateRegistration,
} from "../../lib/firebase-hr-template-library";

const newHint=(count:number):HrTemplateFieldHint=>({
 id:"placeholder-"+count,label:"",type:"Text",signer:"Worker",required:true,
});
/** Administrators upload blank originals only. This is not an e-sign interface. */
export function HrTemplateUploadPanel(){
 const {currentUser}=useWorkspace();
 const firebase=useFirebaseSessionOptional();
 const [kind,setKind]=useState<HrTemplateKind>("W9");
 const [title,setTitle]=useState("IRS Form W-9");
 const [edition,setEdition]=useState("");
 const [selected,setSelected]=useState<File|null>(null);
 const [blankConfirmed,setBlankConfirmed]=useState(false);
 const [hints,setHints]=useState<HrTemplateFieldHint[]>([]);
 const [counter,setCounter]=useState(1);
 const [busy,setBusy]=useState(false);
 const [detecting,setDetecting]=useState(false);
 const [message,setMessage]=useState("");
 const [listed,setListed]=useState(false);
 const [registered,setRegistered]=useState<HrTemplateRecord[]>([]);
 const [pending,setPending]=useState<{
  upload:UploadedHrTemplate;requestId:string;template:HrTemplateRegistration;
 }|null>(null);
 const fileInput=useRef<HTMLInputElement|null>(null);
 const uploadId=useRef<string|null>(null);
 const session=firebase?.session;
 const admin=currentUser?.role==="Administrator"&&Boolean(session);
 const reload=async()=>{
  if(!session)return;
  const records=await listHrTemplates(session);
  setRegistered(records);setListed(true);
 };
 useEffect(()=>{
  if(!admin||!session)return;
  let alive=true;
  const load=async()=>{
   try{
    const records=await listHrTemplates(session);
    if(alive){setRegistered(records);setListed(true);}
   }catch(error){
    if(alive){setListed(false);setMessage(
     error instanceof Error?error.message:"Private HR templates unavailable.");}
   }
  };
  void load();
  return()=>{alive=false;};
 },[admin,session]);
 if(!admin)return null;
 const save=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  if(busy)return;
  if(!selected&&!pending){setMessage("Choose a blank official or approved agreement PDF.");return;}
  if(!blankConfirmed){setMessage("Confirm the PDF is blank, not completed tax or identity paperwork.");return;}
  if(!pending&&hints.some(hint=>hint.label.trim().length<2)){
   setMessage("Name every form-field placeholder or remove unused rows.");return;
  }
  setBusy(true);setMessage("");
  try{
   if(!uploadId.current)uploadId.current=crypto.randomUUID().replaceAll("-","");
   const upload=pending?.upload??await uploadBlankHrTemplate(
    selected!,kind,uploadId.current);
   const requestId=pending?.requestId??crypto.randomUUID().replaceAll("-","");
   const template:HrTemplateRegistration=pending?.template??{
    kind:upload.kind,title:title.trim(),edition:edition.trim(),
    storagePath:upload.storagePath,sha256:upload.sha256,
    fields:hints.map(hint=>({
     ...hint,label:hint.label.trim(),
     ...(hint.pdfFieldName?.trim()?{pdfFieldName:hint.pdfFieldName.trim()}:{pdfFieldName:undefined}),
    })),blankTemplateConfirmed:true,
   };
   setPending({upload,requestId,template});
   const receipt=await registerHrTemplate(session!,template,requestId);
   setMessage("Blank PDF "+receipt.templateId+
    " source-verified and registered as Pending HR form and signer review. This is NOT a signed document or legal clearance.");
   setPending(null);uploadId.current=null;setSelected(null);
   setBlankConfirmed(false);setHints([]);
   if(fileInput.current)fileInput.current.value="";
   try{await reload();}
   catch{setMessage("Template was successfully registered, but its list could not refresh. Check the private registry before repeating.");}
  }catch(error){
   setMessage(error instanceof Error?error.message:
    "Upload not confirmed. Retry using the original request ID.");
  }finally{setBusy(false);}
 };
 return <section className="prototype-panel" aria-label="Secure blank HR form templates">
  <h2>Private HR form upload and signer-field preparation</h2>
  <p className="prototype-note">Upload <strong>unsigned blank PDFs only</strong>. Templates are uploaded by a trusted server and stored in an immutable Administrator-readable folder and rechecked by the backend using the actual PDF bytes and SHA-256. Uploaded templates remain pending review; Momentum does not automatically sign, approve or archive completed W-9, I-9 or W-4 forms.</p>
  <form className="prototype-order-form" onSubmit={event=>void save(event)}>
   <div className="form-grid">
    <label>Form category
     <select aria-label="HR template category" value={kind} disabled={busy||Boolean(pending)}
      onChange={event=>{const next=event.target.value as HrTemplateKind;
       setKind(next);setTitle(HR_TEMPLATE_CHOICES.find(item=>item.kind===next)?.title??"");
       setSelected(null);setMessage("");setBlankConfirmed(false);uploadId.current=null;
       if(fileInput.current)fileInput.current.value="";}}>
      {HR_TEMPLATE_CHOICES.map(item=><option key={item.kind} value={item.kind}>
       {item.title} ({item.worker})</option>)}
     </select>
    </label>
    <label>Template title <input aria-label="HR template title" required minLength={5} maxLength={120}
      value={title} onChange={event=>setTitle(event.target.value)} disabled={busy||Boolean(pending)}/></label>
    <label>Official edition or revision <input aria-label="HR form edition" required maxLength={64}
      value={edition} placeholder="Read exact revision from official PDF" onChange={event=>setEdition(event.target.value)} disabled={busy||Boolean(pending)}/></label>
    <label>Unsigned PDF <input ref={fileInput} aria-label="Upload blank HR PDF" type="file"
      accept=".pdf,application/pdf" disabled={busy||Boolean(pending)}
      onChange={event=>{setSelected(event.target.files?.[0]??null);setMessage("");uploadId.current=null;}}/></label>
   </div>
   {HR_TEMPLATE_CHOICES.find(item=>item.kind===kind)?.source&&<p className="prototype-note">
    Check the current official edition and instructions:
    {" "}<a href={HR_TEMPLATE_CHOICES.find(item=>item.kind===kind)!.source}
     target="_blank" rel="noopener noreferrer">Official agency form source</a>.
   </p>}
   <details><summary>Fillable PDF field discovery and signer mapping</summary>
    <div className="prototype-controls"><button type="button" disabled={!selected||busy||detecting||Boolean(pending)}
      onClick={async()=>{
       if(!selected)return;
       setDetecting(true);setMessage("");
       try{
        const inspected=await inspectHrPdf(new Uint8Array(await selected.arrayBuffer()));
        const mapped=mapHrPdfFields(inspected);
        if(mapped.hints.length){
         setHints(mapped.hints);setCounter(mapped.hints.length+1);
         setMessage("Found "+mapped.total+" PDF fields across "+inspected.pages.length+
          " page(s). "+mapped.hints.length+" mapped for review."+
          (mapped.omitted?" "+mapped.omitted+" omitted due to limits or invalid names.":""));
        }else setMessage("No embedded PDF form fields found. Add locations manually in the PDF editor.");
       }catch(error){setMessage(error instanceof Error?error.message:"PDF field detection failed.");}
       finally{setDetecting(false);}
      }}>{detecting?"Reading PDF fields…":"Find existing PDF fields"}</button></div>
    <p className="prototype-note">Existing fillable fields, including compressed AcroForms, are detected locally. Review signer assignments and required fields. Printed lines and scanned forms require manual placement in the PDF editor.</p>
    {hints.map(hint=><div className="prototype-controls" key={hint.id}>
     <label>Field label <input value={hint.label} aria-label={"HR field label "+hint.id}
       maxLength={100} onChange={e=>setHints(rows=>rows.map(r=>r.id===hint.id?{...r,label:e.target.value}:r))}/></label>
     <label>Field type <select value={hint.type} aria-label={"HR field type "+hint.id}
       onChange={e=>setHints(rows=>rows.map(r=>r.id===hint.id?{...r,type:e.target.value as HrTemplateFieldHint["type"]}:r))}>
       {["Text","Date","Checkbox","Signature","Initials"].map(type=><option key={type}>{type}</option>)}
      </select></label>
     <label>Signer <select value={hint.signer} aria-label={"HR signer role "+hint.id}
       onChange={e=>setHints(rows=>rows.map(r=>r.id===hint.id?{...r,signer:e.target.value as HrTemplateFieldHint["signer"]}:r))}>
       <option>Worker</option><option>Company</option>
      </select></label>
     <label>PDF field name (optional) <input value={hint.pdfFieldName??""} maxLength={120}
       aria-label={"HR PDF field name "+hint.id}
       onChange={e=>setHints(rows=>rows.map(r=>r.id===hint.id?{...r,pdfFieldName:e.target.value}:r))}/></label>
     <label>Required <input type="checkbox" checked={hint.required}
       aria-label={"HR field required "+hint.id}
       onChange={e=>setHints(rows=>rows.map(r=>r.id===hint.id?{...r,required:e.target.checked}:r))}/></label>
     <button type="button" disabled={busy||Boolean(pending)} onClick={()=>setHints(rows=>rows.filter(r=>r.id!==hint.id))}>Remove</button>
    </div>)}
    <button type="button" disabled={busy||Boolean(pending)||hints.length>=80} onClick={()=>{setHints(rows=>[...rows,newHint(counter)]);setCounter(x=>x+1);}}>
     Add placeholder</button>
   </details>
   <label><input type="checkbox" checked={blankConfirmed} disabled={busy||Boolean(pending)}
    onChange={event=>setBlankConfirmed(event.target.checked)}/>
    I confirm this PDF is a blank template. It contains no completed W-9, SSN/TIN, ID scan, signed original or worker-sensitive answers.</label>
   {pending&&<p role="status" className="prototype-note">
    Uploaded file is awaiting server registration. Keep this exact edition, title and field map unchanged while retrying. Source: {pending.upload.storagePath}
   </p>}
   {message&&<p role="status" className="prototype-note">{message}</p>}
   <button type="submit" disabled={busy||!blankConfirmed||(!selected&&!pending)}>
    {busy?"Verifying PDF bytes…":pending?"Retry source registration":"Upload blank PDF and register pending template"}</button>
  </form>
  <h3>Newest server-registered templates</h3>
  <button type="button" onClick={()=>void reload().catch(err=>setMessage(err instanceof Error?err.message:"Refresh failed."))}>Refresh registry</button>
  <div className="prototype-table-scroll"><table className="prototype-table"><thead>
   <tr><th>Kind</th><th>Title / edition</th><th>Scope</th><th>Source SHA-256</th><th>Status</th></tr>
  </thead><tbody>{registered.map(record=><tr key={record.id}>
   <td>{record.kind}</td><td>{record.title} · {record.edition}</td>
   <td>{record.classification}</td><td><code>{record.sha256.slice(0,14)}…</code></td>
   <td>{record.status}</td>
  </tr>)}</tbody></table></div>
  {listed&&registered.length===0&&<p className="prototype-note">No registered blank PDFs in the newest-record window.</p>}
  <p className="prototype-note">Next release gate: separately approve the PDF edition and provider field mapping, then use an authenticated form-specific signing workflow with original-PDF preservation, signer audit, correction history and retention. I-9 employer examination is independent. No completed-form upload is accepted by this template tool.</p>
 </section>;
}
