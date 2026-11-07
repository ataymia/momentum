"use client";

import {useMemo,useState} from "react";
import {downloadCsv} from "../../lib/browser-export";
import {useCrm} from "../../lib/crm-context";
import {navigateToRoute} from "../../lib/navigation-store";
import {useWorkspace} from "../../lib/workspace-context";
import type {Account,Activity,CustomerAccount} from "../../lib/types";

type TimelineSort="date"|"location"|"actor"|"type"|"summary";
const activityColumns=["date","location","actor","type","summary"] as const;
type TimelineRow={id:string;date:string;locationId:string;location:string;actor:string;type:string;summary:string};

export function CrmCustomerActivity({locations,canonicalActivities}:{
  locations:readonly Account[];canonicalActivities:readonly Activity[];
}){
  const {data,currentUser}=useWorkspace();
  const {crm}=useCrm();
  const [search,setSearch]=useState("");
  const [from,setFrom]=useState("");
  const [through,setThrough]=useState("");
  const [sort,setSort]=useState<TimelineSort>("date");
  const [ascending,setAscending]=useState(false);
  const ids=useMemo(()=>new Set(locations.map(location=>location.id)),[locations]);
  const names=useMemo(()=>new Map(data.users.map(user=>[user.id,user.name])),[data.users]);
  const places=useMemo(()=>new Map(locations.map(location=>[location.id,location.locationName??location.name])),[locations]);
  const canonicalIds=useMemo(()=>new Set(canonicalActivities.map(item=>"crm-"+item.id)),[canonicalActivities]);
  const rows=useMemo(()=>{
    const canonical:TimelineRow[]=canonicalActivities.filter(a=>a.accountId&&ids.has(a.accountId)).map(a=>({
      id:a.id,date:a.at,locationId:a.accountId!,
      location:places.get(a.accountId!)??"Authorized location",
      actor:names.get(a.userId)??"Unverified actor",
      type:a.type,summary:a.title+" · "+a.detail,
    }));
    const independent:TimelineRow[]=crm.interactions.filter(item=>ids.has(item.locationId)&&!canonicalIds.has(item.id)).map(item=>({
      id:item.id,date:item.occurredAt,locationId:item.locationId,
      location:places.get(item.locationId)??"Authorized location",
      actor:names.get(item.userId)??"Unverified actor",
      type:item.type,summary:item.summary,
    }));
    return [...canonical,...independent]
      .filter(row=>(!from||row.date.slice(0,10)>=from)&&(!through||row.date.slice(0,10)<=through))
      .filter(row=>[row.location,row.actor,row.type,row.summary].join(" ").toLowerCase().includes(search.trim().toLowerCase()))
      .sort((a,b)=>{
        const key=(row:TimelineRow)=>sort==="date"?row.date:String(row[sort]);
        return (ascending?1:-1)*(key(a).localeCompare(key(b),undefined,{numeric:true})||a.id.localeCompare(b.id));
      });
  },[canonicalActivities,crm.interactions,ids,places,names,canonicalIds,search,from,through,sort,ascending]);
  if(!currentUser||currentUser.role==="Customer")return <p>Staff authorization is required to review internal customer activity.</p>;
  const column=(key:TimelineSort,label:string)=><th aria-sort={sort===key?(ascending?"ascending":"descending"):"none"}><button type="button" aria-label={"Sort account activity by "+label} onClick={()=>{if(sort===key)setAscending(v=>!v);else{setSort(key);setAscending(true);}}}>{label}</button></th>;
  return <section className="prototype-panel" aria-label="Customer activity">
    <h2>Account activity</h2><p className="prototype-note">Actual accessible location activities plus independently logged CRM interactions. System-generated mirrors are deduplicated. This does not invent customer emails or external communications.</p>
    <div className="prototype-controls">
      <label>Search <input type="search" aria-label="Find customer activity" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Activity, representative or location"/></label>
      <label>From <input type="date" aria-label="Customer activity from" value={from} onChange={e=>setFrom(e.target.value)}/></label>
      <label>Through <input type="date" aria-label="Customer activity through" value={through} onChange={e=>setThrough(e.target.value)}/></label>
      <button type="button" disabled={!rows.length} onClick={()=>downloadCsv("momentum-customer-activity.csv",rows.map(({date,location,actor,type,summary})=>({date,location,actor,type,summary})),activityColumns)}>Export filtered activity</button>
    </div>
    <p role="status" className="prototype-note">{rows.length} related events in the selected date range.</p>
    <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>{column("date","Date")}{column("location","Store location")}{column("actor","Actor")}{column("type","Event type")}{column("summary","Summary")}<th>Record</th></tr></thead>
      <tbody>{rows.map(row=><tr key={row.id}><td>{row.date.slice(0,16).replace("T"," ")}</td><td>{row.location}</td><td>{row.actor}</td><td>{row.type}</td><td>{row.summary}</td>
        <td><button type="button" className="prototype-link" onClick={()=>navigateToRoute("/sales/customers/"+encodeURIComponent(row.locationId))}>Open location</button></td></tr>)}</tbody>
    </table></div>{!rows.length&&<div className="prototype-empty">No matching recorded activities for these accessible locations.</div>}
  </section>;
}

