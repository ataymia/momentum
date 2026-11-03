"use client";

import {useMemo,useState} from "react";
import {AlertTriangle,Building2,GitMerge,Search} from "lucide-react";
import {useWorkspace} from "../../lib/workspace-context";
import {navigateToRoute} from "../../lib/navigation-store";
import {consolidationCandidates} from "../../lib/account-consolidation-review";

export function AccountConsolidationReview(){
  const {data,currentUser}=useWorkspace();
  const [query,setQuery]=useState("");
  const [selected,setSelected]=useState<string>("");
  const [target,setTarget]=useState<string>("new");
  const [preview,setPreview]=useState(false);
  const candidates=useMemo(()=>consolidationCandidates(data.accounts),[data.accounts]);
  if(currentUser?.role!=="Administrator")return <div className="prototype-empty">Administrator authorization required.</div>;
  const filtered=candidates.filter(c=>[c.name,...c.locations.map(a=>a.streetAddress??""),...c.distinctPostalCodes].join(" ").toLowerCase().includes(query.toLowerCase()));
  const group=candidates.find(c=>c.key===selected)??filtered[0];
  const linked=group?group.locations.reduce((n,a)=>n+data.orders.filter(o=>o.accountId===a.id&&!o.testOnly).length,0):0;
  const existingParents=(data.customers??[]).filter(c=>group?.existingCustomerIds.includes(c.id));
  const choose=(key:string)=>{setSelected(key);setTarget("new");setPreview(false);};
  return <div className="prototype-domain">
    <header className="prototype-heading"><h1>Account consolidation</h1><p>Administrator-only identification and preview. No account, commission, invoice or payment records are changed here.</p></header>
    <div className="prototype-domain-statbar">
      <article><Building2 size={18}/><small>Same-name candidate groups</small><strong>{candidates.length}</strong></article>
      <article><GitMerge size={18}/><small>Locations requiring review</small><strong>{candidates.reduce((n,c)=>n+c.locations.length,0)}</strong></article>
      <article><AlertTriangle size={18}/><small>Possible duplicate addresses</small><strong>{candidates.reduce((n,c)=>n+c.sameAddressPairs.length,0)}</strong></article>
    </div>
    <section className="prototype-panel">
      <h2>Find potential duplicates</h2>
      <label className="prototype-search"><Search size={16}/><input aria-label="Search possible duplicate accounts" placeholder="Business, street address, ZIP" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <p className="prototype-note">A name match is a review flag, not proof of common ownership. Independently operated franchises or similarly named businesses must stay separate unless verified.</p>
      <div className="prototype-candidate-list">
        {filtered.map(c=><button type="button" key={c.key} className={"prototype-candidate-choice"+(group?.key===c.key?" is-selected":"")} onClick={()=>choose(c.key)}>
          <strong>{c.name}</strong><span>{c.locations.length} records · {c.existingCustomerIds.length} existing parent IDs · {c.conflicts.length} warnings</span>
        </button>)}
      </div>
      {!filtered.length&&<div className="prototype-empty">No same-name candidates match your search.</div>}
    </section>
    {group&&filtered.some(c=>c.key===group.key)&&<section className="prototype-panel">
      <h2>Consolidation evidence: {group.name}</h2>
      <div className="prototype-domain-statbar">
        <article><small>Candidate locations</small><strong>{group.locations.length}</strong></article>
        <article><small>Linked order records</small><strong>{linked}</strong></article>
        <article><small>Distinct ZIP codes</small><strong>{group.distinctPostalCodes.length}</strong></article>
      </div>
      {group.conflicts.length>0&&<div className="prototype-review-warnings">{group.conflicts.map(w=><p key={w}><AlertTriangle size={14}/>{w}</p>)}</div>}
      <div className="prototype-table-scroll"><table className="prototype-table">
        <thead><tr><th>Business / location</th><th>Physical address</th><th>Assigned rep</th><th>Existing parent</th><th>Orders</th></tr></thead>
        <tbody>{group.locations.map(a=><tr key={a.id}>
          <td><button type="button" className="prototype-link" onClick={()=>navigateToRoute("/sales/customers/"+encodeURIComponent(a.id))}>{a.name}</button><small className="prototype-description">{a.id}</small></td>
          <td>{a.streetAddress||"Not recorded"} · {a.location} · {a.postalCode||"ZIP missing"}</td>
          <td>{data.users.find(u=>u.id===a.ownerId)?.name??"Unassigned"}</td>
          <td>{a.customerId??"Not linked"}</td>
          <td>{data.orders.filter(o=>o.accountId===a.id&&!o.testOnly).length}</td>
        </tr>)}</tbody>
      </table></div>
      <h3>Prepare a proposed parent record</h3>
      <p className="prototype-note">Only a proposed plan is prepared. Existing account IDs and transactional records are preserved; compensation history may need exceptions approved separately.</p>
      <div className="prototype-controls">
        <label>Proposed parent
          <select aria-label="Proposed parent business" value={target} onChange={e=>{setTarget(e.target.value);setPreview(false);}}>
            <option value="new">New parent record, subject to identity verification</option>
            {existingParents.map(c=><option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}
          </select>
        </label>
        <button type="button" onClick={()=>setPreview(true)}>Preview association plan</button>
      </div>
      {preview&&<div className="prototype-empty">
        <strong>Read-only review plan</strong>
        <p>Proposed parent: {target==="new"?"New verified business (not yet created)":existingParents.find(c=>c.id===target)?.name??"Unverified"}</p>
        <p>Candidate locations: {group.locations.length}. Associated orders: {linked}. No write, reassignment, invoice migration, commission recalculation or bonus posting has occurred.</p>
        <p>Before any actual merge: verify legal/billing identity and location ownership; resolve duplicate physical addresses, tax records, rep attribution, customer access, existing statements, and approved compensation rules; capture written admin approval and an audit record.</p>
      </div>}
    </section>}
  </div>;
}
