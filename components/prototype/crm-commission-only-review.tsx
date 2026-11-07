"use client";

import {useMemo,useState} from "react";
import {commissionOnlyRepresentativeReview} from "../../lib/commission-only-rep-readiness";
import {downloadCsv} from "../../lib/browser-export";
import {navigateToRoute} from "../../lib/navigation-store";
import {useWorkspace} from "../../lib/workspace-context";
import {useHcm} from "../../lib/hcm-context";

const fields=["rep","directoryActive","employment","classification","signedPlanRecorded","activeZIPs","creditedOrders","missingAttribution","blockers","automaticPaymentEnabled"] as const;

/** Admin inspection only. Does not change HR classification, create pay or grant territory rights. */
export function CrmCommissionOnlyReview(){
  const {data,currentUser}=useWorkspace();
  const {hcm}=useHcm();
  const [search,setSearch]=useState("");
  const [onlyAttention,setOnlyAttention]=useState(false);
  const [selected,setSelected]=useState("");
  const [sort,setSort]=useState<"rep"|"employment"|"classification"|"signed"|"zip"|"credited"|"exceptions">("rep");
  const [ascending,setAscending]=useState(true);
  const rows=useMemo(()=>data.users.filter(user=>user.role==="Sales Representative")
    .map(user=>commissionOnlyRepresentativeReview(data,hcm,user.id))
    .filter(row=>(!onlyAttention||row.blockers.length>0)&&[row.repName,row.repId,row.employmentStatus,row.workerClassification].join(" ").toLowerCase().includes(search.toLowerCase().trim()))
    .sort((a,b)=>{
      const field=(r:typeof a):string|number=>{
        if(sort==="employment")return r.employmentStatus;
        if(sort==="classification")return r.workerClassification;
        if(sort==="signed")return r.verifiedCommissionOnlyAgreement?"Recorded":"Missing";
        if(sort==="zip")return r.activeTerritoryZips.length;
        if(sort==="credited")return r.attributedOrders;
        if(sort==="exceptions")return r.missingExplicitAttribution;
        return r.repName;
      };
      const av=field(a),bv=field(b),comp=typeof av==="number"&&typeof bv==="number"?av-bv:String(av).localeCompare(String(bv),undefined,{numeric:true});
      return (ascending?1:-1)*(comp||a.repId.localeCompare(b.repId));
    }),
    [data,hcm,search,onlyAttention,sort,ascending]);
  if(currentUser?.role!=="Administrator")return <div className="prototype-empty">Administrator approval and record access required for commission-only compensation review.</div>;
  const focus=rows.find(row=>row.repId===selected)??rows[0];
  const heading=(key:typeof sort,label:string)=><th aria-sort={sort===key?(ascending?"ascending":"descending"):"none"}><button type="button" onClick={()=>{if(sort===key)setAscending(v=>!v);else{setSort(key);setAscending(true);}}}>{label}</button></th>;
  const exportRows=rows.map(row=>({
    rep:row.repName,directoryActive:row.activeDirectoryUser,employment:row.employmentStatus,
    classification:row.workerClassification,signedPlanRecorded:row.verifiedCommissionOnlyAgreement,
    activeZIPs:row.activeTerritoryZips.join(";"),creditedOrders:row.attributedOrders,
    missingAttribution:row.missingExplicitAttribution,
    blockers:row.blockers.join(" | "),automaticPaymentEnabled:"No",
  }));
  return <main className="prototype-workspace">
    <header className="prototype-heading"><h1>Commission-only representative readiness</h1>
      <p>Administrator-only reconciliation of existing sales identities, signed plan evidence, territory guidance, historical credit and payroll release safeguards. Listing a rep here does not classify that person as commission-only.</p>
    </header>
    <section className="prototype-panel">
      <div className="prototype-metrics"><div><small>Recorded representatives</small><strong>{rows.length}</strong></div>
        <div><small>Automatic commission disbursement</small><strong>Disabled</strong></div>
        <div><small>Standard rep / eligible manager</small><strong>2.50% / 0.50%</strong></div>
        <div><small>Approved combined rate</small><strong>3.00%</strong></div>
      </div>
      <p role="status" className="prototype-note">Commission-only classification and legal eligibility cannot be inferred from job title or role. Agreement verification is only as reliable as the underlying externally signed record. No commission amounts are authorized for release here.</p>
      <div className="prototype-controls">
        <label>Find representative <input type="search" aria-label="Search commission review" value={search} onChange={e=>setSearch(e.target.value)}/></label>
        <label><input type="checkbox" checked={onlyAttention} onChange={e=>setOnlyAttention(e.target.checked)}/> Needs review</label>
        <button type="button" disabled={!rows.length} onClick={()=>downloadCsv("momentum-commission-only-readiness.csv",exportRows,fields)}>Export admin review CSV</button>
      </div>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>{heading("rep","Representative")}{heading("employment","Employee status")}{heading("classification","HR classification")}{heading("signed","Signed plan evidence")}{heading("zip","Active ZIP guidance")}{heading("credited","Explicit credited orders")}{heading("exceptions","Attribution exceptions")}<th>Review</th></tr></thead><tbody>
        {rows.map(row=><tr key={row.repId}>
          <td>{row.repName}</td><td>{row.employmentStatus}</td><td>{row.workerClassification}</td><td>{row.verifiedCommissionOnlyAgreement?"Recorded":"Missing / unverified"}</td><td>{row.activeTerritoryZips.length}</td><td>{row.attributedOrders}</td><td>{row.missingExplicitAttribution}</td>
          <td><button type="button" className="prototype-link" onClick={()=>setSelected(row.repId)}>Inspect blockers</button></td>
        </tr>)}
      </tbody></table></div>
      {!rows.length&&<p className="prototype-empty">No matching representatives.</p>}
    </section>
    {focus&&<section className="prototype-panel" aria-label="Commission-only case review">
      <h2>{focus.repName} · readiness details</h2><p className="prototype-note">Active ZIP suggestion: {focus.activeTerritoryZips.join(", ")||"Not configured"}. Representative credit is based only on explicitly linked order IDs, not current account ownership alone.</p>
      <ul>{focus.blockers.map((message,i)=><li key={i}>{message}</li>)}</ul>
      <div className="prototype-controls"><button type="button" onClick={()=>navigateToRoute("/admin/employee-profiles/"+encodeURIComponent(focus.repId))}>Open personnel record</button>
      <button type="button" onClick={()=>navigateToRoute("/crm/territories")}>Review ZIP territories</button></div>
      <p className="prototype-note">Payroll remains blocked until approved worker classification, a signed plan, reconciled net collections and duplicate-payment controls exist in an audited server-authorized workflow. This page never edits compensation, creates a pay run or sends money.</p>
    </section>}
  </main>;
}
