"use client";
import {useMemo,useState} from "react";
import type {FormEvent} from "react";
import {ArrowUpDown} from "lucide-react";
import {useWorkspace} from "../../lib/workspace-context";
import {useRuntimeMode} from "../../lib/runtime-mode";
import {useCrm} from "../../lib/crm-context";
import type {Opportunity,OpportunityStage} from "../../lib/crm-engine";
import {visibleDeals,type DealSort} from "../../lib/crm-deals-view";
import {momentumStorage} from "../../lib/persistence";
import {navigateToRoute} from "../../lib/navigation-store";

const OPEN_STAGES:OpportunityStage[]=["Prospecting","Qualified","Sample / evaluation","Commercial review","Order pending"];
const ALL_STAGES:OpportunityStage[]=[...OPEN_STAGES,"Won","Lost"];
const selectableRole=(role:string|undefined)=>["Administrator","Sales Manager","Sales Representative"].includes(role??"");
const url=(id:string)=>"/crm/deals/"+encodeURIComponent(id);
const go=(path:string,label:string)=><button type="button" className="prototype-link" onClick={()=>navigateToRoute(path)}>{label}</button>;

export function DealsDirectory(){
  const {scope,data,currentUser}=useWorkspace();
  const {crm}=useCrm();
  const runtime=useRuntimeMode();
  const canWrite=runtime.isDemo&&momentumStorage.mode()==="local"&&selectableRole(currentUser?.role);
  const ids=useMemo(()=>new Set(scope.accounts.map(account=>account.id)),[scope.accounts]);
  const [query,setQuery]=useState("");
  const [stage,setStage]=useState("all");
  const [status,setStatus]=useState("all");
  const [ownerId,setOwnerId]=useState("all");
  const [sort,setSort]=useState<DealSort>("updated");
  const [ascending,setAscending]=useState(false);
  const rows=useMemo(()=>visibleDeals(crm.opportunities,ids,{query,stage,status,ownerId,sort,ascending}),[crm.opportunities,ids,query,stage,status,ownerId,sort,ascending]);
  const owners=[...new Set(crm.opportunities.filter(deal=>ids.has(deal.locationId)).map(deal=>deal.ownerId))];
  const header=(field:DealSort,label:string)=><button type="button" aria-label={"Sort deals by "+label} onClick={()=>{if(sort===field)setAscending(value=>!value);else{setSort(field);setAscending(field==="name");}}}>{label} <ArrowUpDown size={13}/></button>;
  return <main className="prototype-workspace">
    <header className="prototype-heading"><h1>Deals</h1><p>Opportunity pipeline connected to authorized customer locations. CRM outcomes do not issue orders or recognize revenue.</p>
      {canWrite&&<button type="button" onClick={()=>navigateToRoute("/crm/deals/new")}>New deal</button>}</header>
    <section className="prototype-panel" aria-label="Deal register">
      <div className="prototype-controls">
        <label>Search deals <input aria-label="Search deals" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Deal, stage or next action"/></label>
        <label>Stage <select aria-label="Deal stage filter" value={stage} onChange={event=>setStage(event.target.value)}><option value="all">All stages</option>{ALL_STAGES.map(value=><option key={value}>{value}</option>)}</select></label>
        <label>Status <select aria-label="Deal status filter" value={status} onChange={event=>setStatus(event.target.value)}><option value="all">All statuses</option><option>Open</option><option>Won</option><option>Lost</option></select></label>
        <label>Representative <select aria-label="Deal representative filter" value={ownerId} onChange={event=>setOwnerId(event.target.value)}><option value="all">All accessible representatives</option>{owners.map(id=><option value={id} key={id}>{data.users.find(user=>user.id===id)?.name??id}</option>)}</select></label>
        <button type="button" onClick={()=>{setQuery("");setStage("all");setStatus("all");setOwnerId("all");setSort("updated");setAscending(false);}}>Clear filters</button>
      </div>
      <p className="prototype-note" role="status">{rows.length} matching deal{rows.length===1?"":"s"}</p>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>
        <th>{header("name","Deal")}</th><th>Customer location</th><th>Stage</th><th>Status</th><th>Representative</th>
        <th>{header("cases","Estimated cases")}</th><th>{header("nextAction","Next action date")}</th><th>{header("updated","Updated")}</th>
      </tr></thead><tbody>{rows.map(deal=>{
        const account=scope.accounts.find(item=>item.id===deal.locationId);
        return <tr key={deal.id}><td>{go(url(deal.id),deal.name)}</td><td>{account?go("/sales/customers/"+encodeURIComponent(account.id),account.name):"Unavailable"}</td>
          <td>{deal.stage}</td><td>{deal.status}</td><td>{data.users.find(user=>user.id===deal.ownerId)?.name??"Unassigned"}</td>
          <td>{deal.estimatedCases??"Not estimated"}</td><td>{deal.nextActionDate||"Not scheduled"}</td><td>{deal.updatedAt.slice(0,10)}</td></tr>;
      })}</tbody></table></div>
      {!rows.length&&<div className="prototype-empty">No deals match these filters in your authorized locations.</div>}
    </section>
  </main>;
}

