"use client";

import {useMemo,useState} from "react";
import {accountHasCoordinates,projectAccounts,mapsIntegrationStatus} from "../../lib/maps-integration";
import {navigateToRoute} from "../../lib/navigation-store";
import {downloadCsv} from "../../lib/browser-export";
import {useWorkspace} from "../../lib/workspace-context";

type Stage="all"|"lead"|"active";
type MapSort="account"|"market"|"stage"|"representative"|"coordinates";
const fields=["account","city","postalCode","stage","representative","latitude","longitude"] as const;

/**
 * Provider-neutral geographic fallback. Only actual saved coordinates produce
 * points. Without approved tiles this is a RELATIVE coordinate plot, not a
 * street map, navigational routing, travel times or ZIP boundary geometry.
 */
export function CrmAccountMap(){
  const {scope,data,currentUser}=useWorkspace();
  const [search,setSearch]=useState("");
  const [stage,setStage]=useState<Stage>("all");
  const [owner,setOwner]=useState("all");
  const [selected,setSelected]=useState<string|null>(null);
  const [sort,setSort]=useState<MapSort>("account");
  const [ascending,setAscending]=useState(true);
  const names=useMemo(()=>new Map(data.users.map(u=>[u.id,u.name])),[data.users]);
  const rows=useMemo(()=>scope.accounts.filter(a=>(stage==="all"||(stage==="lead"?["Prospect","Qualified","Sampled"].includes(a.stage):!["Prospect","Qualified","Sampled"].includes(a.stage))))
    .filter(a=>owner==="all"||a.ownerId===owner)
    .filter(a=>[a.name,a.location,a.postalCode,a.streetAddress,names.get(a.ownerId)].join(" ").toLowerCase().includes(search.toLowerCase().trim()))
    .sort((a,b)=>{
      const field=(item:typeof a)=>{
        if(sort==="market")return item.location+" "+(item.postalCode??"");
        if(sort==="stage")return item.stage;
        if(sort==="representative")return names.get(item.ownerId)??"Unassigned";
        if(sort==="coordinates")return accountHasCoordinates(item)?"On plot":"Not geocoded";
        return item.name;
      };
      return (ascending?1:-1)*(field(a).localeCompare(field(b),undefined,{numeric:true})||a.id.localeCompare(b.id));
    }),[scope.accounts,search,stage,owner,names,sort,ascending]);
  const plot=useMemo(()=>projectAccounts(rows),[rows]);
  const byId=useMemo(()=>new Map(rows.map(a=>[a.id,a])),[rows]);
  const missing=rows.filter(a=>!accountHasCoordinates(a));
  const focus=rows.find(a=>a.id===selected);
  const options=[...new Set(scope.accounts.map(a=>a.ownerId).filter(Boolean))];
  const provider=mapsIntegrationStatus();
  const header=(key:MapSort,label:string)=><th aria-sort={sort===key?(ascending?"ascending":"descending"):"none"}><button type="button" aria-label={"Sort map results by "+label}
    onClick={()=>{if(sort===key)setAscending(v=>!v);else{setSort(key);setAscending(true);}}}>{label}</button></th>;
  if(!currentUser||currentUser.role==="Customer")return <div className="prototype-empty">Employee CRM mapping access is required.</div>;
  return <main className="prototype-workspace">
    <header className="prototype-heading"><h1>Account map</h1>
      <p>Review actual geocoded businesses and open customer or prospect records. Unlocated businesses remain visible in the directory below.</p>
    </header>
    <section className="prototype-panel" aria-label="Account map and filters">
      <div className="prototype-controls">
        <label>Search business <input type="search" aria-label="Search map businesses" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, ZIP, city or rep"/></label>
        <label>Stage <select aria-label="Filter account map by stage" value={stage} onChange={e=>setStage(e.target.value as Stage)}><option value="all">All records</option><option value="lead">Prospects and leads</option><option value="active">Developed accounts</option></select></label>
        <label>Rep <select aria-label="Filter account map by rep" value={owner} onChange={e=>setOwner(e.target.value)}><option value="all">All accessible reps</option>{options.map(id=><option key={id} value={id}>{names.get(id)??id}</option>)}</select></label>
        <button type="button" disabled={!rows.length} onClick={()=>downloadCsv("momentum-account-map.csv",rows.map(a=>({account:a.name,city:a.location,postalCode:a.postalCode??"",stage:a.stage,representative:names.get(a.ownerId)??"Unassigned",latitude:a.latitude??"",longitude:a.longitude??""})),fields)}>Export scoped account locations</button>
      </div>
      <div className="prototype-metrics"><div><small>Accessible results</small><strong>{rows.length}</strong></div><div><small>Saved coordinates on record</small><strong>{plot.length}</strong></div><div><small>Without coordinates</small><strong>{missing.length}</strong></div></div>
      <p className="prototype-note" role="status">Relative coordinate plot, not a street map. Map tiles and business lookup remain {provider.mapTiles==="pending-provider"?"unconfigured":"configured"}; no real-time device location, street routing or map provider calls are made. Only stored coordinates are plotted; coordinate accuracy and source verification have not been established.</p>
      <div role="group" aria-label="Relative account coordinate plot" style={{height:360,position:"relative",border:"1px solid var(--border)",borderRadius:12,overflow:"hidden"}}>
        {plot.map(point=>{
          const account=byId.get(point.accountId)!;
          return <button key={point.accountId} type="button"
            aria-label={"Select "+account.name+" at "+account.location}
            aria-pressed={selected===account.id}
            title={account.name+" · "+account.location}
            onClick={()=>setSelected(account.id)}
            style={{position:"absolute",left:(point.x/10)+"%",top:(point.y/6.2)+"%",transform:"translate(-50%,-50%)",border:"2px solid currentColor",borderRadius:40,width:20,height:20,background:selected===account.id?"currentColor":"transparent",cursor:"pointer"}}/>;
        })}
        {!plot.length&&<div className="prototype-empty">No saved coordinate pairs match these filters. Use the directory below to open an account.</div>}
      </div>
      {focus&&<div className="prototype-panel" aria-live="polite">
        <h2>{focus.name}</h2><p>{focus.streetAddress??"Address unrecorded"} · {focus.location} · {focus.postalCode??"ZIP not recorded"}</p>
        <p>Stage: {focus.stage} · Owner: {names.get(focus.ownerId)??"Unassigned"}</p>
        <div className="prototype-controls"><button type="button" onClick={()=>navigateToRoute("/sales/customers/"+encodeURIComponent(focus.id))}>Open account profile</button>
          {["Prospect","Qualified","Sampled"].includes(focus.stage)&&<button type="button" onClick={()=>navigateToRoute("/crm/leads/"+encodeURIComponent(focus.id))}>Open lead and schedule follow-up</button>}
        </div>
      </div>}
    </section>
    <section className="prototype-panel"><h2>All filtered account locations</h2>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>{header("account","Business")}{header("market","Market / ZIP")}{header("stage","Stage")}{header("representative","Assigned rep")}{header("coordinates","Coordinate status")}<th>Record</th></tr></thead>
        <tbody>{rows.map(account=><tr key={account.id}><td>{account.name}</td><td>{account.location} · {account.postalCode??"Unknown"}</td><td>{account.stage}</td><td>{names.get(account.ownerId)??"Unassigned"}</td><td>{accountHasCoordinates(account)?"On plot":"Not geocoded"}</td><td><button type="button" className="prototype-link" onClick={()=>navigateToRoute("/sales/customers/"+encodeURIComponent(account.id))}>Open account</button></td></tr>)}</tbody>
      </table></div>
      {!rows.length&&<div className="prototype-empty">No accessible accounts match your map filters.</div>}
    </section>
  </main>;
}
