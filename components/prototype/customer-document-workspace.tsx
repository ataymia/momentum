"use client";
import {useEffect,useState} from "react";
import {currentFirebaseSession} from "../../lib/firebase-auth-rest";
import {firebaseFunctionUrl} from "../../lib/firebase-functions";
import {useRuntimeMode} from "../../lib/runtime-mode";
type Location={id:string;name:string;location:string};
type RecordRow={id:string;title:string;category:string;status:string;createdAt:string;reviewNote:string;canReview:boolean};
const categories=["Resale certificate","Business registration","Agreement","Other business document"];
async function call(body:object){
 const session=await currentFirebaseSession();
 if(!session)throw new Error("Sign in again.");
 const response=await fetch(firebaseFunctionUrl("customerDocumentsApi"),{method:"POST",headers:{authorization:"Bearer "+session.idToken,"Content-Type":"application/json"},body:JSON.stringify(body),cache:"no-store"});
 const result=await response.json();
 if(!response.ok||!result.ok)throw new Error(result.message||"Document action failed.");
 return result;
}
function encode(bytes:Uint8Array){let text="";for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(text);}
export function CustomerDocumentWorkspace({allowedIds}:{allowedIds?:readonly string[]}){
 const runtime=useRuntimeMode();
 const demo=runtime.isDemo;
 const [locations,setLocations]=useState<Location[]>([]),[accountId,setAccountId]=useState("");
 const [records,setRecords]=useState<RecordRow[]>([]),[query,setQuery]=useState(""),[title,setTitle]=useState(""),[category,setCategory]=useState(categories[0]);
 const [file,setFile]=useState<File|null>(null),[attested,setAttested]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState(""),[revision,setRevision]=useState(0),[partial,setPartial]=useState(false);
 const scopeKey=allowedIds?.join("|")??"";
 useEffect(()=>{
  if(demo)return;let live=true;
  void call({action:"locations"}).then(r=>{if(!live)return;const items=(r.locations as Location[]).filter(x=>!scopeKey||scopeKey.split("|").includes(x.id));setLocations(items);setAccountId(old=>items.some(x=>x.id===old)?old:items[0]?.id??"");}).catch(e=>{if(live)setError(String(e.message??e));});
  return()=>{live=false;};
 },[demo,scopeKey,revision]);
 useEffect(()=>{
  if(demo||!accountId)return;let live=true;
  void call({action:"list",accountId}).then(r=>{if(live){setRecords(r.records);setPartial(r.partial===true);}}).catch(e=>{if(live)setError(String(e.message??e));});
  return()=>{live=false;};
 },[accountId,demo,revision]);
 const run=async(task:()=>Promise<void>)=>{setBusy(true);setError("");setMessage("");try{await task();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
 const visible=records.filter(r=>[r.title,r.category,r.status].join(" ").toLowerCase().includes(query.toLowerCase()));
 if(demo)return <section className="prototype-panel"><h2>Business documents</h2><p>Private PDF intake and review use authenticated company storage. No real documents are stored in the isolated demonstration.</p></section>;
 return <section className="prototype-panel"><h2>Business documents</h2><p>Upload company documents for review, track their status and download the original PDF. Review does not certify a signature, tax exemption or legal compliance.</p>
 <label>Business location <select aria-label="Document business location" value={accountId} onChange={e=>{setRecords([]);setAccountId(e.target.value);}}>{locations.map(x=><option key={x.id} value={x.id}>{x.name} · {x.location}</option>)}</select></label>
 <button type="button" disabled={busy} onClick={()=>setRevision(v=>v+1)}>Refresh documents</button>
 <form onSubmit={e=>{e.preventDefault();if(!file||!accountId||!attested)return;void run(async()=>{await call({action:"upload",accountId,title,category,attested,pdfBase64:encode(new Uint8Array(await file.arrayBuffer()))});setMessage("PDF archived. Submitted for review.");setTitle("");setFile(null);setAttested(false);setRevision(v=>v+1);});}}>
 <label>Document title <input value={title} required maxLength={120} onChange={e=>setTitle(e.target.value)}/></label><label>Document category <select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(x=><option key={x}>{x}</option>)}</select></label>
 <label>PDF file (up to 5 MB) <input type="file" accept="application/pdf,.pdf" onChange={e=>{const f=e.target.files?.[0]??null;setFile(f&&f.size<=5*1024*1024?f:null);if(f&&f.size>5*1024*1024)setError("PDF exceeds 5 MB.");}}/></label>
 <label><input type="checkbox" checked={attested} onChange={e=>setAttested(e.target.checked)}/> This PDF is intended for the authorized business contacts and Momentum administrators.</label>
 <button disabled={busy||!accountId||!file||!title.trim()||!attested}>Submit PDF for review</button></form>
 {message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
 <label>Search documents <input type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label>
 <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Document</th><th>Category</th><th>Submitted</th><th>Status</th><th>Review note</th><th>Action</th></tr></thead><tbody>{visible.map(r=><tr key={r.id}><td>{r.title}</td><td>{r.category}</td><td>{r.createdAt.slice(0,10)}</td><td>{r.status}</td><td>{r.reviewNote}</td><td><button type="button" disabled={busy} onClick={()=>void run(async()=>{const result=await call({action:"download",accountId,id:r.id});const bytes=Uint8Array.from(atob(result.pdfBase64),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:"application/pdf"}));const link=document.createElement("a");link.href=url;link.download=result.filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);})}>Download PDF</button>{r.canReview&&["Reviewed","Returned"].map(status=><button key={status} disabled={busy} type="button" onClick={()=>{const note=window.prompt("Record the review reason. This is not compliance approval.");if(note?.trim())void run(async()=>{await call({action:"review",accountId,id:r.id,status,note});setRevision(v=>v+1);setMessage("Review recorded.");});}}>{status==="Reviewed"?"Mark reviewed":"Return document"}</button>)}</td></tr>)}</tbody></table></div>
 {!visible.length&&<p>No matching archived documents.</p>}{partial&&<p>Only the first 500 records are available; contact administration for older records.</p>}</section>;
}
