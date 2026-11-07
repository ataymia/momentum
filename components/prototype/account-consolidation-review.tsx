"use client";

/**
 * Administrator account association review. No customer/location writes occur
 * here; approved master-data migration requires a separate audited workflow.
 */
import {useMemo,useState} from "react";
import {AlertTriangle,Building2,GitMerge,Search,CheckSquare,Square,X} from "lucide-react";
import {useWorkspace} from "../../lib/workspace-context";
import {momentumStorage} from "../../lib/persistence";
import {useRuntimeMode} from "../../lib/runtime-mode";
import {useFirebaseSessionOptional} from "../../lib/firebase-session-context";
import {navigateToRoute} from "../../lib/navigation-store";
import {consolidationCandidates,manualConsolidationCandidate,toggleSelectedAccountId} from "../../lib/account-consolidation-review";

export function AccountConsolidationReview(){
  const {data,currentUser,associateCustomerLocations}=useWorkspace();
  const runtime=useRuntimeMode();
  const firebase=useFirebaseSessionOptional();
  const [suggestedSearch,setSuggestedSearch]=useState("");
  const [manualSearch,setManualSearch]=useState("");
  const [visibleLimit,setVisibleLimit]=useState(40);
  const [selectedIds,setSelectedIds]=useState<string[]>([]);
  const [target,setTarget]=useState("new");
  const [parentName,setParentName]=useState("");
  const [preview,setPreview]=useState(false);
  const [verifiedOwner,setVerifiedOwner]=useState(false);
  const [reason,setReason]=useState("");
  const [typedConfirmation,setTypedConfirmation]=useState("");
  const [operationMessage,setOperationMessage]=useState("");
  const [reviewSort,setReviewSort]=useState<"name"|"address"|"rep"|"parent"|"orders">("name");
  const [reviewAscending,setReviewAscending]=useState(true);
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
  const selectedForDisplay=[...(selected?.locations??[])].sort((a,b)=>{
    const field=(record:typeof a):string|number=>{
      if(reviewSort==="address")return [record.streetAddress,record.location,record.postalCode].join(" ");
      if(reviewSort==="rep")return data.users.find(u=>u.id===record.ownerId)?.name??"Unassigned";
      if(reviewSort==="parent")return record.customerId??"Not linked";
      if(reviewSort==="orders")return data.orders.filter(order=>order.accountId===record.id&&!order.testOnly).length;
      return record.name;
    };
    const x=field(a),y=field(b),comparison=typeof x==="number"&&typeof y==="number"?x-y:String(x).localeCompare(String(y),undefined,{numeric:true});
    return (reviewAscending?1:-1)*(comparison||a.id.localeCompare(b.id));
  });
  const reviewHeader=(sort:typeof reviewSort,label:string)=><th aria-sort={reviewSort===sort?(reviewAscending?"ascending":"descending"):"none"}>
    <button type="button" aria-label={"Sort consolidation review by "+label} onClick={()=>{if(reviewSort===sort)setReviewAscending(v=>!v);else{setReviewSort(sort);setReviewAscending(true);}}}>{label}</button>
  </th>;
  const demoAssociationEnabled=runtime.isDemo&&momentumStorage.mode()==="local"&&!firebase;
  const resetReview=()=>{setPreview(false);setVerifiedOwner(false);setReason("");setTypedConfirmation("");setOperationMessage("");};
  const defaultParent=(ids:readonly string[])=>data.accounts.find(a=>ids.includes(a.id)&&a.customerId)?.customerId??"new";
  const choose=(ids:readonly string[])=>{
    setSelectedIds([...new Set(ids)]);
    setTarget(defaultParent(ids));setParentName("");resetReview();
  };
  const toggle=(id:string)=>{
    const next=toggleSelectedAccountId(selectedIds,id);
    setSelectedIds(next);setTarget(defaultParent(next));resetReview();
  };
  const previewParent=target==="new"?(parentName.trim()||selected?.name||"New parent pending verification"):existingParents.find(c=>c.id===target)?.name;
  const associate=()=>{
    if(!demoAssociationEnabled||!selected||typedConfirmation!=="ASSOCIATE"||!verifiedOwner||reason.trim().length<12)return;
    const parent=target==="new"
      ?{kind:"new" as const,name:parentName.trim()||selected.name}
      :{kind:"existing" as const,id:target};
    const result=associateCustomerLocations({
      accountIds:selected.locations.map(a=>a.id),parent,reason,verifiedCommonBillingOwner:verifiedOwner,
    });
    if(!result.ok){setOperationMessage(result.message);return;}
    setOperationMessage("Local demonstration only: "+result.updatedAccountIds.length+
      " location records are now linked under parent "+result.parentId+". Original order, rep, and payment records were not rewritten.");
    setSelectedIds([]);setPreview(false);setTypedConfirmation("");setVerifiedOwner(false);setReason("");
  };
  return <div className="prototype-domain">
    {operationMessage&&<p role="status" className="prototype-consolidation-plan">{operationMessage}</p>}
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
          <thead><tr>{reviewHeader("name","Business / location")}{reviewHeader("address","Physical address")}{reviewHeader("rep","Assigned rep")}{reviewHeader("parent","Existing parent")}{reviewHeader("orders","Orders")}</tr></thead>
          <tbody>{selectedForDisplay.map(a=><tr key={a.id}>
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
          <p>{selected.locations.length} selected account records and {linked} linked order records. The accounts&apos; distinct IDs, orders, payments, employee credits and audit history remain unchanged.</p>
          <p>No parent record was created and no consolidation was executed. Before approval, verify legal and billing identity, location ownership, overlapping physical addresses, tax records, customer portal access, commission and bonus attribution, and any existing financial balances.</p>
          <p>Production consolidation requires an authenticated, audited administrator-controlled master-data operation. This preview cannot silently migrate or delete historical records.</p>
          <div className="prototype-consolidation-action">
            <h3>Confirm association in local demo only</h3>
            <p>Testing is enabled only on a local development workspace, with no connected Firebase backend. It does not modify the live company database.</p>
            {demoAssociationEnabled?<div className="prototype-consolidation-confirmation">
              <label><input type="checkbox" checked={verifiedOwner} onChange={event=>setVerifiedOwner(event.target.checked)}/>
                I have verified that these selected records belong to the same billing owner, and reviewed the listed conflicts.</label>
              <label>Reason for association
                <textarea aria-label="Account consolidation audit reason" rows={3} value={reason} onChange={event=>setReason(event.target.value)}
                  placeholder="Record the source of verification and why these locations belong under one parent"/>
              </label>
              <label>Type ASSOCIATE to confirm
                <input aria-label="Type ASSOCIATE to confirm demo account association" value={typedConfirmation} onChange={event=>setTypedConfirmation(event.target.value)} />
              </label>
              <button type="button" disabled={!verifiedOwner||reason.trim().length<12||typedConfirmation!=="ASSOCIATE"}
                onClick={associate}>Apply association to local demonstration records</button>
            </div>:<p className="prototype-note">Live association is intentionally disabled. This is a review and planning tool until secure server-side merge, audit and bonus-integrity checks are approved.</p>}
          </div>
        </div>}
      </>}
    </section>
  </div>;
}
