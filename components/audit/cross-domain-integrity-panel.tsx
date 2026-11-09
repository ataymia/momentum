"use client";
import {useMemo,useState} from "react";
import {useWorkspace} from "../../lib/workspace-context";
import {useCrm} from "../../lib/crm-context";
import {useCommerce} from "../../lib/commerce-context";
import {useInventoryLedger} from "../../lib/inventory-ledger-context";
import {scanCrossDomainIntegrity} from "../../lib/cross-domain-integrity";
import {Section,StatusPill} from "../ui";

/** Administrator-only read model, not a provider/bank reconciliation run. */
export function CrossDomainIntegrityPanel(){
 const {currentUser,data}=useWorkspace();
 const {crm}=useCrm();
 const {commerce}=useCommerce();
 const {ledger}=useInventoryLedger();
 const [filter,setFilter]=useState<"all"|"blocker"|"review">("all");
 const issues=useMemo(()=>currentUser?.role==="Administrator"?
   scanCrossDomainIntegrity(data,crm,commerce,ledger):[],
   [currentUser?.role,data,crm,commerce,ledger]);
 if(currentUser?.role!=="Administrator")return null;
 const blockerCount=issues.filter(issue=>issue.severity==="blocker").length;
 const shown=issues.filter(issue=>filter==="all"||issue.severity===filter);
 return <Section title="Cross-department record integrity" className="cross-domain-integrity-panel"
  description="Read-only joins across CRM, customer locations, sales orders, invoices, payments, refunds and inventory custody. Does not certify bank settlement or replace server source reconciliation."
  action={<StatusPill tone={blockerCount?"danger":issues.length?"warning":"neutral"}>{issues.length} flagged records</StatusPill>}>
  <div className="prototype-panel" style={{border:"none",boxShadow:"none",margin:0}}>
   <div className="prototype-metrics">
    <div><small>Blocking mismatches</small><strong>{blockerCount}</strong></div>
    <div><small>Review exceptions</small><strong>{issues.length-blockerCount}</strong></div>
    <div><small>Evidence source</small><strong style={{fontSize:14}}>Current workspace</strong></div>
   </div>
   <p className="prototype-note" role="note">These checks only cover records loaded for this Administrator. A zero count does not prove that live processor deposits, external HR signatures, missing imports, or inventory outside this workspace were reconciled.</p>
   <div className="prototype-controls">
    <label>Show exceptions
      <select value={filter} onChange={event=>setFilter(event.target.value as "all"|"blocker"|"review")}>
       <option value="all">All exceptions</option>
       <option value="blocker">Release blockers</option>
       <option value="review">Needs review</option>
      </select>
    </label>
   </div>
   {shown.length?<div className="prototype-table-scroll"><table className="prototype-table">
     <thead><tr><th>Severity</th><th>Department</th><th>Problem</th><th>Source ID</th><th>What needs reconciliation</th></tr></thead>
     <tbody>{shown.slice(0,150).map((issue,index)=><tr key={issue.code+":"+issue.recordId+":"+index}>
       <td>{issue.severity==="blocker"?"Blocker":"Review"}</td><td>{issue.domain}</td>
       <td><strong>{issue.code.replaceAll("_"," ").toLowerCase()}</strong></td>
       <td><code>{issue.recordId}</code></td><td>{issue.detail}</td>
     </tr>)}</tbody>
    </table></div>:<p className="prototype-empty">No matching issues in the loaded source records. External settlement and provider checks are still required.</p>}
   {shown.length>150&&<p className="prototype-note">Showing the first 150 exceptions. Review the source ledgers for the remainder; this panel never truncates or deletes records.</p>}
  </div>
 </Section>;
}
