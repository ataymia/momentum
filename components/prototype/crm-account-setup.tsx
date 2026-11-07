"use client";

import {useState} from "react";
import type {FormEvent} from "react";
import {validateTaxIdentity} from "../../lib/account-tax-identity";
import {validateLeadCreateDraft,type LeadCreateDraft} from "../../lib/crm-lead-create";
import {navigateToRoute} from "../../lib/navigation-store";
import {momentumStorage} from "../../lib/persistence";
import {useRuntimeMode} from "../../lib/runtime-mode";
import {useWorkspace} from "../../lib/workspace-context";

const initialDraft:LeadCreateDraft={
  legalBusinessName:"",locationName:"",city:"Phoenix, AZ",streetAddress:"",postalCode:"",
  channel:"Independent retail",contactName:"",contactRole:"Owner / buyer",phone:"",email:"",territoryReason:"",
};

export function CrmAccountSetup(){
  const {scope,data,currentUser,createAccount,updateCustomerCommercial}=useWorkspace();
  const runtime=useRuntimeMode();
  const [mode,setMode]=useState<"new"|"existing">("new");
  const [draft,setDraft]=useState<LeadCreateDraft>({...initialDraft});
  const [creationMessage,setCreationMessage]=useState("");
  const [duplicateId,setDuplicateId]=useState<string|null>(null);
  const change=(field:keyof LeadCreateDraft,value:string)=>{
    setDraft(current=>({...current,[field]:value}));
    setCreationMessage("");setDuplicateId(null);
  };
  const [accountId,setAccountId]=useState("");
  const [message,setMessage]=useState("");
  const [errors,setErrors]=useState<Record<string,string>>({});
  const account=accountId?scope.accounts.find(a=>a.id===accountId):scope.accounts[0];
  const customer=(data.customers??[]).find(c=>c.id===account?.customerId);
  const isManager=Boolean(currentUser&&["Administrator","Sales Manager"].includes(currentUser.role));
  const canEdit=Boolean(currentUser&&["Administrator","Sales Manager","Sales Representative"].includes(currentUser.role)&&runtime.isDemo&&momentumStorage.mode()==="local");
  if(!currentUser||currentUser.role==="Customer")return <div className="prototype-empty">Employee account setup access is required.</div>;
  const createNew=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();setCreationMessage("");setDuplicateId(null);
    if(!canEdit){setCreationMessage("New-account creation requires an authorized, connected company write workflow. This demonstration cannot save live accounts.");return;}
    // Only suggest duplicates from visible accounts. The source-of-truth guard
    // still denies collisions elsewhere without disclosing inaccessible IDs.
    const result=validateLeadCreateDraft(draft,scope.accounts);
    if(!result.ok){
      setCreationMessage(result.message);
      if(result.duplicateAccountId&&scope.accounts.some(a=>a.id===result.duplicateAccountId))
        setDuplicateId(result.duplicateAccountId);
      return;
    }
    const id=createAccount(result.payload,result.territoryReason);
    if(!id){setCreationMessage("Creation rejected. Review duplicate account, representative and territory controls before retrying.");return;}
    setDraft({...initialDraft});
    setAccountId(id);setMode("existing");setMessage("New prospect account created in the isolated demo. Complete its billing and A/P identity below; this has not approved credit, tax status or a contract.");
  };
  const submit=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();setMessage("");setErrors({});
    if(!canEdit||!customer||!account){setMessage("Setup is read-only until authenticated server edit authorization is available.");return;}
    const dataForm=new FormData(event.currentTarget);
    const identity={
      legalBusinessName:String(dataForm.get("legalBusinessName")||"").trim(),
      ein:String(dataForm.get("ein")||"").trim(),
      azTptLicenseNumber:String(dataForm.get("azTptLicenseNumber")||"").trim(),
      taxDocumentType:String(dataForm.get("taxDocumentType")||"Undetermined") as "Undetermined"|"Taxable"|"Resale 5000A"|"Exemption 5000",
    };
    const validation=validateTaxIdentity(identity);
    if(Object.keys(validation).length){setErrors(validation);setMessage("Correct the flagged identity fields before saving.");return;}
    const patch={
      ...identity,
      billingContactName:String(dataForm.get("billingContactName")||"").trim(),
      billingEmail:String(dataForm.get("billingEmail")||"").trim(),
      billingPhone:String(dataForm.get("billingPhone")||"").trim(),
      accountsPayableContactName:String(dataForm.get("accountsPayableContactName")||"").trim(),
      accountsPayableEmail:String(dataForm.get("accountsPayableEmail")||"").trim(),
      accountsPayablePhone:String(dataForm.get("accountsPayablePhone")||"").trim(),
      // Keep any previously reviewed external package state. This form can only submit unverified preparation states.\n      ...( ["Not started","Prepared"].includes(String(dataForm.get("onboardingPackageStatus")||""))\n        ?{onboardingPackageStatus:String(dataForm.get("onboardingPackageStatus")) as "Not started"|"Prepared"}:{}),
      ...(isManager?{creditStatus:String(dataForm.get("creditStatus")||"COD") as "COD"|"Credit Requested"|"Credit Under Review"|"Net 30 Approved"|"Credit Declined"|"Personal Guaranty Required"}:
        String(dataForm.get("requestCredit")||"no")==="yes"?{creditStatus:"Credit Requested" as const}:{}),
    };
    const saved=updateCustomerCommercial(customer.id,patch);
    setMessage(saved?"Customer setup saved to local demonstration records. No external tax form, e-sign or credit approval was generated.":"Setup rejected. Verify your access and the existing customer record.");
  };
  return <main className="prototype-workspace">
    <header className="prototype-heading"><h1>Account setup</h1><p>Create a new business/location first, then complete its billing identity, tax documentation status and accounts-payable contacts. Existing customers can be updated separately.</p></header>
    <nav className="prototype-page-actionbar" aria-label="Account setup workflow">
      <button type="button" className={mode==="new"?"prototype-primary-action":""} aria-pressed={mode==="new"} onClick={()=>{setMode("new");setCreationMessage("");}}>1. Create new account</button>
      <button type="button" className={mode==="existing"?"prototype-primary-action":""} aria-pressed={mode==="existing"} onClick={()=>{setMode("existing");setCreationMessage("");}}>2. Complete existing account</button>
    </nav>
    {mode==="new"&&<section className="prototype-panel">
      <h2>New customer and first store location</h2>
      <p className="prototype-note">Create a new prospect using the same canonical customer/location records as Leads and Accounts. Account identity and territory checks run before a record is saved. No pricing, orders, bonuses, tax verification or external commitments are made here.</p>
      {!canEdit&&<p role="status" className="prototype-note">Connected account creation requires authenticated server authorization. This prototype is read-only outside isolated local demo.</p>}
      <form aria-label="Create new customer account" onSubmit={createNew}>
        <fieldset className="prototype-account-form-section"><legend>Business and location</legend>
          <div className="prototype-columns">
            <label>Legal business name <input required maxLength={160} disabled={!canEdit} value={draft.legalBusinessName} onChange={event=>change("legalBusinessName",event.target.value)} placeholder="Registered legal business name"/></label>
            <label>Store / location name <input maxLength={160} disabled={!canEdit} value={draft.locationName} onChange={event=>change("locationName",event.target.value)} placeholder="Uses business name when blank"/></label>
            <label>Street address <input required disabled={!canEdit} value={draft.streetAddress} onChange={event=>change("streetAddress",event.target.value)} placeholder="Street and suite, if applicable"/></label>
            <label>City / market <input required maxLength={120} disabled={!canEdit} value={draft.city} onChange={event=>change("city",event.target.value)}/></label>
            <label>ZIP code <input required inputMode="numeric" maxLength={10} pattern="[0-9]{5}(-[0-9]{4})?" disabled={!canEdit} value={draft.postalCode} onChange={event=>change("postalCode",event.target.value)} placeholder="85001"/></label>
            <label>Sales channel <select disabled={!canEdit} value={draft.channel} onChange={event=>change("channel",event.target.value)}>
              {["Independent retail","Convenience store","Restaurant","Hospitality","Gym / fitness","Other"].map(value=><option key={value}>{value}</option>)}
            </select></label>
          </div>
        </fieldset>
        <fieldset className="prototype-account-form-section"><legend>Primary contact</legend>
          <div className="prototype-columns">
            <label>Buyer / primary contact <input required disabled={!canEdit} value={draft.contactName} onChange={event=>change("contactName",event.target.value)}/></label>
            <label>Contact role <input required disabled={!canEdit} value={draft.contactRole} onChange={event=>change("contactRole",event.target.value)}/></label>
            <label>Business phone <input type="tel" disabled={!canEdit} value={draft.phone} onChange={event=>change("phone",event.target.value)}/></label>
            <label>Business email <input type="email" disabled={!canEdit} value={draft.email} onChange={event=>change("email",event.target.value)}/></label>
          </div>
        </fieldset>
        <fieldset className="prototype-account-form-section"><legend>Territory review</legend>
          <label>Out-of-territory explanation, if needed <textarea disabled={!canEdit} minLength={5} maxLength={500} value={draft.territoryReason} onChange={event=>change("territoryReason",event.target.value)} placeholder="Only required if this location is outside your assigned ZIP guidance"/></label>
          <p className="prototype-note">A territory exception may need approval. An unassigned or conflicting location cannot silently bypass assignment controls.</p>
        </fieldset>
        {creationMessage&&<p role="alert" className="prototype-note">{creationMessage}</p>}
        {duplicateId&&<button type="button" className="prototype-link" onClick={()=>navigateToRoute("/sales/customers/"+encodeURIComponent(duplicateId))}>Review potential duplicate</button>}
        <div className="prototype-controls"><button type="submit" className="prototype-primary-action" disabled={!canEdit}>Create account & continue setup</button>
          <button type="button" onClick={()=>{setDraft({...initialDraft});setCreationMessage("");setDuplicateId(null);}}>Clear form</button></div>
      </form>
    </section>}
    {mode==="existing"&&<section className="prototype-panel">
      <div className="prototype-controls"><label>Business location <select aria-label="Select account setup location" value={account?.id??""} onChange={e=>{setAccountId(e.target.value);setMessage("");setErrors({});}}>
        {scope.accounts.map(a=><option value={a.id} key={a.id}>{a.name} · {a.location}</option>)}</select></label>
        {account&&<button type="button" className="prototype-link" onClick={()=>navigateToRoute("/sales/customers/"+encodeURIComponent(account.id))}>Open customer profile</button>}
      </div>
      {!customer||!account?<div className="prototype-empty">Select an account that is linked to an existing customer. No billing identity will be invented.</div>:<>
        <div className="prototype-metrics"><div><small>Parent business</small><strong>{customer.name}</strong></div><div><small>Account stage</small><strong>{account.stage}</strong></div><div><small>Payment terms</small><strong>{customer.paymentTerms??"COD"}</strong></div></div>
        {!canEdit&&<p role="status" className="prototype-note">Connected account setup is read-only until creator/Administrator access and trusted account-profile writes are enforced by the backend.</p>}
        <form key={customer.id+"-"+account.id} aria-label="Customer account setup" onSubmit={submit}>
          <div className="prototype-columns">
            <label>Legal business name <input required name="legalBusinessName" disabled={!canEdit} defaultValue={customer.legalBusinessName??""}/>{errors.legalBusinessName&&<small role="alert">{errors.legalBusinessName}</small>}</label>
            <label>Tax document route <select name="taxDocumentType" disabled={!canEdit} defaultValue={customer.taxDocumentType??"Undetermined"}><option>Undetermined</option><option>Taxable</option><option value="Resale 5000A">Resale 5000A</option><option value="Exemption 5000">Exemption 5000</option></select>{errors.taxDocumentType&&<small role="alert">{errors.taxDocumentType}</small>}</label>
            <label>Arizona TPT license <input name="azTptLicenseNumber" disabled={!canEdit} defaultValue={customer.azTptLicenseNumber??""}/>{errors.azTptLicenseNumber&&<small role="alert">{errors.azTptLicenseNumber}</small>}</label>
            <label>Federal EIN <input name="ein" disabled={!canEdit} defaultValue={customer.ein??""}/>{errors.ein&&<small role="alert">{errors.ein}</small>}</label>
            <label>Billing contact <input name="billingContactName" disabled={!canEdit} defaultValue={customer.billingContactName??""}/></label>
            <label>Billing email <input type="email" name="billingEmail" disabled={!canEdit} defaultValue={customer.billingEmail??""}/></label>
            <label>Billing phone <input name="billingPhone" disabled={!canEdit} defaultValue={customer.billingPhone??""}/></label>
            <label>Accounts payable contact <input name="accountsPayableContactName" disabled={!canEdit} defaultValue={customer.accountsPayableContactName??""}/></label>
            <label>A/P email <input type="email" name="accountsPayableEmail" disabled={!canEdit} defaultValue={customer.accountsPayableEmail??""}/></label>
            <label>A/P phone <input name="accountsPayablePhone" disabled={!canEdit} defaultValue={customer.accountsPayablePhone??""}/></label>
            <label>Onboarding package <select name="onboardingPackageStatus" disabled={!canEdit} defaultValue={customer.onboardingPackageStatus??"Not started"}><option>Not started</option><option>Prepared</option>{customer.onboardingPackageStatus&&!["Not started","Prepared"].includes(customer.onboardingPackageStatus)&&<option value={customer.onboardingPackageStatus}>{customer.onboardingPackageStatus} (existing verification required)</option>}</select></label>
            {isManager?<label>Credit status <select name="creditStatus" disabled={!canEdit} defaultValue={customer.creditStatus??"COD"}><option>COD</option><option>Credit Requested</option><option>Credit Under Review</option><option>Net 30 Approved</option><option>Credit Declined</option><option>Personal Guaranty Required</option></select></label>
             :<label>Credit review <select name="requestCredit" disabled={!canEdit} defaultValue="no"><option value="no">No new request</option><option value="yes">Request manager review</option></select></label>}
          </div>
          <p className="prototype-note">Tax-document route is informational, not verified legal e-signature. Managers control credit status; representatives may request review only. Any commercial terms remain subject to approved records and company authority.</p>
          {message&&<p role="status">{message}</p>}
          {canEdit&&<div className="prototype-controls"><button type="submit">Save account setup</button></div>}
        </form>
      </>}
    </section>}
  </main>;
}
