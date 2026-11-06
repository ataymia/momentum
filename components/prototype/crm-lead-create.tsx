"use client";

import {useState} from "react";
import type {FormEvent} from "react";
import {canCreateAccount} from "../../lib/access";
import {validateLeadCreateDraft, type LeadCreateDraft} from "../../lib/crm-lead-create";
import {navigateToRoute} from "../../lib/navigation-store";
import {momentumStorage} from "../../lib/persistence";
import {useRuntimeMode} from "../../lib/runtime-mode";
import {useWorkspace} from "../../lib/workspace-context";

const blank:LeadCreateDraft={
  legalBusinessName:"",locationName:"",city:"Phoenix, AZ",streetAddress:"",
  postalCode:"",channel:"Independent retail",contactName:"",contactRole:"Owner / buyer",
  phone:"",email:"",territoryReason:"",
};

export function CrmLeadCreator(){
  const {data,currentUser,createAccount,scope}=useWorkspace();
  const runtime=useRuntimeMode();
  const [open,setOpen]=useState(false);
  const [form,setForm]=useState<LeadCreateDraft>({...blank});
  const [message,setMessage]=useState("");
  const allowed=canCreateAccount(currentUser)&&runtime.isDemo&&momentumStorage.mode()==="local";
  if(!allowed)return <span className="prototype-note">Lead creation requires authorized server writes in connected mode; no browser-only lead can be created here.</span>;
  const change=(field:keyof LeadCreateDraft,value:string)=>{setForm(s=>({...s,[field]:value}));setMessage("");};
  const submit=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(!allowed){setMessage("Lead creation is unavailable in connected mode.");return;}
    const validation=validateLeadCreateDraft(form,data.accounts);
    if(!validation.ok){
      setMessage(validation.message+(validation.duplicateAccountId?" Existing ID: "+validation.duplicateAccountId:""));
      return;
    }
    const id=createAccount(validation.payload,validation.territoryReason);
    if(!id){
      setMessage("Creation rejected. Check role, territory exception reason, and duplicate-account controls.");
      return;
    }
    // The canonical account creation records originator, responsible representative, customer identity and audit activity.
    if(!scope.accounts.some(a=>a.id===id)){
      // The refreshed workspace scope may arrive on the next render; navigate using the committed ID.
    }
    setForm({...blank});setMessage("");setOpen(false);
    navigateToRoute("/crm/leads/"+encodeURIComponent(id));
  };
  return <div className="prototype-panel">
    <div className="prototype-controls">
      <button type="button" aria-expanded={open} onClick={()=>{setOpen(v=>!v);setMessage("");}}>{open?"Close lead creation":"Create lead"}</button>
      <span className="prototype-small">Demo workspace only · new lead starts at Prospect · no orders or bonuses created</span>
    </div>
    {open&&<form className="prototype-panel" aria-label="Create sales lead" onSubmit={submit}>
      <div className="prototype-columns">
        <label>Legal business name <input required maxLength={160} value={form.legalBusinessName} onChange={e=>change("legalBusinessName",e.target.value)}/></label>
        <label>Store / location name <input maxLength={160} value={form.locationName} onChange={e=>change("locationName",e.target.value)} placeholder="Uses business name if blank"/></label>
        <label>City / market <input required maxLength={120} value={form.city} onChange={e=>change("city",e.target.value)}/></label>
        <label>Street address <input required value={form.streetAddress} onChange={e=>change("streetAddress",e.target.value)}/></label>
        <label>ZIP code <input required inputMode="numeric" maxLength={10} pattern="[0-9]{5}(-[0-9]{4})?" value={form.postalCode} onChange={e=>change("postalCode",e.target.value)}/></label>
        <label>Sales channel <select value={form.channel} onChange={e=>change("channel",e.target.value)}><option>Independent retail</option><option>Convenience store</option><option>Restaurant</option><option>Hospitality</option><option>Gym / fitness</option><option>Other</option></select></label>
        <label>Buyer / primary contact <input required value={form.contactName} onChange={e=>change("contactName",e.target.value)}/></label>
        <label>Contact role <input required value={form.contactRole} onChange={e=>change("contactRole",e.target.value)}/></label>
        <label>Phone <input type="tel" value={form.phone} onChange={e=>change("phone",e.target.value)}/></label>
        <label>Email <input type="email" value={form.email} onChange={e=>change("email",e.target.value)}/></label>
        <label>Out-of-territory explanation (when applicable) <textarea minLength={5} maxLength={500} value={form.territoryReason} onChange={e=>change("territoryReason",e.target.value)} placeholder="Required only when your assigned ZIP guidance is different"/></label>
      </div>
      <p className="prototype-note">A new lead uses the existing customer/location record and duplicate checks. Tax documents remain unverified; no billing, order, pricing, employee pay or external communication occurs.</p>
      {message&&<p role="alert">{message}</p>}
      <div className="prototype-controls"><button type="submit">Save prospect</button><button type="button" onClick={()=>{setOpen(false);setMessage("");}}>Cancel</button></div>
    </form>}
  </div>;
}
