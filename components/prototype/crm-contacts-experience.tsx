"use client";
import {useMemo,useState} from "react";
import type {FormEvent} from "react";
import {ArrowUpDown} from "lucide-react";
import {useWorkspace} from "../../lib/workspace-context";
import {useCrm} from "../../lib/crm-context";
import {useRuntimeMode} from "../../lib/runtime-mode";
import {momentumStorage} from "../../lib/persistence";
import {downloadCsv} from "../../lib/browser-export";
import {visibleCrmContacts,type ContactSort} from "../../lib/crm-contacts-view";
import type {CrmContact} from "../../lib/crm-engine";
import {navigateToRoute} from "../../lib/navigation-store";

const decisionRoles:CrmContact["decisionRole"][]=["Decision maker","Influencer","Billing","Operations","Other"];
const go=(to:string,label:string)=><button type="button" className="prototype-link" onClick={()=>navigateToRoute(to)}>{label}</button>;
const contactUrl=(id:string)=>"/crm/contacts/"+encodeURIComponent(id);
function useContactWritePermission(){
  const {currentUser}=useWorkspace(),runtime=useRuntimeMode();
  return runtime.isDemo&&momentumStorage.mode()==="local"&&["Administrator","Sales Manager","Sales Representative"].includes(currentUser?.role??"");
}

export function CrmContactsDirectory(){
  const {scope}=useWorkspace(),{crm}=useCrm(),canWrite=useContactWritePermission();
  const allowedLocations=useMemo(()=>new Set(scope.accounts.map(a=>a.id)),[scope.accounts]);
  const allowedCustomers=useMemo(()=>new Set(scope.accounts.map(a=>a.customerId).filter((id):id is string=>Boolean(id))),[scope.accounts]);
  const businessNames=useMemo(()=>new Map(scope.accounts.map(a=>[a.id,a.name])),[scope.accounts]);
  const [query,setQuery]=useState(""),[decisionRole,setDecisionRole]=useState("all"),[active,setActive]=useState("true");
  const [sort,setSort]=useState<ContactSort>("name"),[ascending,setAscending]=useState(true);
  const contacts=useMemo(()=>visibleCrmContacts(crm.contacts,allowedLocations,allowedCustomers,businessNames,{query,active,decisionRole,sort,ascending}),[crm.contacts,allowedLocations,allowedCustomers,businessNames,query,active,decisionRole,sort,ascending]);
  const heading=(field:ContactSort,label:string)=><button type="button" aria-label={"Sort contacts by "+label} onClick={()=>{if(sort===field)setAscending(value=>!value);else{setSort(field);setAscending(true);}}}>{label} <ArrowUpDown size={13}/></button>;
  const exportRows=contacts.map(c=>({contact:c.name,business:businessNames.get(c.locationId??"")??"Customer-wide",role:c.role,email:c.email??"",phone:c.phone??"",decisionRole:c.decisionRole,active:c.active?"Active":"Inactive"}));
  return <main className="prototype-workspace"><header className="prototype-heading"><h1>Contacts</h1><p>Independent contact records associated with authorized businesses and customer locations.</p>
    {canWrite&&<button type="button" onClick={()=>navigateToRoute("/crm/contacts/new")}>New contact</button>}</header>
    <section className="prototype-panel" aria-label="CRM contacts">
      <div className="prototype-controls">
        <label>Find contacts <input aria-label="Search CRM contacts" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Name, role, company or email"/></label>
        <label>Decision role <select aria-label="Contact decision role filter" value={decisionRole} onChange={event=>setDecisionRole(event.target.value)}><option value="all">All</option>{decisionRoles.map(role=><option key={role}>{role}</option>)}</select></label>
        <label>Active status <select aria-label="Contact active filter" value={active} onChange={event=>setActive(event.target.value)}><option value="true">Active</option><option value="false">Inactive</option><option value="all">All</option></select></label>
        <button type="button" onClick={()=>{setQuery("");setDecisionRole("all");setActive("true");setSort("name");setAscending(true);}}>Clear filters</button>
        <button type="button" disabled={!contacts.length} onClick={()=>downloadCsv("momentum-authorized-contacts.csv",exportRows,["contact","business","role","email","phone","decisionRole","active"])}>Export visible contacts</button>
      </div>
      <p role="status" className="prototype-note">{contacts.length} matching contact{contacts.length===1?"":"s"}</p>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>
        <th>{heading("name","Contact")}</th><th>{heading("business","Business")}</th><th>{heading("role","Title")}</th><th>Decision role</th><th>Email</th><th>Phone</th><th>Active</th><th>{heading("created","Created")}</th>
      </tr></thead><tbody>{contacts.map(contact=><tr key={contact.id}>
        <td>{go(contactUrl(contact.id),contact.name)}</td><td>{contact.locationId?go("/sales/customers/"+encodeURIComponent(contact.locationId),businessNames.get(contact.locationId)??"Customer location"):"Customer-wide"}</td>
        <td>{contact.role}</td><td>{contact.decisionRole}</td><td>{contact.email??"Not recorded"}</td><td>{contact.phone??"Not recorded"}</td><td>{contact.active?"Active":"Inactive"}</td><td>{contact.createdAt.slice(0,10)}</td>
      </tr>)}</tbody></table></div>
      {!contacts.length&&<div className="prototype-empty">No accessible contacts match this selection.</div>}
    </section></main>;
}

