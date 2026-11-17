"use client";

/** Consolidated insights. Existing source reports and performance controls
 * remain intact, with one canonical navigation destination and deep links.
 * No order label, invoice state or marketing touch is treated as bank settlement.
 */
import {useState} from "react";
import {useWorkspace} from "../../lib/workspace-context";
import {canVisitRoute} from "../../lib/navigation-route-registry";
import {navigateToRoute} from "../../lib/navigation-store";
import {InsightsExplorerExperience} from "./insights-explorer-experience";
import {ReportsPage} from "../pages/reports";
import {PerformanceWorkspacePage} from "../pages/focused-workspace-pages";

type Tab="explorer"|"source"|"dashboard";
const sections:ReadonlyArray<{id:Tab;name:string;route:string}>=[
  {id:"explorer",name:"Insights Explorer",route:"/reports/explorer"},
  {id:"source",name:"Source reports",route:"/reports"},
  {id:"dashboard",name:"Performance dashboard",route:"/reports/performance"},
];
export function ReportsWorkspaceExperience({initialTab="explorer"}:{initialTab?:Tab}){
  const {currentUser}=useWorkspace();
  const [tab,setTab]=useState<Tab>(initialTab);
  if(!currentUser)return <p className="prototype-empty">Sign in to view reports.</p>;
  const allowed=sections.filter(item=>canVisitRoute(currentUser,item.route));
  if(!allowed.length)return <p className="prototype-empty">No reporting workstream is available to this role.</p>;
  const selected=allowed.find(item=>item.id===tab)?.id??allowed[0].id;
  return <div className="prototype-domain prototype-domain--insights">
    <header className="prototype-heading"><h1>Reports & Insights</h1>
      <p>Source-backed business reporting, evidence drilldowns, and operational performance in a shared workspace. Each report retains its own permission and calculation rules.</p>
    </header>
    <nav className="prototype-tabs" aria-label="Reporting workstreams">
      {allowed.map(item=><button type="button" key={item.id} className={selected===item.id?"is-active":""}
        aria-current={selected===item.id?"page":undefined} onClick={()=>setTab(item.id)}>{item.name}</button>)}
    </nav>
    <div className="prototype-controls">
      {canVisitRoute(currentUser,"/reports/center")&&
        <button type="button" onClick={()=>navigateToRoute("/reports/center")}>Open my submitted work reports</button>}
    </div>
    <p className="prototype-note">Cash and paid cases must come from supported invoice and payment allocations; disputes, credits and refunds require source reconciliation. Connected reporting does not establish consumer sell-through or bank deposits.</p>
    {selected==="explorer"?<InsightsExplorerExperience/>:
      selected==="source"?<ReportsPage/>:<PerformanceWorkspacePage/>}
  </div>;
}