export function DealEditor({id}:{id?:string}){
  const {scope,data,currentUser}=useWorkspace();
  const runtime=useRuntimeMode();
  const {crm,addOpportunity,updateOpportunity}=useCrm();
  const deal=id?crm.opportunities.find(item=>item.id===id&&scope.accounts.some(account=>account.id===item.locationId)):undefined;
  const canWrite=runtime.isDemo&&momentumStorage.mode()==="local"&&selectableRole(currentUser?.role);
  const available=scope.accounts.filter(account=>Boolean(account.customerId));
  const [locationId,setLocationId]=useState(deal?.locationId??"");
  const [name,setName]=useState(deal?.name??"");
  const [stage,setStage]=useState<OpportunityStage>(deal?.stage??"Prospecting");
  const [cases,setCases]=useState(deal?.estimatedCases===undefined?"":String(deal.estimatedCases));
  const [closeDate,setCloseDate]=useState(deal?.expectedCloseDate??"");
  const [nextAction,setNextAction]=useState(deal?.nextAction??"");
  const [nextActionDate,setNextActionDate]=useState(deal?.nextActionDate??"");
  const [lossReason,setLossReason]=useState(deal?.lossReason??"");
  const [feedback,setFeedback]=useState("");
  const account=scope.accounts.find(item=>item.id===(deal?.locationId??locationId));
  const relatedOrders=deal?scope.orders.filter(order=>!order.testOnly&&order.accountId===deal.locationId).sort((a,b)=>b.placedAt.localeCompare(a.placedAt)):[];

  if(id&&!deal)return <main><header className="prototype-heading"><h1>Deal unavailable</h1></header><div className="prototype-empty">The deal does not exist or is outside your authorized CRM scope.</div>{go("/crm/deals","Back to deals")}</main>;
  const submit=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(!canWrite){setFeedback("Editing is unavailable outside isolated local demonstration mode.");return;}
    if(!account||!account.customerId||(!deal&&!available.some(item=>item.id===locationId))){setFeedback("Select an authorized customer location with a verified account ID.");return;}
    if(!name.trim()||name.trim().length>160||(!nextAction.trim()&&stage!=="Won"&&stage!=="Lost")){setFeedback("Enter a deal name and next action before saving an open deal.");return;}
    const estimatedCases=cases.trim()?Number(cases):undefined;
    if(estimatedCases!==undefined&&(!Number.isInteger(estimatedCases)||estimatedCases<0)){setFeedback("Estimated cases must be a nonnegative whole number.");return;}
    if(stage==="Lost"&&lossReason.trim().length<3){setFeedback("A specific loss reason is required.");return;}
    if(closeDate&&!/^\d{4}-\d{2}-\d{2}$/.test(closeDate)){setFeedback("Enter a valid expected close date.");return;}
    if(nextActionDate&&!/^\d{4}-\d{2}-\d{2}$/.test(nextActionDate)){setFeedback("Enter a valid next-action date.");return;}
    const status:Opportunity["status"]=stage==="Won"?"Won":stage==="Lost"?"Lost":"Open";
    if(deal){
      const result=updateOpportunity(deal.id,{name:name.trim(),stage,status,estimatedCases,expectedCloseDate:closeDate,nextAction:nextAction.trim(),nextActionDate,lossReason:stage==="Lost"?lossReason.trim():""});
      setFeedback(result.ok?"Changes saved in the isolated CRM demonstration workspace. No order or invoice was generated.":(result.message??"Update rejected by CRM validation."));
    }else{
      const created=addOpportunity({customerId:account.customerId,locationId:account.id,name:name.trim(),stage,estimatedCases,expectedCloseDate:closeDate||undefined,nextAction:nextAction.trim(),nextActionDate,status:"Open"});
      if(!created){setFeedback("Deal creation rejected. Check the account relationship, current representative and CRM permissions.");return;}
      navigateToRoute(url(created));
    }
  };
  return <main className="prototype-workspace">
    <header className="prototype-heading">{go("/crm/deals","Back to deals")}<h1>{deal?deal.name:"New deal"}</h1>
      <p>{deal?"Review the opportunity, update its outcome, and inspect related business records.":"Create a qualified sales opportunity against a canonical customer location."}</p></header>
    {deal&&<section className="prototype-panel" aria-label="Deal relationships">
      <div className="prototype-controls"><span>Status: {deal.status}</span><span>Owner: {data.users.find(user=>user.id===deal.ownerId)?.name??"Unassigned"}</span>
        {account&&go("/sales/customers/"+encodeURIComponent(account.id),"Open customer account")}
        {account&&["Prospect","Qualified","Sampled"].includes(account.stage)&&go("/crm/leads/"+encodeURIComponent(account.id),"Open lead")}
      </div>
      <p className="prototype-note">Opportunity ID: {deal.id}. Owner and customer IDs are inherited from canonical records, not editable on this form. Closing a deal is a CRM outcome only.</p>
    </section>}
    <section className="prototype-panel"><h2>{deal?"Edit deal":"Deal details"}</h2>
      {!canWrite&&<p role="status" className="prototype-note">Read-only. Updates are disabled for connected sessions and outside isolated local demo mode.</p>}
      <form onSubmit={submit} aria-label={deal?"Edit deal":"Create deal"}>
        <div className="prototype-controls"><label>Customer location <select aria-label="Deal customer location" value={deal?.locationId??locationId} disabled={Boolean(deal)||!canWrite} required onChange={event=>setLocationId(event.target.value)}>
          <option value="">Select customer location</option>{available.map(item=><option key={item.id} value={item.id}>{item.name} · {item.location}</option>)}</select></label>
          <label>Deal name <input required maxLength={160} value={name} disabled={!canWrite} onChange={event=>setName(event.target.value)}/></label>
          <label>Stage <select aria-label="Deal stage" value={stage} disabled={!canWrite} onChange={event=>setStage(event.target.value as OpportunityStage)}>
            {(deal?ALL_STAGES:OPEN_STAGES).map(value=><option key={value}>{value}</option>)}</select></label>
          <label>Estimated cases <input type="number" min="0" step="1" value={cases} disabled={!canWrite} onChange={event=>setCases(event.target.value)}/></label>
          <label>Expected close <input type="date" value={closeDate} disabled={!canWrite} onChange={event=>setCloseDate(event.target.value)}/></label>
          <label>Next action <input maxLength={240} value={nextAction} disabled={!canWrite} required={stage!=="Won"&&stage!=="Lost"} onChange={event=>setNextAction(event.target.value)}/></label>
          <label>Next action date <input type="date" value={nextActionDate} disabled={!canWrite} onChange={event=>setNextActionDate(event.target.value)}/></label>
          {stage==="Lost"&&<label>Loss reason <textarea minLength={3} required value={lossReason} disabled={!canWrite} onChange={event=>setLossReason(event.target.value)}/></label>}</div>
        {canWrite&&<div className="prototype-controls"><button type="submit">{deal?"Save changes":"Create deal"}</button>{go("/crm/deals","Cancel")}</div>}
        {feedback&&<p role="status">{feedback}</p>}
      </form>
    </section>
    {deal&&<section className="prototype-panel"><h2>Related sales orders</h2>
      <p className="prototype-note">Orders are displayed by canonical customer location. They are not automatically attributed to this deal.</p>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Order</th><th>Placed</th><th>Status</th><th>Cases</th></tr></thead><tbody>{relatedOrders.map(order=><tr key={order.id}><td>{go("/sales/orders/"+encodeURIComponent(order.id),order.number)}</td><td>{order.placedAt.slice(0,10)}</td><td>{order.status}</td><td>{order.cases}</td></tr>)}</tbody></table></div>
      {!relatedOrders.length&&<div className="prototype-empty">No linked-location sales orders have been recorded.</div>}
    </section>}
  </main>;
}
