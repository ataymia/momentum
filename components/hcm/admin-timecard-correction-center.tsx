"use client";

import {useMemo,useState} from "react";
import {Download,Search,ShieldAlert} from "lucide-react";
import {useWorkspace} from "../../lib/workspace-context";
import {usePayroll} from "../../lib/payroll-context";
import {useRuntimeMode} from "../../lib/runtime-mode";
import {momentumStorage} from "../../lib/persistence";
import {consumedTimecards} from "../../lib/payroll-engine";
import {downloadPayrollCsv} from "../../lib/payroll-download";
import {TimecardRecord} from "./timecard-record";
import {Button,Field,Section,StatusPill,hoursBetween} from "../ui";

export function AdminTimecardCorrectionCenter(){
 const {data,currentUser,adminCreateMissingTimecard}=useWorkspace();
 const {payroll}=usePayroll();
 const runtime=useRuntimeMode();const writeDemo=runtime.isDemo&&momentumStorage.mode()==="local";
 const [search,setSearch]=useState("");
 const [status,setStatus]=useState("all");
 const [selectedId,setSelectedId]=useState("");
 const [newEmployeeId,setNewEmployeeId]=useState("");
 const [newWeekDate,setNewWeekDate]=useState("");
 const [creationReason,setCreationReason]=useState("");
 const [creationError,setCreationError]=useState("");
 const [creationMessage,setCreationMessage]=useState("");

 const admin=currentUser?.role==="Administrator";
 const consumed=consumedTimecards(payroll);
 const records=useMemo(()=>admin?data.timecards.filter(card=>{
   const employee=data.users.find(u=>u.id===card.userId);
   const query=[card.id,employee?.name,card.weekStart,card.weekEnd].join(" ").toLowerCase();
   return (status==="all"||status==="payrolled"&&consumed.has(card.id)||card.status===status)&&
     query.includes(search.toLowerCase().trim());
 }).sort((a,b)=>b.weekEnd.localeCompare(a.weekEnd)):[],
 [admin,data.users,data.timecards,status,search,consumed]);
 const selected=records.find(c=>c.id===selectedId);
 const createMissingWeek=()=>{
   setCreationError("");setCreationMessage("");
   const result=adminCreateMissingTimecard(newEmployeeId,newWeekDate,creationReason);
   if(!result.ok){setCreationError(result.error??"Missing timecard could not be created.");return;}
   setSearch("");setStatus("all");setSelectedId(result.id??"");
   setCreationMessage("Missing timecard created for employee review. Open it below and add verified shifts, then request employee attestation.");
   setCreationReason("");setNewWeekDate("");
 };
 const exportRows=records.map(card=>{
   const entries=data.timeEntries.filter(e=>e.userId===card.userId&&e.date>=card.weekStart&&e.date<=card.weekEnd);
   return {employee:data.users.find(u=>u.id===card.userId)?.name??"Employee unavailable",
    cardId:card.id,weekStart:card.weekStart,weekEnd:card.weekEnd,status:card.status,
    recordedHours:Math.round(entries.reduce((sum,e)=>sum+hoursBetween(e.clockIn,e.clockOut,e.breakMinutes),0)*100)/100,
    entries:entries.length,attested:card.attested?"Yes":"No",
    payrunLocked:consumed.has(card.id)?"Yes":"No",
    submittedAt:card.submittedAt??"",approvedAt:card.approvedAt??"",returnedAt:card.returnedAt??"",
    returnedReason:card.returnReason??""};
 });
 if(!admin)return null;
 return <Section title="Administrator timecard corrections"
  description="Find any employee's timecard, correct punches or breaks, and record verified missed shifts. Unpaid edits return the card for employee re-attestation and another approval.">
  {!writeDemo&&<p className="form-hint">This connected environment is read-only for timecard corrections until a server-authoritative payroll transaction is available. Existing records and exports remain viewable.</p>}
  <div className="form-grid">
    <Field label="Employee missing an entire week"><select value={newEmployeeId} onChange={e=>setNewEmployeeId(e.target.value)}>
      <option value="">Select an employee</option>
      {data.users.filter(u=>u.role!=="Customer").sort((a,b)=>a.name.localeCompare(b.name)).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
    </select></Field>
    <Field label="Date during missing week"><input type="date" value={newWeekDate} onChange={e=>setNewWeekDate(e.target.value)}/></Field>
    <Field label="Reason and source of verification"><input value={creationReason} onChange={e=>setCreationReason(e.target.value)}
      placeholder="Employee verified the missed week"/></Field>
    <Button variant="secondary" disabled={!writeDemo||!newEmployeeId||!newWeekDate||creationReason.trim().length<8}
      onClick={createMissingWeek}>Create missing timecard</Button>
  </div>
  {creationError&&<p role="alert" className="form-error">{creationError}</p>}
  {creationMessage&&<p role="status" className="form-notice">{creationMessage}</p>}
  <div className="form-grid">
   <Field label="Search employees, weeks or IDs"><div className="search-field"><Search size={15}/><input
     value={search} onChange={e=>setSearch(e.target.value)} placeholder="Employee or week starting date"/></div></Field>
   <Field label="Timecard status"><select value={status} onChange={e=>{setStatus(e.target.value);setSelectedId("");}}>
    <option value="all">All statuses</option><option value="Open">Open</option><option value="Submitted">Submitted</option>
    <option value="Manager approved">Manager approved</option><option value="Payroll ready">Payroll ready</option>
    <option value="Returned">Returned for correction</option><option value="payrolled">Already assigned to payroll</option>
   </select></Field>
  </div>
  <div className="request-actions">
   <Button size="sm" variant="secondary" icon={<Download size={14}/>} disabled={!records.length}
    onClick={()=>downloadPayrollCsv("momentum-admin-timecards.csv",exportRows,[
      "employee","cardId","weekStart","weekEnd","status","recordedHours","entries","attested",
      "payrunLocked","submittedAt","approvedAt","returnedAt","returnedReason"
    ])}>Export filtered timecards</Button>
   <span className="form-hint">{records.length} matching timecard{records.length===1?"":"s"}</span>
  </div>
  <div className="company-request-list">
    {records.slice(0,100).map(card=>{
      const employee=data.users.find(u=>u.id===card.userId);
      const entries=data.timeEntries.filter(e=>e.userId===card.userId&&e.date>=card.weekStart&&e.date<=card.weekEnd);
      const hours=entries.reduce((sum,e)=>sum+hoursBetween(e.clockIn,e.clockOut,e.breakMinutes),0);
      return <article key={card.id}>
        <div><small>{card.weekStart} to {card.weekEnd}</small>
        <strong>{employee?.name??"Employee unavailable"}</strong>
        <p>{hours.toFixed(2)} recorded hours · {entries.length} punches · {card.attested?"Attested":"Needs attestation"}</p></div>
        <StatusPill tone={consumed.has(card.id)?"warning":card.status==="Returned"?"danger":"info"}>
         {consumed.has(card.id)?"Payroll locked":card.status}</StatusPill>
        <Button size="sm" variant="secondary" onClick={()=>setSelectedId(id=>id===card.id?"":card.id)}>
         {selectedId===card.id?"Close":"Open / correct"}</Button>
      </article>;
    })}
    {!records.length&&<div className="review-empty"><p>No timecards match these filters. If an entire week is missing, use Create missing timecard above, then add the verified shifts.</p></div>}
    {records.length>100&&<p className="form-hint">Showing the first 100 results. Refine your search to find older records.</p>}
  </div>
  {selected&&<div className="timecard-admin-detail">
   <TimecardRecord timecardId={selected.id}/>
  </div>}
  <div className="form-callout"><ShieldAlert size={17}/><p>Payroll-processed cards are read-only. Record retroactive wage differences through payroll adjustments, with the original timecard and paid ledger preserved. Administrator corrections must have a reason and generate an employee review notification.</p></div>
 </Section>;
}
