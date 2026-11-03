"use client";

/**
 * Administrator account association review. No customer/location writes occur
 * here; approved master-data migration requires a separate audited workflow.
 */
import {useMemo,useState} from "react";
import {AlertTriangle,Building2,GitMerge,Search,CheckSquare,Square,X} from "lucide-react";
import {useWorkspace} from "../../lib/workspace-context";
import {navigateToRoute} from "../../lib/navigation-store";
import {consolidationCandidates,manualConsolidationCandidate} from "../../lib/account-consolidation-review";

export function AccountConsolidationReview(){
  const {data,currentUser}=useWorkspace();
  const [suggestedSearch,setSuggestedSearch]=useState("");
  const [manualSearch,setManualSearch]=useState("");
  const [visibleLimit,setVisibleLimit]=useState(40);
  const [selectedIds,setSelectedIds]=useState<string[]>([]);
  const [target,setTarget]=useState("new");
  const [parentName,setParentName]=useState("");
  const [preview,setPreview]=useState(false);
  const candidates=useMemo(()=>consolidationCandidates(data.accounts),[data.accounts]);
  const selected=useMemo(()=>manualConsolidationCandidate(data.accounts,selectedIds),[data.accounts,selectedIds]);
  if(currentUser?.role!=="Administrator")return <div className="prototype-empty">Administrator authorization required.</div>;

  const suggested=candidates.filter(c=>[c.name,...c.locations.map(a=>a.streetAddress??""),...c.distinctPostalCodes]
    .join(" ").toLowerCase().includes(suggestedSearch.trim().toLowerCase()));
  const visibleLocations=data.accounts.filter(a=>
    [a.name,a.location,a.locationName,a.streetAddress,a.postalCode,a.contactName,a.phone]
      .join(" ").toLowerCase().includes(manualSearch.trim().toLowerCase()))
    .sort((a,b)=>a.name.localeCompare(b.name)||a.location.localeCompare(b.location)||a.id.localeCompare(b.id));
  const selectedSet=new Set(selectedIds);
  const selectedAccounts=data.accounts.filter(a=>selectedSet.has(a.id));
  const linked=selected?selected.locations.reduce((n,a)=>n+data.orders.filter(o=>o.accountId===a.id&&!o.testOnly).length,0):0;
  const existingParents=(data.customers??[]).filter(c=>selected?.existingCustomerIds.includes(c.id));
  const choose=(ids:readonly string[])=>{
    setSelectedIds([...new Set(ids)]);
    setTarget("new");setParentName("");setPreview(false);
  };
  const toggle=(id:string)=>{
    setSelectedIds(current=>current.includes(id)?current.filter(entry=>entry!==id):[...current,id]);
    setTarget("new");setPreview(false);
  };
  const previewParent=target==="new"?(parentName.trim()||selected?.name||"New parent pending verification"):existingParents.find(c=>c.id===target)?.name;
  return <div className="prototype-domain">
    <header className="prototype-heading">
      <h1>Account consolidation</h1>
      <p>Choose any two or more CRM accounts, regardless of name, to prepare a parent business and location review. Nothing is merged automatically.</p>
    </header>
    <div className="prototype-domain-statbar">
      <article><Building2 size={18}/><small>Same-name suggestions</small><strong>{candidates.length}</strong></article>
      <article><GitMerge size={18}/><small>Accounts selected manually</small><strong>{selectedAccounts.length}</strong></article>
      <article><AlertTriangle size={18}/><small>Selected-group warnings</small><strong>{selected?.conflicts.length??0}</strong></article>
    </div>

    <section className="prototype-panel">
      <h2>1. Select accounts yourself</h2>
      <p className="prototype-note">Name similarity is not required. Search any word, address, ZIP or contact and select records individually. Selections stay in your review even when you change the search.</p>
      <label className="prototype-search"><Search size={16}/><input aria-label="Search all CRM accounts for consolidation" value={manualSearch}
        onChange={event=>{setManualSearch(event.target.value);setVisibleLimit(40);}}
        placeholder="Search all accounts: e.g. Two Knuckles, address or ZIP"/></label>
      <p className="prototype-note">{visibleLocations.length} matching CRM location records. {selectedAccounts.length} selected.</p>
      <div className="prototype-consolidation-account-picker" role="group" aria-label="Select CRM accounts to group under one parent">
        {visibleLocations.slice(0,visibleLimit).map(a=><label key={a.id} className={"prototype-consolidation-account-option"+(selectedSet.has(a.id)?" is-selected":"")}>
          <input type="checkbox" checked={selectedSet.has(a.id)} onChange={()=>toggle(a.id)} aria-label={"Select "+a.name+" at "+(a.streetAddress||a.location)}/>
          {selectedSet.has(a.id)?<CheckSquare size={17} aria-hidden="true"/>:<Square size={17} aria-hidden="true"/>}
          <span><strong>{a.name}</strong><small>{a.streetAddress||"Street address missing"} · {a.location} · {a.postalCode||"ZIP missing"}</small><small>Record {a.id} · Parent {a.customerId??"not assigned"}</small></span>
        </label>)}
        {!visibleLocations.length&&<p className="prototype-empty">No accounts match that search. Try a different word, ZIP or street name.</p>}
      </div>
      {visibleLocations.length>visibleLimit&&<button type="button" className="prototype-secondary-action" onClick={()=>setVisibleLimit(limit=>limit+40)}>Show more accounts ({visibleLocations.length-visibleLimit} remaining)</button>}
      <div className="prototype-consolidation-selected">
        <h3>Selected records</h3>
        {selectedAccounts.map(a=><button type="button" key={a.id} onClick={()=>toggle(a.id)} aria-label={"Remove "+a.name+" from selected accounts"}>
          {a.name} · {a.postalCode||a.location} <X size={13}/>
        </button>)}
        {!selectedAccounts.length&&<p className="prototype-note">Select at least two records to begin your review.</p>}
      </div>
      {selectedAccounts.length>0&&<button type="button" className="prototype-secondary-action" onClick={()=>choose([])}>Clear selection</button>}
    </section>

    <section className="prototype-panel">
      <h2>2. Optional suggested groups</h2>
      <p className="prototype-note">These are convenience suggestions only. They are not an approved merge list, and they will miss some name variations. You can ignore them entirely.</p>
      <label className="prototype-search"><Search size={16}/><input aria-label="Filter suggested duplicate groups" placeholder="Filter same-name suggestions" value={suggestedSearch} onChange={e=>setSuggestedSearch(e.target.value)}/></label>
      <div className="prototype-candidate-list">
        {suggested.map(c=><button type="button" key={c.key} className="prototype-candidate-choice"
          onClick={()=>choose(c.locations.map(a=>a.id))}>
          <strong>{c.name}</strong><span>{c.locations.length} records · {c.existingCustomerIds.length} existing parent IDs · {c.conflicts.length} warnings</span>
          <span>Select this group for review</span>
        </button>)}
      </div>
      {!suggested.length&&<p className="prototype-note">No suggested groups found. Manual account selection above works independently.</p>}
    </section>

    <section className="prototype-panel">
      <h2>3. Review proposed parent and locations</h2>
      {!selected&&<p className="prototype-empty">Select at least two valid CRM accounts above. They do not need matching names.</p>}
      {selected&&<>
        <div className="prototype-domain-statbar">
          <article><small>Selected store records</small><strong>{selected.locations.length}</strong></article>
          <article><small>Existing linked orders</small><strong>{linked}</strong></article>
          <article><small>Distinct ZIPs</small><strong>{selected.distinctPostalCodes.length}</strong></article>
        </div>
        {selected.conflicts.length>0&&<div className="prototype-review-warnings">{selected.conflicts.map(message=><p key={message}><AlertTriangle size={15}/>{message}</p>)}</div>}
        <div className="prototype-table-scroll"><table className="prototype-table">
          <thead><tr><th>Business / location</th><th>Physical address</th><th>Assigned rep</th><th>Existing parent</th><th>Orders</th></tr></thead>
          <tbody>{selected.locations.map(a=><tr key={a.id}>
            <td><button type="button" className="prototype-link" onClick={()=>navigateToRoute("/sales/customers/"+encodeURIComponent(a.id))}>{a.name}</button><small className="prototype-description">{a.id}</small></td>
            <td>{a.streetAddress||"Not recorded"} · {a.location} · {a.postalCode||"ZIP missing"}</td>
            <td>{data.users.find(u=>u.id===a.ownerId)?.name??"Unassigned"}</td>
            <td>{a.customerId??"Not linked"}</td>
            <td>{data.orders.filter(o=>o.accountId===a.id&&!o.testOnly).length}</td>
          </tr>)}</tbody>
        </table></div>
        <div className="prototype-controls">
          <label>Proposed parent
            <select aria-label="Proposed parent business" value={target} onChange={e=>{setTarget(e.target.value);setPreview(false);}}>
              <option value="new">Create a new verified parent business</option>
              {existingParents.map(c=><option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}
            </select>
          </label>
          {target==="new"&&<label>Proposed parent display name
            <input aria-label="Proposed parent display name" value={parentName} onChange={e=>{setParentName(e.target.value);setPreview(false);}}
              placeholder={selected.name}/>
          </label>}
          <button type="button" onClick={()=>setPreview(true)}>Preview selected-account association</button>
        </div>
        {preview&&<div className="prototype-consolidation-plan" role="status">
          <strong>Review plan only: {previewParent}</strong>
          <p>{selected.locations.length} selected account records and {linked} linked order records. The accounts' distinct IDs, orders, payments, employee credits and audit history remain unchanged.</p>
          <p>No parent record was created and no consolidation was executed. Before approval, verify legal and billing identity, location ownership, overlapping physical addresses, tax records, customer portal access, commission and bonus attribution, and any existing financial balances.</p>
          <p>Actual consolidation requires a separate audited administrator-controlled master-data operation. This preview cannot silently migrate or delete historical records.</p>
        </div>}
      </>}
    </section>
  </div>;
}
