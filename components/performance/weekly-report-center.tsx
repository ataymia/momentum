"use client";

import { ClipboardCheck, FileText, Save, Send, ShieldCheck, Target } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { arizonaDateKey } from "../../lib/date-time";
import { PERFORMANCE_STORAGE_KEY, WeeklyGoalResult, WeeklyProgressReport, canViewPerformanceRecord, weekRange, weeklyProgressVisibleTo, weeklyReportingObligations } from "../../lib/performance-engine";
import { usePerformance } from "../../lib/performance-context";
import { momentumStorage } from "../../lib/persistence";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Field, Section, StatusPill, formatDate } from "../ui";

type WeeklyForm={goals:WeeklyGoalResult[];summary:string;nextWeekGoals:string[]};
const emptyForm=():WeeklyForm=>({goals:[0,1,2].map(()=>({goal:"",actual:"",notes:""})),summary:"",nextWeekGoals:["","",""]});
const toneFor=(report:WeeklyProgressReport)=>report.status==="Reviewed"?"success" as const:"warning" as const;

export function WeeklyReportCenter(){
  const {data,currentUser}=useWorkspace();
  const {performance,ensureWeeklyDraft,saveWeeklyDraft,submitWeeklyProgress,reviewReport}=usePerformance();
  const today=arizonaDateKey();
  const currentWeek=weekRange(today);
  const targetWeek=typeof window!=="undefined"?window.sessionStorage.getItem("momentum-weekly-report-week"):null;
  const focusId=typeof window!=="undefined"?window.sessionStorage.getItem("momentum-focus-record"):null;
  const obligations=currentUser&&currentUser.role!=="Customer"?weeklyReportingObligations(performance,currentUser.id,today):[];
  const initialWeek=targetWeek&&obligations.some((item)=>item.weekStart===targetWeek)?targetWeek:(obligations[0]?.weekStart??currentWeek.start);
  const [selectedWeek,setSelectedWeek]=useState(initialWeek);
  const [form,setForm]=useState<WeeklyForm>(emptyForm);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [selectedReportId,setSelectedReportId]=useState<string|null>(focusId);
  const [reviewNote,setReviewNote]=useState("");

  const draft=performance.weeklyDrafts.find((item)=>item.userId===currentUser?.id&&item.weekStart===selectedWeek);
  const submittedForWeek=performance.reports.find((item):item is WeeklyProgressReport=>item.type==="Weekly progress"&&item.userId===currentUser?.id&&item.weekStart===selectedWeek);
  const visibleReports=useMemo(()=>currentUser?performance.reports.filter((item):item is WeeklyProgressReport=>item.type==="Weekly progress"&&weeklyProgressVisibleTo(currentUser,item,data)).sort((a,b)=>b.weekStart.localeCompare(a.weekStart)):[],[performance.reports,currentUser,data]);
  const selectedReport=visibleReports.find((item)=>item.id===selectedReportId)??submittedForWeek;

  useEffect(()=>{
    if(!currentUser||currentUser.role==="Customer"||submittedForWeek||draft)return;
    if(obligations.some((item)=>item.weekStart===selectedWeek))ensureWeeklyDraft(selectedWeek);
  },[currentUser,selectedWeek,submittedForWeek,draft,obligations,ensureWeeklyDraft]);

  useEffect(()=>{
    if(!draft)return;
    setForm({goals:draft.goals.map((line)=>({...line})),summary:draft.summary,nextWeekGoals:[...draft.nextWeekGoals]});
  },[draft?.id,draft?.updatedAt]);

  useEffect(()=>{
    if(typeof window==="undefined")return;
    if(targetWeek){window.sessionStorage.removeItem("momentum-weekly-report-week");setSelectedWeek(targetWeek);}
    if(focusId)window.sessionStorage.removeItem("momentum-focus-record");
  },[]);

  if(!currentUser||currentUser.role==="Customer")return null;

  const updateGoal=(index:number,key:keyof WeeklyGoalResult,value:string)=>setForm((current)=>({...current,goals:current.goals.map((line,i)=>i===index?{...line,[key]:value}:line)}));
  const updateNextGoal=(index:number,value:string)=>setForm((current)=>({...current,nextWeekGoals:current.nextWeekGoals.map((goal,i)=>i===index?value:goal)}));
  const persist=async()=>{
    if(!draft)return false;
    if(!saveWeeklyDraft(draft.id,form)){setError("Momentum could not save this weekly-report draft.");return false;}
    const confirmed=await momentumStorage.flushAndConfirm(PERFORMANCE_STORAGE_KEY);
    if(!confirmed.ok){setError(`Draft is queued on this device but Momentum cloud has not confirmed it. ${confirmed.message??"Check the sync indicator before closing the app."}`);return false;}
    return true;
  };
  const save=async()=>{setBusy(true);setError("");setMessage("");const ok=await persist();setBusy(false);if(ok)setMessage("Draft saved to Momentum cloud.");};
  const submit=async()=>{
    setError("");setMessage("");
    if(!draft){setError("Open the weekly report before submitting it.");return;}
    if(!form.summary.trim()){setError("Add the weekly summary before submitting.");return;}
    if(form.goals.some((line)=>!line.actual.trim())){setError("Enter an actual result for all three goals. N/A is already filled when no prior goal exists.");return;}
    if(form.nextWeekGoals.some((goal)=>!goal.trim())){setError("Enter all three goals for next week so they can carry into the next report automatically.");return;}
    setBusy(true);const saved=await persist();if(!saved){setBusy(false);return;}
    const id=submitWeeklyProgress(draft.id);if(!id){setBusy(false);setError("The weekly report was not accepted. It may already be submitted or a required field is missing.");return;}
    const confirmed=await momentumStorage.flushAndConfirm(PERFORMANCE_STORAGE_KEY);setBusy(false);
    if(!confirmed.ok){setError(`Report is queued on this device but Momentum cloud has not confirmed it. Do not submit it again. ${confirmed.message??"Check the sync indicator."}`);return;}
    setSelectedReportId(id);setMessage("Weekly report submitted. Your three next-week goals will carry into the next report automatically.");
  };
  const doReview=async()=>{
    if(!selectedReport||selectedReport.userId===currentUser.id||!canViewPerformanceRecord(currentUser,selectedReport.userId,data))return;
    setBusy(true);setError("");if(!reviewReport(selectedReport.id,reviewNote)){setBusy(false);setError("This report could not be reviewed from your current role or reporting scope.");return;}
    const confirmed=await momentumStorage.flushAndConfirm(PERFORMANCE_STORAGE_KEY);setBusy(false);if(!confirmed.ok){setError(confirmed.message??"Review is not cloud-confirmed yet.");return;}setReviewNote("");setMessage("Weekly report marked reviewed.");
  };

  return <>
    <div className="report-integrity-banner"><Target size={20}/><div><strong>Weekly goals now roll forward automatically.</strong><p>Each employee receives a Monday weekly-report obligation. This week&apos;s three goals come from the prior submitted report. The report is due the following Monday and remains in Required Actions until submitted.</p></div></div>

    <Section title="My weekly report" description="Three goals, actual results, notes, a weekly summary, and the next three goals">
      <div className="company-rule-facts"><div><span>Open reports</span><strong>{obligations.length}</strong><small>Beginning Monday, October 5</small></div><div><span>Selected week</span><strong>{formatDate(selectedWeek,{month:"short",day:"numeric"})}</strong><small>Monday through Sunday</small></div><div><span>Due</span><strong>{draft?formatDate(draft.dueDate,{weekday:"short",month:"short",day:"numeric"}):submittedForWeek?"Submitted":"Not generated"}</strong><small>Following Monday</small></div><div><span>Status</span><strong>{submittedForWeek?submittedForWeek.status:draft?"Draft":"Open"}</strong><small>{submittedForWeek?"History retained":"Required until submitted"}</small></div></div>
      {obligations.length>1&&<div className="report-scope-tabs">{obligations.map((item)=><button key={item.weekStart} className={selectedWeek===item.weekStart?"is-active":""} onClick={()=>{setSelectedWeek(item.weekStart);setMessage("");setError("");}}>{formatDate(item.weekStart,{month:"short",day:"numeric"})}{item.overdue?" · overdue":item.dueToday?" · due today":""}</button>)}</div>}
      {submittedForWeek?<div className="review-empty"><ClipboardCheck size={25}/><h3>This week&apos;s report is submitted</h3><p>The submitted report is locked as history. Open it below to review goals, actuals, summary, and next-week commitments.</p></div>:draft?<div className="form-grid">
        {form.goals.map((line,index)=><div key={index} className="field--full"><div className="form-grid"><div className="field--full"><strong>Goal {index+1}</strong></div><Field label="Goal"><input readOnly value={line.goal||"N/A"}/></Field><Field label="Actual"><input value={line.actual} disabled={line.goal==="N/A"} onChange={(event)=>updateGoal(index,"actual",event.target.value)} placeholder="What actually happened?"/></Field><Field label="Notes regarding goal" className="field--full"><textarea rows={2} value={line.notes} onChange={(event)=>updateGoal(index,"notes",event.target.value)} placeholder="Context, blockers, explanation, or what changed"/></Field></div></div>)}
        <Field label="Weekly summary" className="field--full" hint="Summarize the week, major wins, problems, decisions, and anything leadership should know."><textarea rows={6} value={form.summary} onChange={(event)=>setForm((current)=>({...current,summary:event.target.value}))}/></Field>
        <div className="field--full"><strong>Next week&apos;s three goals</strong><p>These become the Goal fields automatically on your next weekly report.</p></div>
        {form.nextWeekGoals.map((goal,index)=><Field key={index} label={`Next-week goal ${index+1}`} className="field--full"><input value={goal} onChange={(event)=>updateNextGoal(index,event.target.value)} placeholder={`Enter goal ${index+1}`}/></Field>)}
        {error&&<div className="form-callout field--full"><FileText size={17}/><p>{error}</p></div>}{message&&<div className="report-integrity-banner field--full"><ShieldCheck size={17}/><div><strong>{message}</strong></div></div>}
        <div className="field--full account-detail__actions"><Button variant="secondary" icon={<Save size={15}/>} onClick={save} disabled={busy}>Save draft</Button><Button icon={<Send size={15}/>} onClick={submit} disabled={busy}>Submit weekly report</Button></div>
      </div>:<div className="review-empty"><FileText size={25}/><h3>No weekly report is due yet</h3><p>The recurring workflow begins Monday, October 5, 2026.</p></div>}
    </Section>

    <Section title="Weekly report history" description="Employees see their own reports. Sales Managers see reports in their management scope. Administrators see the company reporting chain."><div className="bonus-ledger">{visibleReports.map((report)=>{const user=data.users.find((item)=>item.id===report.userId);return <button key={report.id} className={`account-table ${selectedReportId===report.id?"is-selected":""}`} onClick={()=>setSelectedReportId(report.id)}><span className="account-name-cell"><i><FileText size={17}/></i><span><strong>{user?.name??"Employee"}</strong><small>{formatDate(report.weekStart,{month:"short",day:"numeric"})} to {formatDate(report.weekEnd,{month:"short",day:"numeric"})}</small></span></span><span><StatusPill tone={toneFor(report)}>{report.status}</StatusPill></span><span>Weekly progress</span><span>Due {formatDate(report.dueDate,{month:"short",day:"numeric"})}</span></button>;})}{visibleReports.length===0&&<div className="review-empty"><FileText size={25}/><h3>No weekly reports yet</h3><p>Submitted weekly reports will remain here as running history.</p></div>}</div></Section>

    {selectedReport&&<Section title="Selected weekly report" description={`${data.users.find((item)=>item.id===selectedReport.userId)?.name??"Employee"} · ${formatDate(selectedReport.weekStart,{month:"short",day:"numeric"})} to ${formatDate(selectedReport.weekEnd,{month:"short",day:"numeric"})}`}><div className="accounting-rule-list">{selectedReport.goals.map((line,index)=><article key={index}><span><Target size={17}/></span><div><strong>Goal {index+1}: {line.goal}</strong><p><b>Actual:</b> {line.actual}</p><p><b>Notes:</b> {line.notes||"No notes entered."}</p></div></article>)}<article><span><FileText size={17}/></span><div><strong>Weekly summary</strong><p>{selectedReport.summary}</p></div></article><article><span><Send size={17}/></span><div><strong>Next week&apos;s goals</strong>{selectedReport.nextWeekGoals.map((goal,index)=><p key={index}>{index+1}. {goal}</p>)}</div></article></div>{selectedReport.reviewerNotes&&<div className="report-integrity-banner"><ShieldCheck size={18}/><div><strong>Review note</strong><p>{selectedReport.reviewerNotes}</p></div></div>}{selectedReport.userId!==currentUser.id&&["Administrator","Sales Manager"].includes(currentUser.role)&&canViewPerformanceRecord(currentUser,selectedReport.userId,data)&&selectedReport.status!=="Reviewed"&&<div className="form-grid"><Field label="Review note" className="field--full"><textarea rows={3} value={reviewNote} onChange={(event)=>setReviewNote(event.target.value)} placeholder="Recognition, coaching, blocker, or follow-up"/></Field><div className="field--full"><Button onClick={doReview} disabled={busy}>Mark reviewed</Button></div></div>}</Section>}
  </>;
}
