"use client";
import {type FormEvent,useEffect,useMemo,useState} from "react";
import {Download,MessageSquare,Search} from "lucide-react";
import {useWorkspace} from "../../lib/workspace-context";
import {useRuntimeMode} from "../../lib/runtime-mode";
import {momentumStorage} from "../../lib/persistence";
import {downloadCsv} from "../../lib/browser-export";
import {navigateToRoute,useNavigationRoute} from "../../lib/navigation-store";
import {SUPPORT_CASE_KEY,type SupportCase,type CaseDraft,type CaseStatus,createCase,changeCase,restoreDemoCases,supportRole,visibleCase,managerCase,caseNextStatuses,caseStatusLabel,caseAssignableStaff} from "../../lib/support-cases-engine";

const statuses:CaseStatus[]=["Open","Investigating","Waiting","Resolved","Closed"];
const priorities=["Low","Normal","High","Critical"] as const;
const categories=["Delivery","Billing","Product","Account","Other"] as const;
const fresh:CaseDraft={title:"",description:"",accountId:"",orderId:"",priority:"Normal",category:"Delivery"};
export function SupportCasesExperience(){
 const {data,scope,currentUser}=useWorkspace();const mode=useRuntimeMode();const path=useNavigationRoute();
 const demo=mode.isDemo&&momentumStorage.mode()==="local";
 const [items,setItems]=useState<SupportCase[]>(()=>{if(!mode.isDemo||typeof window==="undefined")return [];try{return restoreDemoCases(JSON.parse(momentumStorage.getItem(SUPPORT_CASE_KEY)??"[]"),new Set(data.users.map(u=>u.id)));}catch{return [];}});
 const [draft,setDraft]=useState<CaseDraft>(fresh),[newOpen,setNewOpen]=useState(false);
 const [search,setSearch]=useState(""),[status,setStatus]=useState("all"),[order,setOrder]=useState("updatedAt"),[asc,setAsc]=useState(false);
 const [note,setNote]=useState(""),[reason,setReason]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState("");
 useEffect(()=>{if(demo)momentumStorage.setItem(SUPPORT_CASE_KEY,JSON.stringify(items));},[demo,items]);
 const accounts=useMemo(()=>new Set(scope.accounts.map(a=>a.id)),[scope.accounts]);
 const orders=useMemo(()=>new Map(scope.orders.filter(o=>!o.testOnly).map(o=>[o.id,o.accountId])),[scope.orders]);
 const names=new Map(data.users.map(u=>[u.id,u]));
 const permitted=items.filter(c=>visibleCase(currentUser,accounts,c));
 const routeId=path.startsWith("/support/cases/")?decodeURIComponent(path.slice("/support/cases/".length).split("/")[0]):undefined;
 const selected=routeId?permitted.find(c=>c.id===routeId):undefined;
 const staff=new Map((selected?caseAssignableStaff(data,currentUser,selected):[]).map(u=>[u.id,u]));
 const list=permitted.filter(c=>(status==="all"||c.status===status)&&[c.title,c.description,c.id,c.category,scope.accounts.find(a=>a.id===c.accountId)?.name].join(" ").toLowerCase().includes(search.trim().toLowerCase())).sort((a,b)=>{
   const v=(x:SupportCase)=>order==="priority"?String(priorities.indexOf(x.priority)):String(x[order as "updatedAt"|"title"|"status"]);
   return (asc?1:-1)*v(a).localeCompare(v(b))||a.id.localeCompare(b.id);
 });
 const submit=(e:FormEvent)=>{e.preventDefault();if(!demo){setError("Case creation requires isolated demo mode.");return;}
  const c=createCase(draft,currentUser,accounts,orders,"case-"+crypto.randomUUID(),new Date().toISOString());
  if(!c){setError("Enter a valid title (4+), detail (12+), accessible customer and matching order. Representatives must select a customer.");return;}
  setItems(items=>[c,...items]);setDraft(fresh);setNewOpen(false);setError("");setNotice("Case recorded locally. No customer message was sent.");navigateToRoute("/support/cases/"+encodeURIComponent(c.id));
 };
 const update=(action:"Note"|"Status"|"Owner",value:string)=>{
   if(!demo||!selected){setError("Connected cases are read-only.");setNotice("");return false;}
   const next=changeCase(selected,currentUser,accounts,action,value,reason,staff,"event-"+crypto.randomUUID(),new Date().toISOString());
   if(!next){setError("Update rejected. Check permissions, the next status, and your explanation.");setNotice("");return false;}
   setItems(rows=>rows.map(c=>c.id===next.id?next:c));setError("");setNotice("Case event saved in local demo history.");
   if(action==="Note")setNote("");
   if(action==="Status")setReason("");
   return true;
 };
 const exportList=()=>downloadCsv("momentum-visible-support-cases.csv",list.map(c=>({id:c.id,account:scope.accounts.find(a=>a.id===c.accountId)?.name??"",order:c.orderId??"",title:c.title,category:c.category,priority:c.priority,status:c.status,owner:names.get(c.ownerId)?.name??"Unknown",updatedAt:c.updatedAt})),["id","account","order","title","category","priority","status","owner","updatedAt"]);
 if(!supportRole(currentUser))return <div className="prototype-empty">This workspace is restricted to authorized Sales and Operations personnel.</div>;
 if(routeId&&!selected)return <div className="prototype-domain"><h1>Case not found or access denied</h1><button onClick={()=>navigateToRoute("/support/cases")}>Back to Cases</button></div>;
 return <div className="prototype-domain">
 <header className="prototype-heading"><h1><MessageSquare size={19}/> {selected?selected.title:"Customer support cases"}</h1><p>Source-linked service issues with ownership, next steps and an immutable event trail in the isolated prototype.</p></header>
 {!demo&&<p className="prototype-note" role="status">Connected case data is not yet authorized for production. This screen is read-only; notifications, secure attachments and customer portal access are not active.</p>}
 {selected?<div className="prototype-columns"><section className="prototype-panel"><h2>Case overview</h2>
 <dl className="prototype-facts"><div><dt>Status</dt><dd>{caseStatusLabel(selected.status)}</dd></div><div><dt>Priority</dt><dd>{selected.priority}</dd></div><div><dt>Category</dt><dd>{selected.category}</dd></div><div><dt>Account</dt><dd>{scope.accounts.find(a=>a.id===selected.accountId)?.name??"Internal issue"}</dd></div><div><dt>Order</dt><dd>{selected.orderId??"None"}</dd></div><div><dt>Owner</dt><dd>{names.get(selected.ownerId)?.name??"Unassigned"}</dd></div></dl>
 <p>{selected.description}</p>{selected.orderId&&<button onClick={()=>navigateToRoute("/sales/orders/"+encodeURIComponent(selected.orderId!))}>Open source order</button>}
 {demo&&managerCase(currentUser,accounts,selected)&&<div className="prototype-controls"><label>Decision evidence <input value={reason} aria-label="Case status evidence" placeholder="Reason for status change" onChange={e=>setReason(e.target.value)}/></label>
 <label>Status transition <select aria-label="Next case status" defaultValue="" onChange={e=>{if(e.target.value)update("Status",e.target.value);e.target.value="";}}><option value="">Choose next state</option>{caseNextStatuses(selected.status).map(s=><option key={s} value={s}>{caseStatusLabel(s)}</option>)}</select></label>
 {["Administrator","Operations"].includes(currentUser?.role??"")&&<label>Assign to <select value={selected.ownerId} onChange={e=>update("Owner",e.target.value)}>{!staff.has(selected.ownerId)&&<option value={selected.ownerId} disabled>{names.get(selected.ownerId)?.name??"Previous owner"} (not eligible)</option>}
 {[...staff.values()].map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label>}
 </div>}
 <button onClick={()=>navigateToRoute("/support/cases")}>Back to case directory</button></section>
 <section className="prototype-panel"><h2>Recorded activity</h2>{[...selected.history].reverse().map(h=><div className="prototype-work-list" key={h.id}><strong>{h.action}: {h.detail}</strong><span>{names.get(h.actorId)?.name??"Employee"} · {h.at.slice(0,16).replace("T"," ")}</span></div>)}
 <form className="prototype-controls" onSubmit={e=>{e.preventDefault();update("Note",note);}}><label>Internal note <textarea aria-label="Case note" value={note} onChange={e=>setNote(e.target.value)} rows={3} minLength={4}/></label><button disabled={!demo} type="submit">Record note</button></form></section></div>:
 <><div className="prototype-domain-statbar"><article><small>Visible cases</small><strong>{permitted.length}</strong></article><article><small>Open / investigating</small><strong>{permitted.filter(c=>["Open","Investigating"].includes(c.status)).length}</strong></article><article><small>Awaiting customer</small><strong>{permitted.filter(c=>c.status==="Waiting").length}</strong></article></div>
 <section className="prototype-panel"><h2>Case directory</h2><div className="prototype-controls">
 <label className="prototype-search"><Search size={14}/><input aria-label="Search cases" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Title, category, customer or ID"/></label>
 <label>Status <select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option>{statuses.map(s=><option key={s} value={s}>{caseStatusLabel(s)}</option>)}</select></label>
 <label>Sort <select value={order} onChange={e=>setOrder(e.target.value)}><option value="updatedAt">Updated date</option><option value="title">Title</option><option value="status">Status</option><option value="priority">Priority</option></select></label>
 <button onClick={()=>setAsc(a=>!a)}>{asc?"Ascending":"Descending"}</button><button disabled={!list.length} onClick={exportList}><Download size={14}/> Export permitted records</button>
 <button disabled={!demo} onClick={()=>setNewOpen(v=>!v)}>{newOpen?"Close form":"Open new case"}</button>
 </div><div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Case</th><th>Customer</th><th>Status</th><th>Priority</th><th>Owner</th><th>Updated</th></tr></thead><tbody>{list.map(c=><tr key={c.id}><td><button className="prototype-link" onClick={()=>navigateToRoute("/support/cases/"+encodeURIComponent(c.id))}>{c.title}</button></td><td>{scope.accounts.find(a=>a.id===c.accountId)?.name??"Internal"}</td><td>{caseStatusLabel(c.status)}</td><td>{c.priority}</td><td>{names.get(c.ownerId)?.name??"Unknown"}</td><td>{c.updatedAt.slice(0,10)}</td></tr>)}</tbody></table></div>{!list.length&&<p className="prototype-note">No matching cases in your permitted scope.</p>}</section>
 {newOpen&&<section className="prototype-panel"><h2>New issue</h2><form className="form-grid" onSubmit={submit}>
 <label>Customer <select value={draft.accountId??""} onChange={e=>setDraft(d=>({...d,accountId:e.target.value,orderId:""}))}><option value="">Internal issue</option>{scope.accounts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.location}</option>)}</select></label>
 <label>Order <select value={draft.orderId??""} onChange={e=>setDraft(d=>({...d,orderId:e.target.value}))}><option value="">No order</option>{scope.orders.filter(o=>o.accountId===draft.accountId&&!o.testOnly).map(o=><option key={o.id} value={o.id}>{o.number}</option>)}</select></label>
 <label>Category <select value={draft.category} onChange={e=>setDraft(d=>({...d,category:e.target.value as CaseDraft["category"]}))}>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
 <label>Priority <select value={draft.priority} onChange={e=>setDraft(d=>({...d,priority:e.target.value as CaseDraft["priority"]}))}>{priorities.map(p=><option key={p}>{p}</option>)}</select></label>
 <label>Title <input minLength={4} required value={draft.title} onChange={e=>setDraft(d=>({...d,title:e.target.value}))}/></label><label>Issue description <textarea rows={4} minLength={12} required value={draft.description} onChange={e=>setDraft(d=>({...d,description:e.target.value}))}/></label><button type="submit">Create demo case</button></form></section>}</>}
 {error&&<p className="prototype-note" role="alert">{error}</p>}{notice&&<p role="status" className="prototype-note">{notice}</p>}
 <p className="prototype-note">Local demo only. No outgoing customer communication, live case write, SLA clock, or backend audit has been activated.</p></div>;
}