export function CrmContactEditor({id}:{id?:string}){
  const {scope,currentUser}=useWorkspace(),{crm,addContact,updateContact}=useCrm(),canWrite=useContactWritePermission();
  const contact=id?crm.contacts.find(c=>c.id===id&&(c.locationId?scope.accounts.some(a=>a.id===c.locationId):scope.accounts.some(a=>a.customerId===c.customerId))):undefined;
  const locations=scope.accounts.filter(a=>Boolean(a.customerId));
  const [locationId,setLocationId]=useState(contact?.locationId??"");
  const [name,setName]=useState(contact?.name??"");
  const [role,setRole]=useState(contact?.role??"");
  const [email,setEmail]=useState(contact?.email??"");
  const [phone,setPhone]=useState(contact?.phone??"");
  const [decisionRole,setDecisionRole]=useState<CrmContact["decisionRole"]>(contact?.decisionRole??"Decision maker");
  const [active,setActive]=useState(contact?.active??true);
  const [message,setMessage]=useState("");
  if(id&&!contact)return <main><header className="prototype-heading"><h1>Contact unavailable</h1></header><div className="prototype-empty">Contact not found or outside your authorized business scope.</div>{go("/crm/contacts","Back to contacts")}</main>;
  const location=scope.accounts.find(a=>a.id===(contact?.locationId??locationId));
  const editable=canWrite&&(!contact||contact.createdBy!=="system");
  const submit=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(!editable||!currentUser){setMessage("Editing is unavailable for this record or environment.");return;}
    if(!name.trim()||!role.trim()||name.trim().length>160||role.trim().length>100){setMessage("Name and role are required, within the maximum field lengths.");return;}
    if(email.trim()&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())){setMessage("Enter a valid email address or leave it blank.");return;}
    if(!contact){
      if(!location?.customerId||!locations.some(a=>a.id===location.id)){setMessage("Select a location with a canonical customer account.");return;}
      const created=addContact({scope:"Location",locationId:location.id,customerId:location.customerId,name:name.trim(),role:role.trim(),email:email.trim()||undefined,phone:phone.trim()||undefined,decisionRole,primary:false,active:true});
      if(!created){setMessage("Contact creation rejected. Verify your role, account and location relationship.");return;}
      navigateToRoute(contactUrl(created));
    }else{
      const result=updateContact(contact.id,{name:name.trim(),role:role.trim(),email:email.trim()||undefined,phone:phone.trim()||undefined,decisionRole,active});
      setMessage(result.ok?"Contact updated in this isolated CRM demonstration workspace.":result.message??"Contact update rejected.");
    }
  };
  const relatedOrders=contact?.locationId?scope.orders.filter(o=>!o.testOnly&&o.accountId===contact.locationId).sort((a,b)=>b.placedAt.localeCompare(a.placedAt)):[];
  const relatedActivities=contact?.locationId?crm.interactions.filter(a=>a.locationId===contact.locationId&&(a.contactId===contact.id||!a.contactId)).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)).slice(0,20):[];
  return <main className="prototype-workspace"><header className="prototype-heading">{go("/crm/contacts","Back to contacts")}<h1>{contact?.name??"New contact"}</h1>
    <p>{contact?"Contact profile and authorized linked business records.":"Create a real independent contact identity linked to one authorized customer location."}</p></header>
    {contact&&<section className="prototype-panel"><h2>Linked business</h2>
      <div className="prototype-controls">{location?go("/sales/customers/"+encodeURIComponent(location.id),location.name):"Customer-wide contact"}
        {location&&["Prospect","Qualified","Sampled"].includes(location.stage)&&go("/crm/leads/"+encodeURIComponent(location.id),"Open lead")}
      </div><p className="prototype-note">Contact ID: {contact.id} · {contact.primary?"Primary":"Additional"} · {contact.createdBy==="system"?"Canonical account contact (read-only)": "Independently recorded contact"}.</p>
    </section>}
    <section className="prototype-panel"><h2>{contact?"Contact details":"New contact details"}</h2>
      {!editable&&<p className="prototype-note" role="status">{!canWrite?"Read-only in connected mode.":"Canonical account-sourced contacts must be edited through the separately authorized account workflow."}</p>}
      <form aria-label={contact?"Edit CRM contact":"Create CRM contact"} onSubmit={submit}>
      <div className="prototype-controls">
        <label>Customer location <select aria-label="Contact customer location" required value={location?.id??locationId} disabled={Boolean(contact)||!editable} onChange={event=>setLocationId(event.target.value)}>
          <option value="">Choose location</option>{locations.map(a=><option key={a.id} value={a.id}>{a.name} · {a.location}</option>)}</select></label>
        <label>Contact name <input required maxLength={160} value={name} disabled={!editable} onChange={event=>setName(event.target.value)}/></label>
        <label>Title or role <input required maxLength={100} value={role} disabled={!editable} onChange={event=>setRole(event.target.value)}/></label>
        <label>Email <input type="email" value={email} maxLength={254} disabled={!editable} onChange={event=>setEmail(event.target.value)}/></label>
        <label>Phone <input type="tel" value={phone} maxLength={60} disabled={!editable} onChange={event=>setPhone(event.target.value)}/></label>
        <label>Decision role <select value={decisionRole} disabled={!editable} onChange={event=>setDecisionRole(event.target.value as CrmContact["decisionRole"])}>{decisionRoles.map(d=><option key={d}>{d}</option>)}</select></label>
        {contact?.createdBy!=="system"&&contact&&<label>Contact status <select value={active?"active":"inactive"} disabled={!editable} onChange={event=>setActive(event.target.value==="active")}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>}
      </div>{editable&&<div className="prototype-controls"><button type="submit">{contact?"Save contact":"Create contact"}</button>{go("/crm/contacts","Cancel")}</div>}
      {message&&<p role="status">{message}</p>}</form>
      <p className="prototype-note">Contact creation and changes are local-demo-only. Customer-wide and primary identity changes are intentionally excluded pending account-owner reconciliation and production authorization.</p>
    </section>
    {contact&&<section className="prototype-panel"><h2>Related sales orders</h2>
      <p className="prototype-note">Customer-location orders are not attributed to this person without explicit evidence.</p>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Order</th><th>Placed</th><th>Status</th></tr></thead><tbody>{relatedOrders.map(order=><tr key={order.id}><td>{go("/sales/orders/"+encodeURIComponent(order.id),order.number)}</td><td>{order.placedAt.slice(0,10)}</td><td>{order.status}</td></tr>)}</tbody></table></div>
      {!relatedOrders.length&&<div className="prototype-empty">No related location orders visible.</div>}
    </section>}
    {contact&&<section className="prototype-panel"><h2>Recent related activity</h2>
      {relatedActivities.map(activity=><div className="prototype-activity" key={activity.id}><strong>{activity.summary}</strong><span>{activity.occurredAt.slice(0,10)} · {activity.type}</span></div>)}
      {!relatedActivities.length&&<div className="prototype-empty">No recorded activity for this contact/location.</div>}
    </section>}
  </main>;
}
