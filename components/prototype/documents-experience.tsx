"use client";

import {useMemo,useState} from "react";
import {Download,FileText,Search,ShieldCheck} from "lucide-react";
import {downloadCsv} from "../../lib/browser-export";
import {coursesForRoleAudience} from "../../lib/training-library-engine";
import {useTrainingLibrary} from "../../lib/training-library-context";
import {useMarketing} from "../../lib/marketing-context";
import {useHcm} from "../../lib/hcm-context";
import {useWorkspace} from "../../lib/workspace-context";
import {navigateToRoute} from "../../lib/navigation-store";

type DocumentRow={id:string;source:"My HR"|"HR administration"|"Training"|"Brand assets";title:string;category:string;status:string;owner:string;version:string;recordedAt:string;url?:string;profileId?:string};
const safeExternal=(value?:string)=>{if(!value)return undefined;try{const u=new URL(value);return u.protocol==="https:"?u.toString():undefined;}catch{return undefined;}};

/** A permission-filtered index of existing source records, not a second file store or signature renderer. */
export function DocumentsExperience(){
 const {currentUser,data}=useWorkspace();
 const {hcm}=useHcm();
 const {state:training}=useTrainingLibrary();
 const {state:marketing}=useMarketing();
 const [query,setQuery]=useState("");
 const [source,setSource]=useState("all");
 const [ascending,setAscending]=useState(true);
 const admin=currentUser?.role==="Administrator";
 const marketer=currentUser?.role==="Marketing";
 const visible=useMemo(()=>{
   if(!currentUser)return [] as DocumentRow[];
   const nameFor=(id:string)=>data.users.find(u=>u.id===id)?.name??"Employee";
   const hr:DocumentRow[]=hcm.documents.filter(d=>admin||d.userId===currentUser.id).map(d=>({
     id:"hr-"+d.id,source:admin?"HR administration" as const:"My HR" as const,title:d.title,
     category:d.category,status:d.status,owner:admin?nameFor(d.userId):"My record",
     version:String(d.version),recordedAt:d.uploadedAt.slice(0,10),profileId:admin?d.userId:undefined
   }));
   const courses=admin?hcm.courses.filter(c=>c.active):coursesForRoleAudience(hcm.courses,training.audiences,currentUser.role,currentUser.team);
   const allowedCourses=new Set([...courses.map(c=>c.id),...hcm.training.filter(t=>t.userId===currentUser.id).map(t=>t.courseId)]);
   const resources:DocumentRow[]=training.materials.filter(m=>m.active&&allowedCourses.has(m.courseId)).map(m=>({
     id:"training-"+m.id,source:"Training" as const,title:m.title,category:m.kind,status:"Available",owner:hcm.courses.find(c=>c.id===m.courseId)?.title??"Training",
     version:"",recordedAt:m.updatedAt.slice(0,10),url:safeExternal(m.url)
   }));
   const assets:DocumentRow[]=admin||marketer?marketing.assets.filter(m=>admin||m.status==="Approved").map(m=>({
     id:"asset-"+m.id,source:"Brand assets" as const,title:m.name,category:m.type,status:m.status,
     owner:"Marketing",version:String(m.version),recordedAt:m.updatedAt.slice(0,10)
   })):[];
   return [...hr,...resources,...assets];
 },[currentUser,data.users,hcm.documents,hcm.courses,hcm.training,training.materials,training.audiences,marketing.assets,admin,marketer]);
 const rows=visible.filter(r=>(source==="all"||r.source===source)&&[r.title,r.category,r.status,r.owner].join(" ").toLowerCase().includes(query.trim().toLowerCase())).sort((a,b)=>(ascending?1:-1)*a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
 const exportRows=()=>downloadCsv("momentum-visible-document-register.csv",rows.map(r=>({source:r.source,title:r.title,category:r.category,status:r.status,owner:r.owner,version:r.version,recordedAt:r.recordedAt})),["source","title","category","status","owner","version","recordedAt"]);
 if(!currentUser||currentUser.role==="Customer")return <div className="prototype-empty">Employee access is required.</div>;
 return <div className="prototype-domain">
  <header className="prototype-heading"><h1><FileText size={20}/> Documents</h1><p>One searchable index of authorized document metadata, training resources and role-approved marketing assets. Existing source systems retain their originals.</p></header>
  <section className="prototype-panel"><div className="prototype-domain-statbar">
   <article><small>Visible document records</small><strong>{visible.length}</strong></article>
   <article><small>Missing HR records in scope</small><strong>{visible.filter(r=>r.source.startsWith("HR")||r.source==="My HR").filter(r=>r.status==="Missing").length}</strong></article>
   <article><small>Training resources</small><strong>{visible.filter(r=>r.source==="Training").length}</strong></article>
  </div>
   <div className="prototype-controls">
    <label className="prototype-search"><Search size={15}/><input aria-label="Search document records" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Title, category, status or owner"/></label>
    <label>Source <select aria-label="Document source filter" value={source} onChange={e=>setSource(e.target.value)}><option value="all">All authorized sources</option>
      {[...new Set(visible.map(r=>r.source))].sort().map(s=><option key={s} value={s}>{s}</option>)}</select></label>
    <button type="button" onClick={()=>setAscending(a=>!a)}>Title {ascending?"A–Z":"Z–A"}</button>
    <button type="button" onClick={exportRows} disabled={!rows.length}><Download size={15}/> Export visible metadata</button>
   </div>
   <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Document / resource</th><th>Source</th><th>Category</th><th>Status</th><th>Owner / course</th><th>Recorded</th><th>Access</th></tr></thead>
     <tbody>{rows.map(r=><tr key={r.id}><td><strong>{r.title}</strong>{r.version&&<small className="prototype-description">Version {r.version}</small>}</td>
       <td>{r.source}</td><td>{r.category}</td><td>{r.status}</td><td>{r.owner}</td><td>{r.recordedAt}</td>
       <td>{r.url?<a href={r.url} target="_blank" rel="noopener noreferrer">Open external training resource</a>:r.profileId?<button type="button" className="prototype-link" onClick={()=>navigateToRoute("/admin/employee-profiles/"+encodeURIComponent(r.profileId!)+"/documents")}>Open HR register</button>:r.source==="Training"?<button type="button" className="prototype-link" onClick={()=>navigateToRoute("/people/materials")}>Training library</button>:"Metadata only"}</td>
     </tr>)}</tbody></table></div>
    {!rows.length&&<p className="prototype-note">No authorized records match these filters.</p>}
  </section>
  <section className="prototype-panel"><h2><ShieldCheck size={18}/> Document access control</h2>
   <p className="prototype-note">HR employee records are limited to your own documents unless you are an Administrator. A stored filename or metadata entry is not proof a secure original was signed or archived. External training links have not been independently verified. Non-admin Marketing users see approved assets only; draft and retired assets remain Administrator-only. Assets without a validated download location remain metadata-only.</p>
   <p className="prototype-note">This index does not copy tax identifiers, signatures, completed PDFs, or private form field values. File downloads must continue through existing authenticated Storage permissions and an approved form provider.</p>
  </section>
 </div>;
}
