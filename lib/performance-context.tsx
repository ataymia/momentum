"use client";

import { ReactNode, createContext, useContext, useRef, useState } from "react";
import { DailyWorkReport, ManagerWeeklyReport, PERFORMANCE_STORAGE_KEY, PerformanceGoal, PerformanceState, WeeklyGoalResult, WeeklyProgressDraft, WeeklyProgressReport, WorkReport, ReportNote, canViewPerformanceRecord, createPerformanceSeed, managerWeeklyMetrics, normalizePerformanceState, userCommercialMetrics, weeklyCarryForwardGoals, weeklyProgressDraftFor, weeklyProgressReportFor, weeklyReportingPeriod } from "./performance-engine";
import { momentumStorage, useRemoteStorageSync } from "./persistence";
import { useRuntimeMode } from "./runtime-mode";
import { useWorkspace } from "./workspace-context";

const now=()=>new Date().toISOString();
const uid=(prefix:string)=>`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;

type NewGoal=Omit<PerformanceGoal,"id"|"createdAt"|"updatedAt">;
type NewDailyReport=Omit<DailyWorkReport,"id"|"submittedAt"|"status"|"reviewerId"|"reviewedAt"|"reviewerNotes">;
type NewManagerReport=Omit<ManagerWeeklyReport,"id"|"submittedAt"|"status"|"reviewerId"|"reviewedAt"|"reviewerNotes">;
type NewReport=NewDailyReport|NewManagerReport;
type WeeklyDraftPatch={goals:WeeklyGoalResult[];summary:string;nextWeekGoals:string[]};
type PerformanceContextValue={
  performance:PerformanceState; createGoal:(goal:NewGoal)=>string|null; updateManualGoal:(goalId:string,value:number,note?:string)=>boolean; cancelGoal:(goalId:string)=>boolean;
  submitReport:(report:NewReport)=>string|null; ensureWeeklyDraft:(weekStart:string)=>string|null; saveWeeklyDraft:(draftId:string,patch:WeeklyDraftPatch)=>boolean; submitWeeklyProgress:(draftId:string)=>string|null;
  reviewReport:(reportId:string,note:string)=>boolean; addReportNote:(reportId:string,note:string)=>boolean; resetPerformance:()=>boolean;
};
const PerformanceContext=createContext<PerformanceContextValue|null>(null);

const readState=()=>{if(typeof window==="undefined")return createPerformanceSeed();try{return normalizePerformanceState(JSON.parse(momentumStorage.getItem(PERFORMANCE_STORAGE_KEY)??"null"));}catch{return createPerformanceSeed();}};
const cleanGoalLines=(goals:WeeklyGoalResult[])=>goals.slice(0,3).map((line)=>({goal:line.goal.trim()||"N/A",actual:line.actual.trim(),notes:line.notes.trim()}));
const cleanNextGoals=(goals:string[])=>goals.slice(0,3).map((goal)=>goal.trim());

export function PerformanceProvider({children}:{children:ReactNode}){
  const {currentUser,data}=useWorkspace();const runtime=useRuntimeMode();const[performance,setPerformance]=useState<PerformanceState>(()=>readState());const stateRef=useRef(performance);
  const commit=(updater:(state:PerformanceState)=>PerformanceState)=>{const current=stateRef.current;const next=updater(current);if(next===current)return current;stateRef.current=next;momentumStorage.setItem(PERFORMANCE_STORAGE_KEY,JSON.stringify(next));setPerformance(next);void momentumStorage.flush();return next;};
  useRemoteStorageSync(PERFORMANCE_STORAGE_KEY,()=>{const next=readState();stateRef.current=next;setPerformance(next);});
  const createGoal=(goal:NewGoal)=>{if(!currentUser||goal.userId!==currentUser.id||!Number.isFinite(goal.target)||goal.target<0||goal.periodEnd<goal.periodStart)return null;const id=uid("goal");commit((state)=>({...state,goals:[{...goal,id,createdAt:now(),updatedAt:now()},...state.goals]}));return id;};
  const updateManualGoal=(goalId:string,value:number,note?:string)=>{if(!currentUser||!Number.isFinite(value))return false;const goal=stateRef.current.goals.find((item)=>item.id===goalId);if(!goal||goal.userId!==currentUser.id||goal.metric!=="Manual"||goal.status==="Cancelled")return false;commit((state)=>({...state,goals:state.goals.map((item)=>item.id===goalId?{...item,manualValue:Math.max(0,value),note:note??item.note,updatedAt:now()}:item)}));return true;};
  const cancelGoal=(goalId:string)=>{if(!currentUser)return false;const goal=stateRef.current.goals.find((item)=>item.id===goalId);if(!goal||goal.userId!==currentUser.id)return false;commit((state)=>({...state,goals:state.goals.map((item)=>item.id===goalId?{...item,status:"Cancelled",updatedAt:now()}:item)}));return true;};
  const submitReport=(report:NewReport)=>{
    if(!currentUser||report.userId!==currentUser.id||!report.summary.trim())return null;
    if(report.type==="Manager weekly"&&!(["Sales Manager","Administrator"].includes(currentUser.role)))return null;
    if(report.type==="Daily"&&!report.workDate)return null;
    if(report.type==="Manager weekly"&&(!report.weekStart||!report.weekEnd||report.weekEnd<report.weekStart))return null;
    const current=stateRef.current;const duplicate=current.reports.some((existing)=>existing.userId===currentUser.id&&(report.type==="Daily"?existing.type==="Daily"&&existing.workDate===report.workDate:existing.type==="Manager weekly"&&existing.weekStart===report.weekStart&&existing.weekEnd===report.weekEnd));
    if(duplicate)return null;
    const sourceMetrics=report.type==="Daily"?userCommercialMetrics(data,currentUser.id,report.workDate,report.workDate):managerWeeklyMetrics(current,data,currentUser.id,report.weekStart,report.weekEnd);
    const normalized:NewReport=report.type==="Daily"
      ? {...report,summary:report.summary.trim(),wins:report.wins.trim(),challenges:report.challenges.trim(),reflection:report.reflection.trim(),nextPriorities:report.nextPriorities.trim(),appointmentNotes:report.appointmentNotes.trim(),...sourceMetrics}
      : {...report,summary:report.summary.trim(),teamWins:report.teamWins.trim(),coachingNeeds:report.coachingNeeds.trim(),risks:report.risks.trim(),escalations:report.escalations.trim(),nextWeekPriorities:report.nextWeekPriorities.trim(),...sourceMetrics};
    const id=uid("report");commit((state)=>({...state,reports:[{...normalized,id,submittedAt:now(),status:"Submitted"} as WorkReport,...state.reports]}));return id;
  };
  const ensureWeeklyDraft=(weekStart:string)=>{
    if(!currentUser||currentUser.role==="Customer")return null;const current=stateRef.current;if(weeklyProgressReportFor(current,currentUser.id,weekStart))return null;
    const existing=weeklyProgressDraftFor(current,currentUser.id,weekStart);if(existing)return existing.id;
    const period=weeklyReportingPeriod(weekStart);const carried=weeklyCarryForwardGoals(current,currentUser.id,weekStart);const stamp=now();const id=uid("weekly-draft");
    const draft:WeeklyProgressDraft={id,userId:currentUser.id,...period,createdAt:stamp,updatedAt:stamp,goals:carried.map((goal)=>({goal,actual:goal==="N/A"?"N/A":"",notes:""})),summary:"",nextWeekGoals:["","",""]};
    commit((state)=>({...state,weeklyDrafts:[draft,...state.weeklyDrafts]}));return id;
  };
  const saveWeeklyDraft=(draftId:string,patch:WeeklyDraftPatch)=>{
    if(!currentUser||patch.goals.length!==3||patch.nextWeekGoals.length!==3)return false;const draft=stateRef.current.weeklyDrafts.find((item)=>item.id===draftId);if(!draft||draft.userId!==currentUser.id)return false;
    const goals=cleanGoalLines(patch.goals);const nextWeekGoals=cleanNextGoals(patch.nextWeekGoals);commit((state)=>({...state,weeklyDrafts:state.weeklyDrafts.map((item)=>item.id===draftId?{...item,goals,summary:patch.summary, nextWeekGoals,updatedAt:now()}:item)}));return true;
  };
  const submitWeeklyProgress=(draftId:string)=>{
    if(!currentUser)return null;const draft=stateRef.current.weeklyDrafts.find((item)=>item.id===draftId);if(!draft||draft.userId!==currentUser.id||weeklyProgressReportFor(stateRef.current,currentUser.id,draft.weekStart))return null;
    const goals=cleanGoalLines(draft.goals);const nextWeekGoals=cleanNextGoals(draft.nextWeekGoals);if(!draft.summary.trim()||goals.length!==3||goals.some((line)=>!line.goal||!line.actual)||nextWeekGoals.length!==3||nextWeekGoals.some((goal)=>!goal))return null;
    const id=uid("weekly-report");const report:WeeklyProgressReport={id,type:"Weekly progress",userId:currentUser.id,weekStart:draft.weekStart,weekEnd:draft.weekEnd,dueDate:draft.dueDate,submittedAt:now(),status:"Submitted",goals,summary:draft.summary.trim(),nextWeekGoals};
    commit((state)=>({...state,reports:[report,...state.reports],weeklyDrafts:state.weeklyDrafts.filter((item)=>item.id!==draftId)}));return id;
  };
  const reviewReport=(reportId:string,note:string)=>{if(!currentUser||!["Sales Manager","Administrator"].includes(currentUser.role))return false;const report=stateRef.current.reports.find((item)=>item.id===reportId);if(!report||report.userId===currentUser.id||!canViewPerformanceRecord(currentUser,report.userId,data))return false;commit((state)=>({...state,reports:state.reports.map((item)=>item.id===reportId?{...item,status:"Reviewed",reviewerId:currentUser.id,reviewedAt:now(),reviewerNotes:note.trim()||undefined}:item)}));return true;};
  const addReportNote=(reportId:string,note:string)=>{if(!currentUser||!["Sales Manager","Administrator"].includes(currentUser.role)||!note.trim())return false;const report=stateRef.current.reports.find((item)=>item.id===reportId);if(!report||report.userId===currentUser.id||!canViewPerformanceRecord(currentUser,report.userId,data))return false;const record:ReportNote={id:uid("report-note"),reportId,authorId:currentUser.id,note:note.trim(),createdAt:now()};commit((state)=>({...state,notes:[record,...state.notes]}));return true;};
  const resetPerformance=()=>{if(!runtime.isDemo||currentUser?.role!=="Administrator")return false;commit(()=>createPerformanceSeed());return true;};
  const value:PerformanceContextValue={performance,createGoal,updateManualGoal,cancelGoal,submitReport,ensureWeeklyDraft,saveWeeklyDraft,submitWeeklyProgress,reviewReport,addReportNote,resetPerformance};
  return <PerformanceContext.Provider value={value}>{children}</PerformanceContext.Provider>;
}

export function usePerformance(){const value=useContext(PerformanceContext);if(!value)throw new Error("usePerformance must be used inside PerformanceProvider");return value;}
