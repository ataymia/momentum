"use client";

import { Download, FileSearch2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useCommerce } from "../../lib/commerce-context";
import { useCrm } from "../../lib/crm-context";
import { addCalendarDays, arizonaDateKey } from "../../lib/date-time";
import { useFieldTracking } from "../../lib/location-tracking-context";
import { useHcm } from "../../lib/hcm-context";
import { adminAuditPdf } from "../../lib/admin-audit-pdf";
import { buildAdminAudit, type AdminAuditReport, type AuditCategory } from "../../lib/admin-audit-engine";
import { useWorkspace } from "../../lib/workspace-context";
import { Section } from "../ui";

type Tab = "All" | "Visits" | AuditCategory;
const tabs:Tab[]=["Sales","Visits","Timekeeping","Field","All"];
const localTime=(iso?:string)=>iso?new Intl.DateTimeFormat("en-US",{timeZone:"America/Phoenix",hour:"numeric",minute:"2-digit"}).format(new Date(iso)):"Not recorded";
const duration=(min?:number)=>min===undefined?"n/a":Math.floor(min/60)+"h "+String(min%60).padStart(2,"0")+"m";
const rate=(value:number|null)=>value===null?"n/a":value.toFixed(1)+"%";
const money=(value:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(value);

export function AdminAuditBot(){
  const {data,currentUser}=useWorkspace();
  const {crm}=useCrm();
  const {commerce}=useCommerce();
  const {hcm}=useHcm();
  const {state:tracking}=useFieldTracking();
  const [from,setFrom]=useState(()=>addCalendarDays(arizonaDateKey(),-6));
  const [to,setTo]=useState(()=>arizonaDateKey());
  const [person,setPerson]=useState("all");
  const [tab,setTab]=useState<Tab>("Sales");
  const [onlyRepeated,setOnlyRepeated]=useState(false);
  const [report,setReport]=useState<AdminAuditReport|null>(null);
  const [error,setError]=useState("");
  const employees=useMemo(()=>data.users.filter(user=>user.role!=="Customer").sort((a,b)=>a.name.localeCompare(b.name)),[data.users]);
  if(currentUser?.role!=="Administrator")return null;

  const run=()=>{
    try{
      const ids=person==="all"?employees.map(u=>u.id):employees.some(u=>u.id===person)?[person]:[];
      if(!ids.length)throw new Error("Select an employee.");
      const next=buildAdminAudit(data,crm,tracking,commerce,from,to,ids,hcm.shifts);
      setReport(next);setError("");
    }catch(e){setError(e instanceof Error?e.message:"Unable to build audit.");setReport(null);}
  };
  const download=()=>{
    if(!report)return;
    const blob=adminAuditPdf(report);
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;
    link.download="Momentum-Admin-Audit-"+report.from+"-to-"+report.to+".pdf";
    document.body.appendChild(link);link.click();link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),5000);
  };
  const flagged=report?.days.reduce((count,d)=>count+d.flags.length,0)??0;
  const autoClosed=report?.days.filter(d=>d.autoClosed).length??0;
  const visibleDays=report?.days.filter(d=>tab==="All"||tab==="Timekeeping"||tab==="Field"||tab==="Sales"
    ? tab==="All"||tab==="Sales"||d.flags.some(f=>f.category===tab)
    : false)??[];
  const visibleSales=(tab==="All"||tab==="Sales")?report?.sales??[]:[];
  const visibleVisits=(tab==="All"||tab==="Visits")?(report?.visits??[]).filter(row=>!onlyRepeated||row.visits>1):[];

  return <Section title="Admin audit bot">
    <div className="admin-audit-controls">
      <label>From<input type="date" value={from} onChange={e=>{setFrom(e.target.value);setReport(null);}}/></label>
      <label>Through<input type="date" value={to} onChange={e=>{setTo(e.target.value);setReport(null);}}/></label>
      <label>Employee<select value={person} onChange={e=>{setPerson(e.target.value);setReport(null);}}>
        <option value="all">All employees</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name} ({e.role})</option>)}
      </select></label>
      <button type="button" className="admin-audit-primary" onClick={run}><FileSearch2 size={17}/> Run audit</button>
    </div>
    {error&&<p role="alert" className="admin-audit-warning">{error}</p>}
    {report&&<>
      <div className="admin-audit-heading">
        <div><strong>{report.from} – {report.to}</strong><p>{report.reviewedEmployees} employees</p></div>
        <button type="button" onClick={download} className="admin-audit-primary"><Download size={16}/> Download PDF</button>
      </div>
      <div className="admin-audit-tiles">
        <article><small>Employee-days</small><strong>{report.days.length}</strong></article>
        <article><small>Midnight clock-outs</small><strong>{autoClosed}</strong></article>
        <article><small>Review flags</small><strong>{flagged}</strong></article>
        <article><small>Accounts sold</small><strong>{report.sales.reduce((total,row)=>total+row.accountsSold,0)}</strong></article>
      </div>
      <div className="admin-audit-tabs" role="group" aria-label="Audit section">
        {tabs.map(item=><button type="button" key={item} aria-pressed={tab===item} className={tab===item?"is-selected":""} onClick={()=>setTab(item)}>{item==="Visits"?"Visits by location":item}</button>)}
      </div>
      {(tab==="All"||tab==="Sales")&&<>
        <h3 className="admin-audit-subtitle">Sales and conversion performance</h3>
        <div className="admin-audit-scroll"><table className="admin-audit-table"><thead><tr>
          <th>Salesperson</th><th>Visits / unique locations</th><th>Return visits</th><th>Locations revisited</th><th>Opened</th><th>Owned now</th>
          <th>Accounts sold</th><th>Paid buyers</th><th>Paid repeat buyers</th><th>Orders placed / paid</th><th>Paid cases</th><th>Visit to order</th><th>Opened to order</th><th>Owned book ordering</th><th>Net collected</th>
        </tr></thead><tbody>
          {visibleSales.map(s=><tr key={s.userId}>
            <td><strong>{s.employee}</strong></td><td>{s.physicalVisits} / {s.distinctVisitedAccounts}</td><td>{s.returnVisits}</td><td>{s.revisitedLocations}</td><td>{s.newAccountsOpened}</td><td>{s.accountsOwnedNow}</td>
            <td>{s.accountsSold}</td><td>{s.firstTimeBuyingAccounts}</td><td>{s.reorderingAccounts}</td><td>{s.placedOrders} / {s.paidOrders}</td><td>{s.paidCases}</td>
            <td><strong>{rate(s.visitToOrderPercent)}</strong><small>{s.visitedAccountsThatOrdered}/{s.distinctVisitedAccounts} locations</small></td>
            <td><strong>{rate(s.newAccountToOrderPercent)}</strong><small>{s.newAccountsThatOrdered}/{s.newAccountsOpened} opened</small></td>
            <td><strong>{rate(s.ownedBookOrderingPercent)}</strong><small>{s.ownedAccountsThatOrdered}/{s.accountsOwnedNow} owned</small></td>
            <td>{money(s.netCollected)}</td>
          </tr>)}
          {!visibleSales.length&&<tr><td colSpan={15}>No sales employees in this selection.</td></tr>}
        </tbody></table></div>
      </>}
      {(tab==="All"||tab==="Visits")&&<>
        <div className="admin-audit-heading"><div>
          <h3 className="admin-audit-subtitle">Visits by business location</h3>
        </div><label className="admin-audit-repeat-filter">
          <input type="checkbox" checked={onlyRepeated} onChange={e=>setOnlyRepeated(e.target.checked)}/> Show only locations with 2+ visits
        </label></div>
        <div className="admin-audit-scroll"><table className="admin-audit-table"><thead><tr>
          <th>Employee</th><th>Business / location</th><th>Total visits</th><th>Return visits</th><th>Distinct days</th>
          <th>First and last visit</th><th>Visit dates (Phoenix)</th><th>Unsuccessful visits</th><th>Paid orders credited to rep</th><th>Visits by selected team</th>
        </tr></thead><tbody>
          {visibleVisits.map(row=><tr key={row.userId+"-"+row.locationId}>
            <td>{row.employee}</td><td><strong>{row.location}</strong><small>{row.linkedAccount?"Linked customer location":"Unlinked Quick Visit / CRM location"}</small></td>
            <td><strong>{row.visits}</strong></td><td>{row.returnVisits}</td><td>{row.distinctVisitDays}</td>
            <td><small>{arizonaDateKey(row.firstVisitedAt)} {localTime(row.firstVisitedAt)}</small>
                <small>{arizonaDateKey(row.lastVisitedAt)} {localTime(row.lastVisitedAt)}</small></td>
            <td>{row.visitDates.join(", ")}</td><td>{row.unsuccessfulVisits}</td>
            <td>{row.linkedAccount?row.paidOrdersCreditedToRep:"Not linked"}</td><td>{row.selectedTeamVisits}</td>
          </tr>)}
          {!visibleVisits.length&&<tr><td colSpan={10}>{onlyRepeated?"No repeat visits recorded in this period.":"No physical visits recorded for these employees and dates."}</td></tr>}
        </tbody></table></div>
      </>}
      {(tab==="All"||tab==="Timekeeping"||tab==="Field")&&<>
        <h3 className="admin-audit-subtitle">Timekeeping and field evidence</h3>
        <div className="admin-audit-scroll"><table className="admin-audit-table"><thead><tr>
          <th>Employee / day</th><th>Clock in/out</th><th>Last physical visit</th><th>Last work event</th><th>Last GPS</th><th>Visit gap</th><th>Work gap</th><th>GPS gap</th><th>Evidence / exceptions</th>
        </tr></thead><tbody>
          {visibleDays.map(d=><tr key={d.userId+"-"+d.date}>
            <td><strong>{d.employee}</strong><small>{d.date}</small></td>
            <td>{localTime(d.firstClockIn)} → {localTime(d.lastClockOut)}<small>{d.timeEntries} punch record(s){d.autoClosed?" · AUTO-CLOSED":""}</small></td>
            <td>{localTime(d.lastPhysicalVisit)}</td><td>{localTime(d.lastWorkEvent)}</td><td>{localTime(d.lastGps)}<small>{d.savedGpsPoints} points</small></td>
            <td>{duration(d.visitToOutMinutes)}</td><td>{duration(d.workToOutMinutes)}</td><td>{duration(d.gpsToOutMinutes)}</td>
            <td>{d.flags.filter(f=>tab==="All"||f.category===tab).map((f,i)=><p className="admin-audit-flag" key={i}><b>{f.category}:</b> {f.reason}</p>)}{!d.flags.some(f=>tab==="All"||f.category===tab)&&<span>No flagged exception</span>}</td>
          </tr>)}
          {!visibleDays.length&&<tr><td colSpan={9}>No matching daily records or exceptions.</td></tr>}
        </tbody></table></div>
      </>}
    </>}
  </Section>;
}
