"use client";

/**
 * Department-specific Marketing operations workspace.
 * Read-only for connected data; local demo mutations use the canonical marketing
 * context and its own validation. No fake conversions or implied revenue credit.
 */
import {useState} from "react";
import {useWorkspace} from "../../lib/workspace-context";
import {useMarketing} from "../../lib/marketing-context";
import {campaignSpend,attributionSummary,materialBalance,marketingSpendReadyForReconciliation,type MarketingRequestType} from "../../lib/marketing-engine";
import {useRuntimeMode} from "../../lib/runtime-mode";
import {momentumStorage} from "../../lib/persistence";
import {downloadCsv} from "../../lib/browser-export";
import {navigateToRoute} from "../../lib/navigation-store";

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n);
type Tab="requests"|"campaigns"|"spend"|"outcomes"|"materials"|"partners";
const tabs:ReadonlyArray<{id:Tab;label:string}>=[
 {id:"requests",label:"Requests"},{id:"campaigns",label:"Campaigns"},
 {id:"spend",label:"Budget & spend"},{id:"outcomes",label:"Attribution"},
 {id:"materials",label:"Assets & stock"},{id:"partners",label:"Partnerships"},
];
const columns=(...items:string[])=>items;

export function MarketingWorkspaceExperience({initialTab="requests"}:{initialTab?:Tab}){
 const {data,currentUser}=useWorkspace();
 const {state,submitRequest,decideRequest,fulfillRequest,createCampaign,decideCampaign,setCampaignStatus,
   decideSpend,reconcileSpend,reviewAttribution}=useMarketing();
 const runtime=useRuntimeMode();
 const admin=currentUser?.role==="Administrator";
 const campaignViewer=admin;
 const demo=runtime.isDemo&&momentumStorage.mode()==="local";
 const [tab,setTab]=useState<Tab>(initialTab);
 const [query,setQuery]=useState("");
 const [status,setStatus]=useState("all");
 const [showForm,setShowForm]=useState(false);
 const [title,setTitle]=useState("");
 const [detail,setDetail]=useState("");
 const [requestType,setRequestType]=useState<MarketingRequestType>("Collateral");
 const [neededBy,setNeededBy]=useState("");
 const [name,setName]=useState("");
 const [objective,setObjective]=useState("");
 const [audience,setAudience]=useState("");
 const [start,setStart]=useState("");
 const [end,setEnd]=useState("");
 const [budget,setBudget]=useState("");
 const [measure,setMeasure]=useState("");
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");

 if(!currentUser||currentUser.role==="Customer")return <div className="prototype-empty">Marketing is not available to this account.</div>;
 const canWrite=demo&&Boolean(currentUser);
 const scopedRequests=admin?state.requests:state.requests.filter(r=>r.requesterId===currentUser.id);
 const requests=scopedRequests.filter(r=>(status==="all"||status===r.status)&&
   [r.title,r.detail,r.type,r.id].join(" ").toLowerCase().includes(query.toLowerCase()));
 const campaigns=admin?state.campaigns.filter(c=>(status==="all"||status===c.status)&&
   [c.name,c.objective,c.audience,c.id].join(" ").toLowerCase().includes(query.toLowerCase())):[];
 const spend=admin?state.spend.filter(s=>(status==="all"||status===s.status)&&
   [s.vendor,s.businessPurpose,s.category,s.id].join(" ").toLowerCase().includes(query.toLowerCase())):[];
 const attributions=admin?state.attributions.filter(a=>(status==="all"||status===(a.reviewed?"Reviewed":"Pending"))&&
   [a.sourceId,a.note,a.relation].join(" ").toLowerCase().includes(query.toLowerCase())):[];
 const materials=admin?state.materials.filter(m=>[m.name,m.id].join(" ").toLowerCase().includes(query.toLowerCase())):[];
 const partners=admin?state.partnerships.filter(p=>(status==="all"||status===p.status)&&[p.name,p.notes,p.type].join(" ").toLowerCase().includes(query.toLowerCase())):[];
 const safeExport=()=>{
   if(tab==="requests")return downloadCsv("momentum-marketing-requests.csv",requests.map(r=>({
    id:r.id,type:r.type,title:r.title,detail:r.detail,status:r.status,
    neededBy:r.neededBy??"",requesterId:r.requesterId,accountId:r.accountId??"",
    campaignId:r.campaignId??"",submittedAt:r.submittedAt,decidedAt:r.decidedAt??"",
    fulfilledAt:r.fulfilledAt??"",
   })),columns("id","type","title","detail","status","neededBy","requesterId","accountId","campaignId","submittedAt","decidedAt","fulfilledAt"));
   if(!admin)return;
   if(tab==="campaigns")return downloadCsv("momentum-marketing-campaigns.csv",campaigns.map(c=>({
     id:c.id,name:c.name,objective:c.objective,audience:c.audience,status:c.status,
     startDate:c.startDate,endDate:c.endDate,requestedBudget:c.requestedBudget,
     approvedBudget:c.approvedBudget??"",recordedSpend:campaignSpend(state,c.id),
     reviewedAttributions:attributionSummary(state,data,c.id).evidenceCount,
     successMeasure:c.successMeasure,ownerId:c.ownerId,createdAt:c.createdAt,
   })),columns("id","name","objective","audience","status","startDate","endDate","requestedBudget","approvedBudget","recordedSpend","reviewedAttributions","successMeasure","ownerId","createdAt"));
   if(tab==="spend")return downloadCsv("momentum-marketing-spend.csv",spend.map(s=>({
     id:s.id,campaignId:s.campaignId,date:s.date,vendor:s.vendor,category:s.category,
     amount:s.amount,status:s.status,businessPurpose:s.businessPurpose,
     receiptName:s.receiptName??"",submittedAt:s.submittedAt,approvedAt:s.approvedAt??"",
     reconciledAt:s.reconciledAt??"",
   })),columns("id","campaignId","date","vendor","category","amount","status","businessPurpose","receiptName","submittedAt","approvedAt","reconciledAt"));
   if(tab==="outcomes")return downloadCsv("momentum-marketing-attribution.csv",attributions.map(a=>({
     id:a.id,campaignId:a.campaignId,accountId:a.accountId,sourceType:a.sourceType,
     sourceId:a.sourceId,relation:a.relation,note:a.note,reviewed:a.reviewed,
     reviewedBy:a.reviewedBy??"",reviewedAt:a.reviewedAt??"",
   })),columns("id","campaignId","accountId","sourceType","sourceId","relation","note","reviewed","reviewedBy","reviewedAt"));
   if(tab==="materials")return downloadCsv("momentum-marketing-materials.csv",materials.map(m=>({
     id:m.id,name:m.name,unit:m.unit,reorderPoint:m.reorderPoint,
     recordedOnHand:materialBalance(state,m.id),active:m.active,
   })),columns("id","name","unit","reorderPoint","recordedOnHand","active"));
   if(tab==="partners")return downloadCsv("momentum-marketing-partners.csv",partners.map(p=>({
     id:p.id,name:p.name,type:p.type,status:p.status,campaignId:p.campaignId??"",
     startDate:p.startDate??"",endDate:p.endDate??"",contact:p.contact??"",
     notes:p.notes,ownerId:p.ownerId,
   })),columns("id","name","type","status","campaignId","startDate","endDate","contact","notes","ownerId"));
 };
 const submit=()=>{
   setError("");setMessage("");
   if(!currentUser||!canWrite)return setError("Changes are disabled on connected data.");
   if(tab==="requests"){
     const id=submitRequest({requesterId:currentUser.id,type:requestType,title:title.trim(),
       detail:detail.trim(),neededBy:neededBy||undefined});
     if(!id)return setError("Request needs a title, detail, and valid requested date.");
     setTitle("");setDetail("");setNeededBy("");setShowForm(false);
     setMessage("Request recorded: "+id);return;
   }
   if(tab==="campaigns"&&admin){
     const amount=Number(budget);
     const id=createCampaign({name:name.trim(),objective:objective.trim(),audience:audience.trim(),
       startDate:start,endDate:end,requestedBudget:amount,ownerId:currentUser.id,
       successMeasure:measure.trim()});
     if(!id)return setError("Campaign needs objective, audience, dates, success measure and valid requested budget.");
     setName("");setObjective("");setAudience("");setStart("");setEnd("");setBudget("");setMeasure("");
     setShowForm(false);setMessage("Campaign submitted for approval: "+id);return;
   }
 };
 const action=(label:string,run:()=>void)=>{
   if(!admin||!demo)return;
   run();setError("");setMessage(label+" submitted in local demo. Confirm the recorded state in the register; the action may be rejected by source validation.");
 };
 const filteredCount=tab==="requests"?requests.length:tab==="campaigns"?campaigns.length:
   tab==="spend"?spend.length:tab==="outcomes"?attributions.length:tab==="materials"?materials.length:partners.length;
 return <div className="prototype-domain prototype-domain--marketing">
   <header className="prototype-heading"><h1>Marketing Operations</h1>
     <p>{admin?"Retail demand, campaign approvals, budget control, collateral, partnerships and commercial attribution. Amounts are sourced from recorded state; missing source evidence is not represented as a completed result.":"Submit and track requests for collateral, events, creative work and partnerships. Campaign approvals, budgets and attribution are managed by authorized administrators."}</p>
   </header>
   <div className="prototype-domain-statbar">
    <article><small>Requests waiting</small><strong>{scopedRequests.filter(r=>r.status==="Submitted").length}</strong></article>
    {admin&&<article><small>Campaigns awaiting approval</small><strong>{state.campaigns.filter(c=>c.status==="Awaiting approval").length}</strong></article>}
    {admin&&<article><small>Approved / reconciled spend</small><strong>{money(state.spend.filter(s=>["Approved","Reconciled"].includes(s.status)).reduce((n,s)=>n+s.amount,0))}</strong></article>}
    {admin&&<article><small>Reviewed outcome evidence</small><strong>{state.attributions.filter(a=>a.reviewed).length}</strong></article>}
   </div>
   {!demo&&<p className="prototype-note">Connected records are read-only in this redesign. Record mutations require separately authorized server-side controls. Exports show only your permitted records.</p>}
   <nav aria-label="Marketing workstreams" className="prototype-tabs">
    {tabs.filter(t=>admin||t.id==="requests").map(t=><button key={t.id} type="button"
      className={tab===t.id?"is-active":""} aria-current={tab===t.id?"page":undefined}
      onClick={()=>{setTab(t.id);setStatus("all");setQuery("");setShowForm(false);setError("");setMessage("");}}>{t.label}</button>)}
   </nav>
   <section className="prototype-panel">
     <div className="prototype-controls">
      <label className="prototype-search"><input aria-label="Search marketing records" value={query}
        onChange={e=>setQuery(e.target.value)} placeholder="Search current workstream"/></label>
      <label>Status <select value={status} onChange={e=>setStatus(e.target.value)}>
        <option value="all">All</option>
        {(tab==="requests"?["Submitted","Approved","Returned","Fulfilled"]:
          tab==="campaigns"?["Awaiting approval","Approved","Active","Complete","Returned","Cancelled"]:
          tab==="spend"?["Submitted","Approved","Returned","Reconciled"]:
          tab==="outcomes"?["Pending","Reviewed"]:tab==="partners"?["Prospect","Active","Complete","Declined"]:[]).map(s=><option key={s} value={s}>{s}</option>)}
      </select></label>
      <button type="button" disabled={!filteredCount} onClick={safeExport}>Download filtered CSV</button>
      {canWrite&&(tab==="requests"||admin&&tab==="campaigns")&&<button type="button" className="prototype-primary-action"
        onClick={()=>setShowForm(v=>!v)}>{showForm?"Close form":tab==="requests"?"Submit request":"Plan campaign"}</button>}
      {admin&&demo&&<button type="button" onClick={()=>navigateToRoute("/marketing/workflow")}>Full marketing workflow</button>}
     </div>
     {showForm&&tab==="requests"&&<div className="form-grid">
        <label>Request type <select value={requestType} onChange={e=>setRequestType(e.target.value as MarketingRequestType)}>
          {(["Collateral","Samples / event","Creative","Partnership"] as const).map(s=><option key={s}>{s}</option>)}
        </select></label>
        <label>Title <input value={title} onChange={e=>setTitle(e.target.value)}/></label>
        <label>Requested by date <input type="date" value={neededBy} onChange={e=>setNeededBy(e.target.value)}/></label>
        <label>Business purpose / deliverable <textarea value={detail} onChange={e=>setDetail(e.target.value)} rows={3}/></label>
        <button type="button" disabled={!title.trim()||!detail.trim()} onClick={submit}>Record marketing request</button>
     </div>}
     {showForm&&tab==="campaigns"&&admin&&<div className="form-grid">
       <label>Name <input value={name} onChange={e=>setName(e.target.value)}/></label>
       <label>Audience <input value={audience} onChange={e=>setAudience(e.target.value)}/></label>
       <label>Start date <input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label>
       <label>End date <input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label>
       <label>Requested budget (USD) <input type="number" min="0" step="0.01" value={budget} onChange={e=>setBudget(e.target.value)}/></label>
       <label>Objective <textarea rows={2} value={objective} onChange={e=>setObjective(e.target.value)}/></label>
       <label>Measurable result <textarea rows={2} value={measure} onChange={e=>setMeasure(e.target.value)}/></label>
       <button type="button" disabled={!name.trim()||!objective.trim()||!audience.trim()||!measure.trim()||!start||!end||!budget.trim()} onClick={submit}>Submit campaign for approval</button>
     </div>}
     {error&&<p role="alert" className="form-error">{error}</p>}
     {message&&<p role="status" className="form-notice">{message}</p>}
     {tab==="requests"&&<div className="company-request-list">
       {requests.map(r=><article key={r.id}><div><small>{r.type} · {r.submittedAt.slice(0,10)}{r.neededBy?" · needed "+r.neededBy:""}</small><strong>{r.title}</strong>
         <p>{r.detail}</p><p>{data.users.find(u=>u.id===r.requesterId)?.name??"Employee"} · {r.status}</p></div>
         {admin&&demo&&r.status==="Submitted"&&<div className="request-actions">
           <button type="button" onClick={()=>action("Request approved",()=>decideRequest(r.id,"Approved"))}>Approve</button>
           <button type="button" onClick={()=>action("Request returned",()=>decideRequest(r.id,"Returned"))}>Return</button></div>}
         {admin&&demo&&r.status==="Approved"&&<button type="button" onClick={()=>action("Fulfillment",()=>fulfillRequest(r.id))}>Mark fulfilled</button>}
       </article>)}
       {!requests.length&&<p>No requests match your filters.</p>}
     </div>}
     {tab==="campaigns"&&admin&&<div className="company-request-list">
       {campaigns.map(c=><article key={c.id}><div><small>{c.startDate} to {c.endDate} · {c.status}</small><strong>{c.name}</strong><p>{c.objective}</p>
        <p>Requested {money(c.requestedBudget)} · Approved {c.approvedBudget==null?"Not approved":money(c.approvedBudget)} · Recorded spend {money(campaignSpend(state,c.id))}</p>
        <p>Success measure: {c.successMeasure}. Reviewed outcome links: {attributionSummary(state,data,c.id).evidenceCount}.</p></div>
        {demo&&c.status==="Awaiting approval"&&<div className="request-actions">
         <button type="button" onClick={()=>action("Campaign approved",()=>decideCampaign(c.id,"Approved"))}>Approve budget</button>
         <button type="button" onClick={()=>action("Campaign returned",()=>decideCampaign(c.id,"Returned"))}>Return</button></div>}
        {demo&&c.status==="Approved"&&<button type="button" onClick={()=>action("Campaign activated",()=>setCampaignStatus(c.id,"Active"))}>Activate</button>}
        {demo&&c.status==="Active"&&<button type="button" onClick={()=>action("Campaign completed",()=>setCampaignStatus(c.id,"Complete"))}>Complete</button>}
       </article>)}
       {!campaigns.length&&<p>No campaigns match your filters.</p>}
     </div>}
     {tab==="spend"&&admin&&<div className="company-request-list">
       {spend.map(s=><article key={s.id}><div><small>{s.date} · {s.status}</small><strong>{s.vendor} · {money(s.amount)}</strong>
         <p>{state.campaigns.find(c=>c.id===s.campaignId)?.name??"Campaign missing"} · {s.category}</p>
         <p>{s.businessPurpose} · Receipt: {s.receiptName??"Not recorded"}</p></div>
         {demo&&s.status==="Submitted"&&<div className="request-actions">
          <button type="button" onClick={()=>action("Spend approved",()=>decideSpend(s.id,"Approved"))}>Approve</button>
          <button type="button" onClick={()=>action("Spend returned",()=>decideSpend(s.id,"Returned"))}>Return</button></div>}
         {demo&&s.status==="Approved"&&<button type="button" disabled={!marketingSpendReadyForReconciliation(s)} title={marketingSpendReadyForReconciliation(s)?"Record local reconciliation":"Prior approval and receipt reference are required"} onClick={()=>action("Spend reconciliation",()=>reconcileSpend(s.id))}>Record reconciliation</button>}
       </article>)}{!spend.length&&<p>No marketing spend records match.</p>}
     </div>}
     {tab==="outcomes"&&admin&&<div className="company-request-list">
       {attributions.map(a=><article key={a.id}><div><small>{a.sourceType} · {a.relation} · {a.reviewed?"Reviewed":"Not reviewed"}</small>
       <strong>{state.campaigns.find(c=>c.id===a.campaignId)?.name??"Campaign not found"}</strong>
       <p>Source {a.sourceId} · Account {data.accounts.find(x=>x.id===a.accountId)?.name??"Unknown"}</p><p>{a.note}</p></div>
       {demo&&!a.reviewed&&<button type="button" onClick={()=>action("Attribution evidence review",()=>reviewAttribution(a.id))}>Verify evidence</button>}
       </article>)}{!attributions.length&&<p>No reviewed or pending attribution evidence matching this filter. Do not equate associated orders with proven marketing credit.</p>}
     </div>}
     {tab==="materials"&&admin&&<div className="company-request-list">
       {materials.map(m=><article key={m.id}><div><small>Reorder at {m.reorderPoint} {m.unit}</small>
         <strong>{m.name}</strong><p>Recorded balance: {materialBalance(state,m.id)} {m.unit}</p></div></article>)}
       {!materials.length&&<p>No materials match your search.</p>}
     </div>}
     {tab==="partners"&&admin&&<div className="company-request-list">
       {partners.map(p=><article key={p.id}><div><small>{p.type} · {p.status}</small><strong>{p.name}</strong>
        <p>{p.notes}</p><p>{p.contact??"Contact not recorded"}</p></div></article>)}
       {!partners.length&&<p>No matching partnerships.</p>}
     </div>}
   </section>
   <p className="prototype-note">Campaign spend and paid-order association are not interchangeable. Source-linked, reviewed attribution is shown separately from total sales. No money, email, or payroll is executed from this screen. A receipt filename or local reconciliation label is not proof of bank settlement.</p>
 </div>;
}
