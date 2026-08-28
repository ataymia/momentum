"use client";
import { CircleAlert, Database, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { HCM_STORAGE_KEY, HCMState, canManageEmployee, createHcmSeed, normalizeHcmState } from "../../lib/hcm-engine";
import { useWorkspace } from "../../lib/workspace-context";
import { PageHeader, Section, StatusPill, formatMoney } from "../ui";

const loadHcm=(data:ReturnType<typeof useWorkspace>["data"]):HCMState=>{if(typeof window==="undefined")return createHcmSeed(data);try{return normalizeHcmState(JSON.parse(window.localStorage.getItem(HCM_STORAGE_KEY)??"null"),data);}catch{return createHcmSeed(data);}};

export function ReportsPage(){
  const {scope:records,data,currentUser}=useWorkspace();
  const [reportScope,setReportScope]=useState<"commercial"|"operations"|"people">("commercial");
  const [hcm,setHcm]=useState<HCMState>(()=>loadHcm(data));
  useEffect(()=>{const refresh=()=>setHcm(loadHcm(data));window.addEventListener("focus",refresh);return()=>window.removeEventListener("focus",refresh);},[data]);

  const paid=records.orders.filter((order)=>order.paymentStatus==="Paid").reduce((sum,order)=>sum+order.amount,0);
  const delivered=records.orders.filter((order)=>["Delivered","Paid"].includes(order.status)).reduce((sum,order)=>sum+order.cases,0);
  const available=records.inventory.reduce((sum,lot)=>sum+lot.available,0);
  const onHand=records.inventory.reduce((sum,lot)=>sum+lot.onHand,0);
  const reordered=records.accounts.filter((account)=>account.reorderCount>0).length;
  const visibleEmployeeIds=new Set(hcm.employees.filter((employee)=>currentUser?.role==="Administrator"||canManageEmployee(currentUser,employee.userId,data)).map((employee)=>employee.userId));
  const people={
    active:hcm.employees.filter((employee)=>visibleEmployeeIds.has(employee.userId)&&employee.status==="Active").length,
    pendingLeave:hcm.leaveRequests.filter((request)=>visibleEmployeeIds.has(request.userId)&&request.status==="Submitted").length,
    missingDocs:hcm.documents.filter((document)=>visibleEmployeeIds.has(document.userId)&&document.status==="Missing").length,
    overdueTraining:hcm.training.filter((assignment)=>visibleEmployeeIds.has(assignment.userId)&&assignment.status!=="Complete"&&Boolean(assignment.dueDate)&&assignment.dueDate!<new Date().toISOString().slice(0,10)).length,
    openReviews:hcm.reviews.filter((review)=>visibleEmployeeIds.has(review.userId)&&review.status!=="Acknowledged").length,
    openRecruiting:hcm.requisitions.filter((requisition)=>requisition.status==="Open"&&(currentUser?.role==="Administrator"||requisition.hiringManagerId===currentUser?.id)).length,
  };

  const metrics=useMemo(()=>{
    if(reportScope==="commercial")return[["Collected order value",formatMoney(paid),"Formula: sum order amount where paymentStatus = Paid"],["Delivered cases",String(delivered),"Formula: sum cases where status = Delivered or Paid"],["Active placements",String(records.placements.length),"Count of placement records in permitted scope"],["Reordered accounts",String(reordered),"Count of accounts where reorderCount > 0"]];
    if(reportScope==="operations")return[["On-hand inventory",`${onHand} cs`,"Formula: sum recorded lot onHand"],["Available inventory",`${available} cs`,"Formula: sum lot available; holds/reservations excluded by source record"],["Open field work",String(records.appointments.filter((item)=>item.status!=="Completed").length),"Appointments whose status is not Completed"],["Placement issues",String(records.placements.filter((item)=>item.status!=="Healthy").length),"Placement records whose status is not Healthy"]];
    return[["Active employees",String(people.active),"Active employment records inside permitted people scope"],["Pending time off",String(people.pendingLeave),"Leave requests with status Submitted"],["Missing documents",String(people.missingDocs),"Employee document requirements with status Missing"],["Overdue training",String(people.overdueTraining),"Incomplete assignments whose configured due date is before today"],["Open reviews",String(people.openReviews),"Performance reviews not yet acknowledged"],["Open requisitions",String(people.openRecruiting),"Open recruiting records owned by permitted hiring scope"]];
  },[available,delivered,onHand,paid,people.active,people.missingDocs,people.openRecruiting,people.openReviews,people.overdueTraining,people.pendingLeave,records.appointments,records.placements,reordered,reportScope]);

  return <div className="page page--reports"><PageHeader eyebrow="Operational reporting" title="Reports" description="Counts and totals derived from defined source records within your permitted scope." actions={<StatusPill tone="gold">Sample data</StatusPill>}/>
    <div className="report-integrity-banner"><Database size={20}/><div><strong>No live source systems are connected.</strong><p>These totals describe the fictional browser records used for this product tour. Each displayed KPI names its source rule instead of presenting ambiguous progress.</p></div></div>
    <div className="report-scope-tabs">{(["commercial","operations","people"] as const).map((item)=><button key={item} className={reportScope===item?"is-active":""} onClick={()=>setReportScope(item)}>{item}</button>)}</div>
    <div className="report-metric-grid">{metrics.map(([label,value,detail])=><article key={label}><div><span>{label}</span></div><strong>{value}</strong><p>{detail}</p></article>)}</div>
    {reportScope==="commercial"&&<Section title="Commercial record flow" description="Each milestone is reported separately" className="reality-panel"><div className="reality-flow">{[["Orders",records.orders.length,"Entered"],["Paid",records.orders.filter((item)=>item.paymentStatus==="Paid").length,"Collected"],["Delivered",records.orders.filter((item)=>["Delivered","Paid"].includes(item.status)).length,"Received"],["Placed",records.placements.length,"Observed"],["Reordered",reordered,"Bought again"]].map(([title,value,detail],index)=><div key={title as string}><span>{index+1}</span><div><small>{title as string}</small><strong>{value as number}</strong><p>{detail as string}</p></div></div>)}</div><div className="reality-note"><CircleAlert size={17}/><p>No POS or distributor-depletion feed is connected, so consumer sell-through is not reported.</p></div></Section>}
    {reportScope==="people"&&<Section title="People metric controls" description="Current formulas and privacy boundary"><div className="accounting-rule-list"><article><span><ShieldCheck size={17}/></span><div><strong>Scope</strong><p>Administrators see company workforce records. Managers see only employees inside their permitted management scope.</p></div></article><article><span><Database size={17}/></span><div><strong>Source of truth</strong><p>Employment, leave, documents, training, review and requisition ledgers in native HCM. No manual dashboard total is accepted.</p></div></article><article><span><CircleAlert size={17}/></span><div><strong>Action</strong><p>Exceptions belong in People & HR workflows; this page reports them but does not mutate the source records.</p></div></article></div></Section>}
  </div>;
}