export function CrmCustomerDocuments({customer,locations}:{
  customer?:CustomerAccount;locations:readonly Account[];
}){
  const {currentUser}=useWorkspace();
  if(!currentUser)return <p>Sign in to view account document status.</p>;
  const records=[
    {title:"Resale / exemption certificate",status:customer?.taxDocumentType&&customer.taxDocumentType!=="Undetermined"?customer.taxDocumentType:"Unverified / not recorded",detail:customer?.taxExemptionStatus??"No verified certificate record available"},
    {title:"Arizona TPT registration reference",status:customer?.azTptLicenseNumber?"Reference on file":"Not recorded",detail:"A recorded number does not establish verified registration or resale eligibility"},
    {title:"Customer onboarding package",status:customer?.onboardingPackageStatus??"Not started",detail:"Status is metadata; signed files and version-specific evidence require provider verification"},
    {title:"Customer-location attachments",status:"Not available in this register",detail:"No authenticated document vault or approved customer-level attachments source is connected"},
  ];
  return <section className="prototype-panel" aria-label="Customer document status">
    <h2>Documents and compliance records</h2>
    <p className="prototype-note">Source-backed customer onboarding metadata only. This screen does not create, sign, verify or download documents. A missing document is not silently treated as complete.</p>
    <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Document category</th><th>Recorded status</th><th>Evidence limitation</th></tr></thead>
      <tbody>{records.map(record=><tr key={record.title}><td>{record.title}</td><td>{record.status}</td><td>{record.detail}</td></tr>)}</tbody>
    </table></div>
    <p className="prototype-note">{locations.length} authorized locations share this recorded billing parent. Uploaded files, signed-original verification and secure download permissions remain blocked pending an approved document provider.</p>
  </section>;
}

export function CrmCustomerRepresentatives({locations}:{
  locations:readonly Account[];
}){
  const {data,currentUser}=useWorkspace();
  const {crm}=useCrm();
  const ids=useMemo(()=>new Set(locations.map(a=>a.id)),[locations]);
  const names=useMemo(()=>new Map(data.users.map(u=>[u.id,u.name])),[data.users]);
  const [query,setQuery]=useState("");
  const history=useMemo(()=>crm.responsibilityHistory.filter(event=>ids.has(event.locationId))
    .filter(event=>[names.get(event.toUserId),names.get(event.fromUserId??""),event.reason].join(" ").toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a,b)=>b.effectiveAt.localeCompare(a.effectiveAt)||a.id.localeCompare(b.id)),
    [crm.responsibilityHistory,ids,names,query]);
  if(!currentUser||currentUser.role==="Customer")return <div className="prototype-empty">Staff authorization is required to review internal sales attribution and responsibility history.</div>;
  return <section className="prototype-panel" aria-label="Customer representative attribution">
    <h2>Current responsibility and historical credit</h2>
    <p className="prototype-note">Store ownership, original acquisition and order credit are separate fields. Transfers cannot rewrite old orders or automatically reassign commission.</p>
    <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Location</th><th>Responsible rep</th><th>Originating rep</th><th>Closer</th><th>Account manager</th></tr></thead><tbody>
      {locations.map(a=><tr key={a.id}><td>{a.locationName??a.name}</td><td>{names.get(a.ownerId)??"Unassigned"}</td><td>{a.originatorId?names.get(a.originatorId)??"Unverified":"Not recorded"}</td><td>{a.closerId?names.get(a.closerId)??"Unverified":"Not recorded"}</td><td>{a.accountManagerId?names.get(a.accountManagerId)??"Unverified":"Not recorded"}</td></tr>)}
    </tbody></table></div>
    <h3>Responsibility change history</h3><label>Search history <input type="search" value={query} aria-label="Search responsibility history" onChange={e=>setQuery(e.target.value)}/></label>
    <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Date</th><th>Location</th><th>From</th><th>To</th><th>Reason / actor</th></tr></thead><tbody>
      {history.map(event=><tr key={event.id}><td>{event.effectiveAt.slice(0,10)}</td><td>{locations.find(a=>a.id===event.locationId)?.locationName??locations.find(a=>a.id===event.locationId)?.name??"Authorized location"}</td><td>{event.fromUserId?names.get(event.fromUserId)??"Unverified":"Unassigned"}</td><td>{names.get(event.toUserId)??"Unverified"}</td><td>{event.reason} · {names.get(event.changedBy)??"Unverified actor"}</td></tr>)}
    </tbody></table></div>{!history.length&&<div className="prototype-empty">No recorded responsibility transitions match.</div>}
  </section>;
}
