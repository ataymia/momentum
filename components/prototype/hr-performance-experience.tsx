"use client";
import {useMemo,useState} from "react";
import {Target,Download,Search} from "lucide-react";
import {useHcm} from "../../lib/hcm-context";
import {appendAudit,type Goal} from "../../lib/hcm-engine";
import {useFirebaseSessionOptional} from "../../lib/firebase-session-context";
import {employeeRosterTruth} from "../../lib/employee-roster-truth";
import {canOpenHrProvisioning} from "../../lib/hr-provisioning-access";
import {useRuntimeMode} from "../../lib/runtime-mode";
import {momentumStorage} from "../../lib/persistence";
import {useWorkspace} from "../../lib/workspace-context";
import {downloadCsv} from "../../lib/browser-export";
import {navigateToRoute,useNavigationRoute} from "../../lib/navigation-store";

export function HrPerformanceExperience(){
 const {currentUser,data,scope}=useWorkspace(),{hcm,setHcm}=useHcm(),path=useNavigationRoute();
 const [query,setQuery]=useState(""),[type,setType]=useState("all"),[status,setStatus]=useState("all");
 const [asc,setAsc]=useState(false);
 const admin=currentUser?.role==="Administrator";
 const firebase=useFirebaseSessionOptional(),runtime=useRuntimeMode();
 const canDraft=canOpenHrProvisioning({actor:currentUser,isDemo:runtime.isDemo,storageMode:momentumStorage.mode(),firebase});
 const eligible=data.users.filter(u=>u.role!=="Customer"&&employeeRosterTruth(u,hcm.employees.find(e=>e.userId===u.id),firebase?.accessRecords[u.id],Boolean(firebase?.configured)).status==="Active");
 const [draft,setDraft]=useState({userId:"",title:"",measure:"",target:"",periodStart:"",periodEnd:""}),[notice,setNotice]=useState("");
 const [pendingGoal,setPendingGoal]=useState("");
 const allowedIds=useMemo(()=>new Set(admin?data.users.filter(u=>u.role!=="Customer").map(u=>u.id):currentUser?.role==="Sales Manager"?scope.users.map(u=>u.id):currentUser?[currentUser.id]:[]),[admin,currentUser,scope.users,data.users]);
 const names=new Map(data.users.map(u=>[u.id,u.name]));
 const allRows=useMemo(()=>{
   const goals=hcm.goals.filter(g=>allowedIds.has(g.userId)).map(g=>({id:g.id,kind:"Goal" as const,userId:g.userId,title:g.title,status:g.status,period:g.periodStart+" to "+g.periodEnd,detail:g.measure+" · target: "+g.target,note:g.progressNote??""}));
   const reviews=hcm.reviews.filter(r=>allowedIds.has(r.userId)).map(r=>({id:r.id,kind:"Review" as const,userId:r.userId,title:hcm.reviewCycles.find(c=>c.id===r.cycleId)?.name??"Performance review",status:r.status,period:hcm.reviewCycles.find(c=>c.id===r.cycleId)?.periodEnd??"",detail:r.rating===undefined?"No approved rating":"Recorded rating "+r.rating,note:admin||r.userId===currentUser?.id?(r.employeeSummary??""):""}));
   return [...goals,...reviews];
 },[hcm.goals,hcm.reviews,hcm.reviewCycles,allowedIds,admin,currentUser]);
 const rows=allRows.filter(r=>(type==="all"||r.kind===type)&&(status==="all"||r.status===status)&&[r.title,names.get(r.userId),r.detail,r.period].join(" ").toLowerCase().includes(query.toLowerCase())).sort((a,b)=>(asc?1:-1)*a.period.localeCompare(b.period)||a.id.localeCompare(b.id));
 const recordId=path.startsWith("/people/performance/")?decodeURIComponent(path.slice("/people/performance/".length).split("/")[0]):undefined;
 const selected=recordId?allRows.find(r=>r.id===recordId):undefined;
 if(!currentUser||currentUser.role==="Customer")return <div className="prototype-empty">Employee access is required.</div>;
 const saveGoal=()=>{
   if(!canDraft||!eligible.some(u=>u.id===draft.userId)||!draft.title.trim()||!draft.measure.trim()||!draft.target.trim()||!draft.periodStart||!draft.periodEnd||draft.periodStart>draft.periodEnd||pendingGoal&&!hcm.goals.some(g=>g.id===pendingGoal)){setNotice("Select an active employee and enter a measurable target and valid dates. Resolve any unconfirmed draft first.");return;}
   const goal:Goal={...draft,title:draft.title.trim().slice(0,160),measure:draft.measure.trim().slice(0,240),target:draft.target.trim().slice(0,160),id:crypto.randomUUID(),status:"Draft",createdBy:currentUser.id,createdAt:new Date().toISOString()};
   setHcm(s=>appendAudit({...s,goals:[...s.goals,goal]},{actorId:currentUser.id,action:"Performance goal drafted",entityType:"Goal",entityId:goal.id,after:"Draft"}));
   setPendingGoal(goal.id);setNotice("Draft requested. Check the register and cloud sync before relying on it.");setDraft({userId:"",title:"",measure:"",target:"",periodStart:"",periodEnd:""});
 };
 const exportVisible=()=>downloadCsv("momentum-visible-performance-register.csv",rows.map(r=>({employee:names.get(r.userId)??"Employee",record:r.kind,title:r.title,status:r.status,period:r.period,measure:r.detail})),["employee","record","title","status","period","measure"]);
 return <div className="prototype-domain prototype-domain--people"><header className="prototype-heading"><h1><Target size={18}/> Performance & development</h1><p>Employee and authorized manager views of recorded goals and review cycles. No invented scores or automatic bonus entitlements.</p></header>
 {recordId&&!selected?<p className="prototype-note">The record is not available within your authorized employee scope.</p>:selected&&<section className="prototype-panel"><h2>{selected.title}</h2><p>{names.get(selected.userId)} · {selected.kind} · {selected.status}</p><p>{selected.period} · {selected.detail}</p>{selected.note&&<p>Recorded note: {selected.note}</p>}<button onClick={()=>navigateToRoute("/people/performance")}>Return to performance</button></section>}
 <div className="prototype-controls">{admin&&<button type="button" onClick={()=>navigateToRoute("/people/training")}>Review training &amp; development</button>}<button type="button" onClick={()=>navigateToRoute("/my-account/training")}>My training</button></div>
 <div className="prototype-domain-statbar"><article><small>Visible goals</small><strong>{hcm.goals.filter(g=>allowedIds.has(g.userId)).length}</strong></article><article><small>Recorded reviews</small><strong>{hcm.reviews.filter(r=>allowedIds.has(r.userId)).length}</strong></article><article><small>Review cycles</small><strong>{hcm.reviewCycles.length}</strong></article></div>
 {canDraft&&<section className="prototype-panel"><h2>Draft a performance goal</h2><p className="prototype-note">Set a measurable target for an active employee. This does not authorize bonuses or compensation changes.</p><div className="prototype-controls"><label>Employee <select value={draft.userId} onChange={e=>setDraft(d=>({...d,userId:e.target.value}))}><option value="">Select employee</option>{eligible.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label><label>Goal <input maxLength={160} value={draft.title} onChange={e=>setDraft(d=>({...d,title:e.target.value}))}/></label><label>Measure <input maxLength={240} value={draft.measure} onChange={e=>setDraft(d=>({...d,measure:e.target.value}))}/></label><label>Target <input maxLength={160} value={draft.target} onChange={e=>setDraft(d=>({...d,target:e.target.value}))}/></label><label>Start <input type="date" value={draft.periodStart} onChange={e=>setDraft(d=>({...d,periodStart:e.target.value}))}/></label><label>End <input type="date" value={draft.periodEnd} onChange={e=>setDraft(d=>({...d,periodEnd:e.target.value}))}/></label><button type="button" disabled={Boolean(pendingGoal&&!hcm.goals.some(g=>g.id===pendingGoal))} onClick={saveGoal}>Save draft goal</button></div>{notice&&<p role="status">{notice}</p>}{pendingGoal&&hcm.goals.some(g=>g.id===pendingGoal)&&<p>Draft visible in register; verify persistence after refresh.</p>}</section>}
 <section className="prototype-panel"><h2>Goal and review register</h2><div className="prototype-controls">
 <label className="prototype-search"><Search size={14}/><input aria-label="Search authorized performance" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Employee, goal or measure"/></label>
 <label>Record <select value={type} onChange={e=>setType(e.target.value)}><option value="all">All</option><option>Goal</option><option>Review</option></select></label>
 <label>Status <select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All</option>{[...new Set(allRows.map(r=>r.status))].sort().map(s=><option key={s}>{s}</option>)}</select></label>
 <button onClick={()=>setAsc(a=>!a)}>Period {asc?"oldest first":"newest first"}</button>
 <button disabled={!rows.length} onClick={exportVisible}><Download size={14}/> Export scoped records</button></div>
 <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Employee</th><th>Record</th><th>Goal / cycle</th><th>Status</th><th>Period</th><th>Measure / rating</th></tr></thead><tbody>{rows.map(r=><tr key={r.kind+"-"+r.id}><td>{names.get(r.userId)??"Employee"}</td><td>{r.kind}</td><td><button type="button" className="prototype-link" onClick={()=>navigateToRoute("/people/performance/"+encodeURIComponent(r.id))}>{r.title}</button></td><td>{r.status}</td><td>{r.period}</td><td>{r.detail}</td></tr>)}</tbody></table></div>
 {!rows.length&&<p className="prototype-note">No matching authorized goals or reviews.</p>}</section>
 <p className="prototype-note">Administrative review decisions and edits stay in their authorized source workflows. These previews cannot post pay, calculate a bonus or override employee privacy.</p></div>;
}
