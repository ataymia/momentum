"use client";

import {useMemo,useState} from "react";
import {useWorkspace} from "../../lib/workspace-context";
import {useFirebaseSessionOptional} from "../../lib/firebase-session-context";
import {useRuntimeMode} from "../../lib/runtime-mode";
import {FirebaseAccessPanel} from "../settings/firebase-access-panel";
import {navigateToRoute} from "../../lib/navigation-store";

/** Administrator role audit. Actual mutations remain in the existing Firebase
 * access workflow, never an unconfirmed browser role toggle.
 */
export function UsersRolesExperience(){
 const {currentUser,data}=useWorkspace();
 const runtime=useRuntimeMode();
 const firebase=useFirebaseSessionOptional();
 const [query,setQuery]=useState(""),[roleFilter,setRoleFilter]=useState("all"),
   [stateFilter,setStateFilter]=useState("all"),[sort,setSort]=useState<"name"|"role"|"status">("name");
 const connected=!runtime.isDemo&&firebase?.status==="ready"&&Boolean(firebase.session);
 const roster=connected?(firebase?.directory??[]):data.users.filter(u=>u.role!=="Customer");
 const rows=useMemo(()=>{
   return roster.map(user=>{
     const access=connected?firebase?.accessRecords[user.id]:undefined;
     return{user,role:connected?access?.role??"Unverified":user.role,
       state:connected?access?.accountState??"Missing access record":"Demo fixture",
       team:connected?access?.team??"Unverified":user.team,
       managerId:connected?access?.managerId??"":"",matched:!connected||Boolean(access&&
         access.role===user.role&&access.team===user.team),
       updatedAt:access?.updatedAt??""};
   }).filter(row=>(roleFilter==="all"||row.role===roleFilter)&&
     (stateFilter==="all"||row.state===stateFilter)&&
     [row.user.name,row.user.email,row.role,row.team].join(" ").toLowerCase().includes(query.trim().toLowerCase()))
     .sort((a,b)=>String(sort==="name"?a.user.name:sort==="role"?a.role:a.state)
       .localeCompare(String(sort==="name"?b.user.name:sort==="role"?b.role:b.state))||
       a.user.id.localeCompare(b.user.id));
 },[roster,connected,firebase?.accessRecords,roleFilter,stateFilter,query,sort]);
 if(currentUser?.role!=="Administrator")
   return <div className="prototype-empty">Administrator access is required to review employee identities and roles.</div>;
 const roles=[...new Set(rows.map(row=>row.role))].sort();
 const states=[...new Set(rows.map(row=>row.state))].sort();
 const unsynced=connected?roster.filter(user=>!firebase?.accessRecords[user.id]||
    firebase.accessRecords[user.id].role!==user.role||
    firebase.accessRecords[user.id].team!==user.team).length:0;
 return <div className="prototype-domain prototype-domain--administration">
  <header className="prototype-heading"><h1>Users & Roles</h1>
    <p>One place to examine staff identity, access state, department, reporting lines and live role consistency. Permission changes remain source-validated Firebase actions.</p></header>
  <div className="prototype-domain-statbar">
   <article><small>Visible personnel accounts</small><strong>{roster.length}</strong></article>
   <article><small>Directory/access conflicts</small><strong>{connected?unsynced:"Not evaluated in demo"}</strong></article>
   <article><small>Identity source</small><strong>{connected?"Firebase access records":"Demo only"}</strong></article>
  </div>
  {!connected&&<p className="prototype-note" role="status">No live access change is available in this environment. Demo employee identities are not proof of provisioned Firebase Authentication accounts.</p>}
  <section className="prototype-panel"><h2>Permission and employment directory</h2>
   <div className="prototype-controls">
    <label>Search employee, role or team <input type="search" aria-label="Search users and roles" value={query}
       onChange={e=>setQuery(e.target.value)} placeholder="Name, email, department or role"/></label>
    <label>Role <select value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}>
     <option value="all">All roles</option>{roles.map(r=><option key={r}>{r}</option>)}</select></label>
    <label>Account state <select value={stateFilter} onChange={e=>setStateFilter(e.target.value)}>
     <option value="all">All states</option>{states.map(r=><option key={r}>{r}</option>)}</select></label>
    <label>Sort <select value={sort} onChange={e=>setSort(e.target.value as "name"|"role"|"status")}>
     <option value="name">Name</option><option value="role">Role</option>
     <option value="status">Account state</option></select></label>
   </div>
   <div className="prototype-table-scroll"><table className="prototype-table">
    <thead><tr><th>Employee</th><th>Role</th><th>Team</th><th>Account state</th><th>Reporting manager</th><th>Recorded</th></tr></thead>
    <tbody>{rows.map(row=><tr key={row.user.id}>
     <td><strong>{row.user.name}</strong><div className="prototype-small">{row.user.email}</div></td>
     <td>{row.role}{!row.matched&&<span role="note"> · Reconcile directory</span>}</td>
     <td>{row.team}</td><td>{row.state}</td><td>{row.managerId?roster.find(u=>u.id===row.managerId)?.name??"Recorded manager ID": "Not recorded"}</td>
     <td>{row.updatedAt?row.updatedAt.slice(0,10):"Not verified"}</td>
    </tr>)}</tbody></table></div>
   {!rows.length&&<p className="prototype-note">No authorized identity records match these filters.</p>}
  </section>
  <section className="prototype-panel">
   <h2>Controlled access changes</h2>
   <p className="prototype-note">This table never changes roles by itself. Provisioning, restoration, offboarding and Administrator elevation must use existing authenticated actions and verified server rules. Reconcile any directory mismatch first.</p>
   {connected?<FirebaseAccessPanel/>:<p>Connect an authorized Administrator session to manage actual Firebase employee access. No simulated role assignment will be written.</p>}
   <button type="button" onClick={()=>navigateToRoute("/admin/employees")}>Open Employee Directory & Profiles</button>
  </section>
 </div>;
}
