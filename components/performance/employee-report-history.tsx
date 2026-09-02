"use client";

import { FileText, MessageSquareText, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { canViewPerformanceRecord, reportVisibleTo } from "../../lib/performance-engine";
import { usePerformance } from "../../lib/performance-context";
import { useWorkspace } from "../../lib/workspace-context";
import { Section, StatusPill, formatDate, formatMoney } from "../ui";

export function EmployeeReportHistory(){
  const{data,currentUser}=useWorkspace();const{performance}=usePerformance();const employees=data.users.filter((user)=>user.role!=="Customer"&&canViewPerformanceRecord(currentUser,user.id,data));
  const[selectedUserId,setSelectedUserId]=useState(currentUser?.id??employees[0]?.id??"");
  const visible=useMemo(()=>performance.reports.filter((report)=>report.userId===selectedUserId&&reportVisibleTo(currentUser,report,data)).sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt)),[performance.reports,selectedUserId,currentUser,data]);
  const employee=data.users.find((user)=>user.id===selectedUserId);
  if(!currentUser||currentUser.role==="Customer")return null;
  return <Section title="Employee report history" description="Daily and manager weekly reports stay attached to the employee's record. Employees see their own history; managers and administrators see only records below their authority."><div className="account-detail__actions"><label className="reassign-field"><span>Employee</span><select value={selectedUserId} onChange={(event)=>setSelectedUserId(event.target.value)}>{employees.map((user)=><option key={user.id} value={user.id}>{user.name} · {user.title}</option>)}</select></label></div><div className="company-rule-facts"><div><span>Employee</span><strong>{employee?.name}</strong><small>{employee?.title}</small></div><div><span>Reports on file</span><strong>{visible.length}</strong><small>Immutable submitted history</small></div><div><span>Reviewed</span><strong>{visible.filter((report)=>report.status==="Reviewed").length}</strong><small>Management review complete</small></div><div><span>Open review</span><strong>{visible.filter((report)=>report.status==="Submitted").length}</strong><small>Still awaiting review</small></div></div><div className="company-request-list">{visible.map((report)=><article key={report.id}><span><FileText size={17}/></span><div><small>{report.type} · {report.type==="Daily"?formatDate(report.workDate,{weekday:"short",month:"short",day:"numeric"}):`${formatDate(report.weekStart,{month:"short",day:"numeric"})}–${formatDate(report.weekEnd,{month:"short",day:"numeric"})}`}</small><strong>{report.summary}</strong><p>{report.paidCases} paid cases · {report.paidOrders} paid orders · {formatMoney(report.collectedRevenue)} collected · {report.completedAppointments} completed appointments</p>{report.reviewerNotes&&<p><ShieldCheck size={13}/> Review: {report.reviewerNotes}</p>}</div><StatusPill tone={report.status==="Reviewed"?"success":"warning"}>{report.status}</StatusPill></article>)}{visible.length===0&&<div className="review-empty"><MessageSquareText size={23}/><h3>No submitted reports</h3><p>Daily and manager weekly report history will appear here after submission.</p></div>}</div></Section>;
}
