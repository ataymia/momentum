"use client";

import { ReactNode, createContext, useContext, useEffect, useState } from "react";
import { DailyWorkReport, ManagerWeeklyReport, PERFORMANCE_STORAGE_KEY, PerformanceGoal, PerformanceState, WorkReport, ReportNote, canViewPerformanceRecord, createPerformanceSeed, managerWeeklyMetrics, normalizePerformanceState, userCommercialMetrics } from "./performance-engine";
import { useWorkspace } from "./workspace-context";

const now=()=>new Date().toISOString();
const uid=(prefix:string)=>`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;

type NewGoal=Omit<PerformanceGoal,"id"|"createdAt"|"updatedAt">;
type NewDailyReport=Omit<DailyWorkReport,"id"|"submittedAt"|"status"|"reviewerId"|"reviewedAt"|"reviewerNotes">;
type NewManagerReport=Omit<ManagerWeeklyReport,"id"|"submittedAt"|"status"|"reviewerId"|"reviewedAt"|"reviewerNotes">;
type NewReport=NewDailyReport|NewManagerReport;
type PerformanceContextValue={
  performance:PerformanceState; createGoal:(goal:NewGoal)=>string|null; updateManualGoal:(goalId:string,value:number,note?:string)=>boolean; cancelGoal:(goalId:string)=>boolean;
  submitReport:(report:NewReport)=>string|null; reviewReport:(reportId:string,note:string)=>boolean; addReportNote:(reportId:string,note:string)=>boolean; resetPerformance:()=>boolean;
};
const PerformanceContext=createContext<PerformanceContextValue|null>(null);

const readState=()=>{if(typeof window==="undefined")return createPerformanceSeed();try{return normalizePerformanceState(JSON.parse(window.localStorage.getItem(PERFORMANCE_STORAGE_KEY)??"null"));}catch{return createPerformanceSeed();}};

export function PerformanceProvider({children}:{children:ReactNode}){
  const {currentUser,data}=useWorkspace();const[performance,setPerformance]=useState<PerformanceState>(()=>readState());
  useEffect(()=>{if(typeof window!=="undefined")window.localStorage.setItem(PERFORMANCE_STORAGE_KEY,JSON.stringify(performance));},[performance]);
  const createGoal=(goal:NewGoal)=>{if(!currentUser||goal.userId!==currentUser.id||!Number.isFinite(goal.target)||goal.target<0||goal.periodEnd<goal.periodStart)return null;const id=uid("goal");setPerformance((state)=>({...state,goals:[{...goal,id,createdAt:now(),updatedAt:now()},...state.goals]}));return id;};
  const updateManualGoal=(goalId:string,value:number,note?:string)=>{if(!currentUser||!Number.isFinite(value))return false;const goal=performance.goals.find((item)=>item.id===goalId);if(!goal||goal.userId!==currentUser.id||goal.metric!=="Manual"||goal.status==="Cancelled")return false;setPerformance((state)=>({...state,goals:state.goals.map((item)=>item.id===goalId?{...item,manualValue:Math.max(0,value),note:note??item.note,updatedAt:now()}:item)}));return true;};
  const cancelGoal=(goalId:string)=>{if(!currentUser)return false;const goal=performance.goals.find((item)=>item.id===goalId);if(!goal||goal.userId!==currentUser.id)return false;setPerformance((state)=>({...state,goals:state.goals.map((item)=>item.id===goalId?{...item,status:"Cancelled",updatedAt:now()}:item)}));return true;};
  const submitReport=(report:NewReport)=>{
    if(!currentUser||report.userId!==currentUser.id||!report.summary.trim())return null;
    if(report.type==="Manager weekly"&&!(["Sales Manager","Administrator"].includes(currentUser.role)))return null;
    if(report.type==="Daily"&&!report.workDate)return null;
    if(report.type==="Manager weekly"&&(!report.weekStart||!report.weekEnd||report.weekEnd<report.weekStart))return null;
    const duplicate=performance.reports.some((existing)=>existing.userId===currentUser.id&&(report.type==="Daily"?existing.type==="Daily"&&existing.workDate===report.workDate:existing.type==="Manager weekly"&&existing.weekStart===report.weekStart&&existing.weekEnd===report.weekEnd));
    if(duplicate)return null;
    const sourceMetrics=report.type==="Daily"?userCommercialMetrics(data,currentUser.id,report.workDate,report.workDate):managerWeeklyMetrics(performance,data,currentUser.id,report.weekStart,report.weekEnd);
    const normalized:NewReport=report.type==="Daily"
      ? {...report,summary:report.summary.trim(),wins:report.wins.trim(),challenges:report.challenges.trim(),reflection:report.reflection.trim(),nextPriorities:report.nextPriorities.trim(),appointmentNotes:report.appointmentNotes.trim(),...sourceMetrics}
      : {...report,summary:report.summary.trim(),teamWins:report.teamWins.trim(),coachingNeeds:report.coachingNeeds.trim(),risks:report.risks.trim(),escalations:report.escalations.trim(),nextWeekPriorities:report.nextWeekPriorities.trim(),...sourceMetrics};
    const id=uid("report");setPerformance((state)=>({...state,reports:[{...normalized,id,submittedAt:now(),status:"Submitted"} as WorkReport,...state.reports]}));return id;
  };
  const reviewReport=(reportId:string,note:string)=>{if(!currentUser||!["Sales Manager","Administrator"].includes(currentUser.role))return false;const report=performance.reports.find((item)=>item.id===reportId);if(!report||report.userId===currentUser.id||!canViewPerformanceRecord(currentUser,report.userId,data))return false;setPerformance((state)=>({...state,reports:state.reports.map((item)=>item.id===reportId?{...item,status:"Reviewed",reviewerId:currentUser.id,reviewedAt:now(),reviewerNotes:note.trim()||undefined}:item)}));return true;};
  const addReportNote=(reportId:string,note:string)=>{if(!currentUser||!["Sales Manager","Administrator"].includes(currentUser.role)||!note.trim())return false;const report=performance.reports.find((item)=>item.id===reportId);if(!report||report.userId===currentUser.id||!canViewPerformanceRecord(currentUser,report.userId,data))return false;const record:ReportNote={id:uid("report-note"),reportId,authorId:currentUser.id,note:note.trim(),createdAt:now()};setPerformance((state)=>({...state,notes:[record,...state.notes]}));return true;};
  const resetPerformance=()=>{if(currentUser?.role!=="Administrator")return false;setPerformance(createPerformanceSeed());return true;};
  const value:PerformanceContextValue={performance,createGoal,updateManualGoal,cancelGoal,submitReport,reviewReport,addReportNote,resetPerformance};
  return <PerformanceContext.Provider value={value}>{children}</PerformanceContext.Provider>;
}

export function usePerformance(){const value=useContext(PerformanceContext);if(!value)throw new Error("usePerformance must be used inside PerformanceProvider");return value;}
