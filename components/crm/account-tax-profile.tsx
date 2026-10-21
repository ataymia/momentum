"use client";

import { FormEvent, useEffect, useState } from "react";
import { normalizeAzTptLicenseNumber } from "../../lib/arizona-tax-documents";
import { useWorkspace } from "../../lib/workspace-context";
import type { TaxExemptionStatus } from "../../lib/types";
import { Button, Section } from "../ui";

/** Billing-customer tax documents are shared by locations belonging to that customer. */
export function AccountTaxProfile({ accountId }:{accountId:string}){
  const { data, currentUser, updateCustomerCommercial }=useWorkspace();
  const account=data.accounts.find(row=>row.id===accountId);
  const customer=(data.customers??[]).find(row=>row.id===account?.customerId);
  const manager=currentUser?.role==="Administrator"||currentUser?.role==="Sales Manager";
  const authorized=Boolean(manager||(currentUser?.role==="Sales Representative"&&account?.ownerId===currentUser.id));
  const [tpt,setTpt]=useState(customer?.tptLicenseNumber??"");
  const [type,setType]=useState(customer?.taxCertificateType??"");
  const [reference,setReference]=useState(customer?.taxCertificateReference??"");
  const [status,setStatus]=useState<TaxExemptionStatus>(customer?.taxExemptionStatus??"Missing");
  const [feedback,setFeedback]=useState("");
  useEffect(()=>{
    setTpt(customer?.tptLicenseNumber??"");
    setType(customer?.taxCertificateType??"");
    setReference(customer?.taxCertificateReference??"");
    setStatus(customer?.taxExemptionStatus??"Missing");
    setFeedback("");
  },[customer?.id,customer?.tptLicenseNumber,customer?.taxCertificateType,customer?.taxCertificateReference,customer?.taxExemptionStatus]);
  if(!account||!customer)return null;

  const save=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    const normalized=normalizeAzTptLicenseNumber(tpt);
    if(normalized===null){setFeedback("Arizona TPT number must be exactly 8 digits.");return;}
    if(manager&&status==="Verified"&&(!type||!reference.trim())){setFeedback("Select the certificate and enter its secure document reference before verification.");return;}
    const patch=manager?{
      tptLicenseNumber:normalized,
      taxCertificateType:type as "5000A"|"5000"|"",
      taxCertificateReference:reference.trim(),
      taxExemptionStatus:status
    }:{tptLicenseNumber:normalized};
    const ok=updateCustomerCommercial(customer.id,patch);
    setFeedback(ok?"Tax information saved.":"Tax information was not saved.");
  };

  return <Section title="Arizona tax & resale">
    <form className="form-grid" onSubmit={save}>
      <label className="field"><span>AZ TPT license number</span>
        <input aria-label="AZ TPT license number" inputMode="numeric" autoComplete="off" pattern="[0-9]{8}" maxLength={8}
          value={tpt} onChange={e=>setTpt(e.target.value)} placeholder="8 digits" disabled={!authorized}/>
      </label>
      {manager&&<>
        <label className="field"><span>Tax certificate</span>
          <select value={type} onChange={e=>setType(e.target.value as "5000A"|"5000"|"")}>
            <option value="">Not supplied</option><option value="5000A">Form 5000A · resale</option><option value="5000">Form 5000 · other exemption</option>
          </select>
        </label>
        <label className="field"><span>Secure certificate file reference</span>
          <input value={reference} maxLength={200} onChange={e=>setReference(e.target.value)} placeholder="Document ID in restricted storage"/>
        </label>
        <label className="field"><span>Certificate review</span>
          <select value={status} onChange={e=>setStatus(e.target.value as TaxExemptionStatus)}>
            {["Missing","Requested","Received","Verified","Not exempt"].map(value=><option key={value}>{value}</option>)}
          </select>
        </label>
      </>}
      {!manager&&<div className="field--full"><strong>Certificate:</strong> {customer.taxCertificateType??"Not supplied"} · {customer.taxExemptionStatus??"Not reviewed"}</div>}
      {manager&&customer.az5000Number&&<p className="field--full">Legacy “AZ-5000” entry: {customer.az5000Number}. Check the original record; it is not automatically treated as a TPT license.</p>}
      <div className="field--full"><small>For resale, request signed Arizona Form 5000A. Momentum records the secure document reference, not an uploaded certificate. A TPT number alone does not establish an exemption. {customer.taxCertificateType==="5000A"?"":" "}<a href="https://azdor.gov/forms/tpt-forms/arizona-resale-certificate" target="_blank" rel="noreferrer">ADOR Form 5000A</a></small></div>
      {feedback&&<p role="status" className="field--full">{feedback}</p>}
      {authorized&&<div className="field--full"><Button type="submit">Save tax information</Button></div>}
    </form>
  </Section>;
}
