"use client";

import { ReactNode, createContext, useContext, useEffect, useState } from "react";
import { DailyWorkReport, ManagerWeeklyReport, PERFORMANCE_STORAGE_KEY, PerformanceGoal, PerformanceState, WorkReport, ReportNote, createPerformanceSeed, normalizePerformanceState } from "./performance-engine";
import { useWorkspace } from "./workspace-context";

const now=()=>new Date().toISOString();
const uid=(prefix:string)=>`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;

type NewGoal=Omit<PerformanceGoal,"id"|"createdAt"|"updatedAt">;
type NewDailyReport=Omit<DailyWorkReport,"id"|"submittedAt"|"status"|"reviewerId"|"reviewedAt"|"reviewerNotes">;
type NewManagerReport=Omit<ManagerWeeklyReport,"id"|"submittedAt"|"status"|"reviewerId"|"reviewedAt"|"reviewerNotes">;
type NewReport=NewDailyReport|NewManagerReport;
type PerformanceContextValue={
  performance:PerformanceState; createGoal:(goal:NewGoal)=>string; updateManualGoal:(goalId:string,value:number,note?:string)=>void; cancelGoal:(goalId:string)=>void;
  submitReport:(report:NewReport)=>string; reviewReport:(reportId:string,note:string)=>void; addReportNote:(reportId:string,note:string)=>void; resetPerformance:()=>void;
};
const PerformanceContext=createContext<PerformanceContextValue|null>(null);

const readState=()=>{if(typeof window==="undefined")return createPerformanceSeed();try{return normalizePerformanceState(JSON.parse(window.localStorage.getItem(PERFORMANCE_STORAGE_KEY)??"null"));}catch{return createPerformanceSeed();}};

export function PerformanceProvider({children}:{children:ReactNode}){
  const {currentUser}=useWorkspace();const[performance,setPerformance]=useState<PerformanceState>(()=>readState());
  useEffect(()=>{if(typeof window!=="undefined")window.localStorage.setItem(PERFORMANCE_STORAGE_KEY,JSON.stringify(performance));},[performance]);
  const createGoal=(goal:NewGoal)=>{const id=uid("goal");setPerformance((state)=>({...state,goals:[{...goal,id,createdAt:now(),updatedAt:now()},...state.goals]}));return id;};
  const updateManualGoal=(goalId:string,value:number,note?:string)=>setPerformance((state)=>({...state,goals:state.goals.map((goal)=>goal.id===goalId?{...goal,manualValue:Math.max(0,value),note:note??goal.note,updatedAt:now()}:goal)}));
  const cancelGoal=(goalId:string)=>setPerformance((state)=>({...state,goals:state.goals.map((goal)=>goal.id===goalId?{...goal,status:"Cancelled",updatedAt:now()}:goal)}));
  const submitReport=(report:NewReport)=>{const id=uid("report");setPerformance((state)=>({...state,reports:[{...report,id,submittedAt:now(),status:"Submitted"} as WorkReport,...state.reports]}));return id;};
  const reviewReport=(reportId:string,note:string)=>{if(!currentUser)return;setPerformance((state)=>({...state,reports:state.reports.map((report)=>report.id===reportId?{...report,status:"Reviewed",reviewerId:currentUser.id,reviewedAt:now(),reviewerNotes:note.trim()||undefined}:report)}));};
  const addReportNote=(reportId:string,note:string)=>{if(!currentUser||!note.trim())return;const record:ReportNote={id:uid("report-note"),reportId,authorId:currentUser.id,note:note.trim(),createdAt:now()};setPerformance((state)=>({...state,notes:[record,...state.notes]}));};
  const resetPerformance=()=>setPerformance(createPerformanceSeed());
  const value:PerformanceContextValue={performance,createGoal,updateManualGoal,cancelGoal,submitReport,reviewReport,addReportNote,resetPerformance};
  return <PerformanceContext.Provider value={value}>{children}</PerformanceContext.Provider>;
}

export function usePerformance(){const value=useContext(PerformanceContext);if(!value)throw new Error("usePerformance must be used inside PerformanceProvider");return value;}
