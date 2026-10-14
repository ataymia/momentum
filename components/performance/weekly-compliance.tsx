"use client";
import {useEffect,useMemo,useState} from "react";
import {canManageUser} from "../../lib/access";
import {useHcm} from "../../lib/hcm-context";
import {useCrm} from "../../lib/crm-context";
import {usePerformance} from "../../lib/performance-context";
import {weekRange} from "../../lib/performance-engine";
import {weeklyPhysicalVisits,weeklySubmissionStatus,weeklyReporterEligible} from "../../lib/weekly-compliance";
import {commitFirestoreWrites,getFirestoreSnapshots} from "../../lib/firebase-firestore-rest";
import {useWorkspace} from "../../lib/workspace-context";
import {Button,Field,Section} from "../ui";

type Target={userId:string;weekStart:string;target:number;updatedAt:string;updatedBy:string};
export function WeeklyCompliance(){
 const {data,currentUser}=useWorkspace();const {hcm}=useHcm();const {performance}=usePerformance();const {crm}=useCrm();
 const [week,setWeek]=useState(()=>weekRange().start);const [targets,setTargets]=useState<Record<string,Target>>({});const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);
 const period=weekRange(week);const manager=currentUser?.role==="Administrator"||currentUser?.role==="Sales Manager";
 const people=useMemo(()=>currentUser?data.users.filter(user=>weeklyReporterEligible(user,hcm.employees.find(employee=>employee.userId===user.id)?.status)&&(manager?canManageUser(data,currentUser,user.id):user.id===currentUser.id)):[],[data,currentUser,manager,hcm.employees]);
 useEffect(()=>{let active=true;const paths=people.filter(user=>["Sales Representative","Sales Manager"].includes(user.role)).map(user=>`salesVisitTargets/${user.id}/weeks/${period.start}`);void getFirestoreSnapshots(paths).then(rows=>{if(active)setTargets(Object.fromEntries(rows.flatMap(row=>row.data?[[row.data.userId as string,row.data as Target]]:[])));}).catch(()=>{if(active)setMessage("Visit targets could not be loaded. Check Firebase access before setting targets.");});return()=>{active=false;};},[people,period.start]);
 const save=async(userId:string,value:string)=>{const target=Number(value);if(!currentUser||!value.trim()||!Number.isInteger(target)||target<0){setMessage("Enter a nonnegative whole-number target.");return;}setBusy(true);try{const row:Target={userId,weekStart:period.start,target,updatedAt:new Date().toISOString(),updatedBy:currentUser.id};await commitFirestoreWrites([{kind:"set",path:`salesVisitTargets/${userId}/weeks/${period.start}`,data:row}]);setTargets(old=>({...old,[userId]:row}));setMessage("Weekly target saved.");}catch{setMessage("The target was not saved. Check your management access.");}finally{setBusy(false);}};
 return <Section title={manager?"Weekly reporting compliance & visit targets":"Weekly report & visit comparison"} description="Physical visits use the existing visit ledger, including unsuccessful stops. Variance is actual visits minus the approved target."><Field label="Reporting week"><input type="date" value={period.start} onChange={event=>{if(event.target.value)setWeek(weekRange(event.target.value).start);}}/></Field>{message&&<p role="status">{message}</p>}<div style={{overflowX:"auto"}}><table className="data-table"><thead><tr><th>Employee</th><th>Report</th><th>Due</th><th>Submitted</th><th>Actual visits</th><th>Approved target</th><th>Variance</th></tr></thead><tbody>{people.map(user=>{const report=weeklySubmissionStatus(performance,user.id,period.start);const sales=["Sales Representative","Sales Manager"].includes(user.role);const actual=weeklyPhysicalVisits(crm,user.id,period.start,period.end);const candidate=targets[user.id];const target=candidate?.weekStart===period.start?candidate:undefined;return <tr key={user.id}><td>{user.name}</td><td>{report.status}</td><td>{report.dueDate}</td><td>{report.report?.submittedAt?new Date(report.report.submittedAt).toLocaleString():"—"}</td><td>{sales?actual:"—"}</td><td>{sales?<><span>{target?.target??"Not set"}</span>{manager&&<Button disabled={busy} size="sm" variant="ghost" onClick={()=>{const value=window.prompt(`Weekly visit target for ${user.name}`,String(target?.target??""));if(value!==null)void save(user.id,value);}}>Set target</Button>}</>:"—"}</td><td>{sales&&target?actual-target.target:"—"}</td></tr>;})}</tbody></table></div></Section>;
}
