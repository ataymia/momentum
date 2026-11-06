"use client";

import {useState} from "react";
import type {FormEvent} from "react";
import {validateTaxIdentity} from "../../lib/account-tax-identity";
import {navigateToRoute} from "../../lib/navigation-store";
import {momentumStorage} from "../../lib/persistence";
import {useRuntimeMode} from "../../lib/runtime-mode";
import {useWorkspace} from "../../lib/workspace-context";

export function CrmAccountSetup(){
  const {scope,data,currentUser,updateCustomerCommercial}=useWorkspace();
  const runtime=useRuntimeMode();
  const [accountId,setAccountId]=useState("");
  const [message,setMessage]=useState("");
  const [errors,setErrors]=useState<Record<string,string>>({});
  const account=scope.accounts.find(a=>a.id===accountId)||scope.accounts[0];
  const customer=(data.customers??[]).find(c=>c.id===account?.customerId);
  const isManager=Boolean(currentUser&&["Administrator","Sales Manager"].includes(currentUser.role));
  const canEdit=Boolean(currentUser&&["Administrator","Sales Manager","Sales Representative"].includes(currentUser.role)&&runtime.isDemo&&momentumStorage.mode()==="local");
  if(!currentUser||currentUser.role==="Customer")return <div className="prototype-empty">Employee account setup access is required.</div>;
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
      onboardingPackageStatus:String(dataForm.get("onboardingPackageStatus")||"Not started") as "Not started"|"Prepared",
      ...(isManager?{creditStatus:String(dataForm.get("creditStatus")||"COD") as "COD"|"Credit Requested"|"Credit Under Review"|"Net 30 Approved"|"Credit Declined"|"Personal Guaranty Required"}:
        String(dataForm.get("requestCredit")||"no")==="yes"?{creditStatus:"Credit Requested" as const}:{}),
    };
    const saved=updateCustomerCommercial(customer.id,patch);
    setMessage(saved?"Customer setup saved to local demonstration records. No external tax form, e-sign or credit approval was generated.":"Setup rejected. Verify your access and the existing customer record.");
  };
  return <main className="prototype-workspace">
    <header className="prototype-heading"><h1>Account setup</h1><p>Business identity, accounts payable and credit-review handoff for an existing linked customer. This is not a contract signature or a tax filing.</p></header>
    <section className="prototype-panel">
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
            <label>Onboarding package <select name="onboardingPackageStatus" disabled={!canEdit} defaultValue={customer.onboardingPackageStatus==="Prepared"?"Prepared":"Not started"}><option>Not started</option><option>Prepared</option></select></label>
            {isManager?<label>Credit status <select name="creditStatus" disabled={!canEdit} defaultValue={customer.creditStatus??"COD"}><option>COD</option><option>Credit Requested</option><option>Credit Under Review</option><option>Net 30 Approved</option><option>Credit Declined</option><option>Personal Guaranty Required</option></select></label>
             :<label>Credit review <select name="requestCredit" disabled={!canEdit} defaultValue="no"><option value="no">No new request</option><option value="yes">Request manager review</option></select></label>}
          </div>
          <p className="prototype-note">Tax-document route is informational, not verified legal e-signature. Managers control credit status; representatives may request review only. Any commercial terms remain subject to approved records and company authority.</p>
          {message&&<p role="status">{message}</p>}
          {canEdit&&<div className="prototype-controls"><button type="submit">Save account setup</button></div>}
        </form>
      </>}
    </section>
  </main>;
}
