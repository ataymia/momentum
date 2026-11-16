"use client";

import {useRef,useState} from "react";
import type {FormEvent} from "react";
import {canCreateAccount} from "../../lib/access";
import {useFirebaseSessionOptional} from "../../lib/firebase-session-context";
import {createConnectedCrmAccount} from "../../lib/firebase-crm-account-creation";
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
  const {scope,currentUser,createAccount}=useWorkspace();
  const runtime=useRuntimeMode();
  const firebase=useFirebaseSessionOptional();
  const pendingRequest=useRef<{fingerprint:string;id:string}|null>(null);
  const [open,setOpen]=useState(false);
  const [saving,setSaving]=useState(false);
  const [form,setForm]=useState<LeadCreateDraft>({...blank});
  const [message,setMessage]=useState("");
  const demoWrite=canCreateAccount(currentUser)&&runtime.isDemo&&momentumStorage.mode()==="local";
  const connectedWrite=Boolean(!runtime.isDemo&&firebase?.session&&currentUser&&
    ["Administrator","Sales Manager"].includes(currentUser.role));
  const allowed=demoWrite||connectedWrite;
  if(!allowed)return <span className="prototype-note">Only an authorized manager or Administrator can create a connected prospect.</span>;
  const change=(field:keyof LeadCreateDraft,value:string)=>{
    setForm(s=>({...s,[field]:value}));setMessage("");pendingRequest.current=null;
  };
  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(!allowed||saving)return;
    const validation=validateLeadCreateDraft(form,scope.accounts);
    if(!validation.ok){
      setMessage(validation.message+(validation.duplicateAccountId?" Existing ID: "+validation.duplicateAccountId:""));
      return;
    }
    if(demoWrite){
      const id=createAccount(validation.payload,validation.territoryReason);
      if(!id){
        setMessage("Creation rejected. Check role, territory exception reason, and duplicate-account controls.");
        return;
      }
      setForm({...blank});setMessage("");setOpen(false);
      navigateToRoute("/crm/leads/"+encodeURIComponent(id));
      return;
    }
    if(!firebase?.session||!connectedWrite){
      setMessage("A current authorized session is required to save a prospect.");
      return;
    }
    const fingerprint=JSON.stringify(validation.payload);
    if(!pendingRequest.current||pendingRequest.current.fingerprint!==fingerprint)
      pendingRequest.current={fingerprint,id:crypto.randomUUID().replaceAll("-","")};
    setSaving(true);setMessage("");
    try{
      const receipt=await createConnectedCrmAccount(firebase.session,validation.payload,pendingRequest.current.id);
      if(!receipt.readbackVerified){
        setMessage("CRM received the request but the saved prospect is not yet readable. Check the account list before retrying this form.");
        return;
      }
      const refreshed=await momentumStorage.refreshKeys(["momentum-demo-workspace-v5"]);
      if(!refreshed.ok){
        setMessage("Prospect exists in CRM but the current workspace has not synchronized. Refresh connected records before retrying.");
        return;
      }
      pendingRequest.current=null;
      setForm({...blank});setOpen(false);setMessage("");
      navigateToRoute("/crm/leads/"+encodeURIComponent(receipt.accountId));
    }catch(error){
      setMessage(error instanceof Error?error.message:"CRM did not confirm the new prospect. Check records before retrying.");
    }finally{setSaving(false);}
  };
  return <div className="prototype-panel">
    <div className="prototype-controls">
      <button type="button" aria-expanded={open} onClick={()=>{setOpen(v=>!v);setMessage("");}}>{open?"Close lead creation":"Create lead"}</button>
      <span className="prototype-small">New leads start as prospects. Prices, credit and orders require separate approval.</span>
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
      <div className="prototype-controls"><button type="submit" disabled={saving}>{saving?"Saving prospect…":"Save prospect"}</button><button type="button" disabled={saving} onClick={()=>{setOpen(false);setMessage("");}}>Cancel</button></div>
    </form>}
  </div>;
}
