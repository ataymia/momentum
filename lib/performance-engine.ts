import { evaluateSalesRepAccountBonuses } from "./bonus-engine";
import type { WorkspaceData, WorkspaceUser } from "./types";

export const PERFORMANCE_STORAGE_KEY = "momentum-performance-v1";

export type GoalPeriod = "Weekly" | "Monthly" | "Quarterly";
export type GoalMetric = "Paid cases" | "Completed appointments" | "Paid orders" | "New paid accounts" | "Collected revenue" | "Manual";
export type GoalStatus = "Active" | "Achieved" | "Missed" | "Cancelled";
export type PerformanceGoal = {
  id:string; userId:string; period:GoalPeriod; title:string; metric:GoalMetric; target:number; unit:string;
  periodStart:string; periodEnd:string; manualValue:number; status:GoalStatus; createdBy:string; createdAt:string;
  updatedAt:string; note?:string;
};

export type DailyWorkReport = {
  id:string; type:"Daily"; userId:string; workDate:string; submittedAt:string; status:"Submitted"|"Reviewed";
  summary:string; wins:string; challenges:string; reflection:string; nextPriorities:string;
  appointmentNotes:string; completedAppointments:number; paidCases:number; paidOrders:number; newPaidAccounts:number; collectedRevenue:number;
  sourceAppointmentIds:string[]; sourceOrderIds:string[]; reviewerId?:string; reviewedAt?:string; reviewerNotes?:string;
};

export type ManagerWeeklyReport = {
  id:string; type:"Manager weekly"; userId:string; weekStart:string; weekEnd:string; submittedAt:string; status:"Submitted"|"Reviewed";
  summary:string; teamWins:string; coachingNeeds:string; risks:string; escalations:string; nextWeekPriorities:string;
  completedAppointments:number; paidCases:number; paidOrders:number; newPaidAccounts:number; collectedRevenue:number;
  repReportsExpected:number; repReportsSubmitted:number; sourceUserIds:string[]; sourceAppointmentIds:string[]; sourceOrderIds:string[];
  reviewerId?:string; reviewedAt?:string; reviewerNotes?:string;
};

export type WorkReport = DailyWorkReport | ManagerWeeklyReport;
export type ReportNote = { id:string; reportId:string; authorId:string; note:string; createdAt:string };
export type PerformanceState = { version:1; goals:PerformanceGoal[]; reports:WorkReport[]; notes:ReportNote[] };

const today=()=>new Date().toISOString().slice(0,10);
const asDate=(value:string)=>new Date(`${value}T12:00:00`);
const dateKey=(date:Date)=>date.toISOString().slice(0,10);
const orderDate=(order:WorkspaceData["orders"][number])=>(order.paidAt??order.placedAt).slice(0,10);
const inRange=(value:string,start:string,end:string)=>value>=start&&value<=end;

export function createPerformanceSeed():PerformanceState{return{version:1,goals:[],reports:[],notes:[]};}
export function normalizePerformanceState(input:unknown):PerformanceState{
  const seed=createPerformanceSeed();if(!input||typeof input!=="object")return seed;const state=input as Partial<PerformanceState>;
  return{version:1,goals:Array.isArray(state.goals)?state.goals:[],reports:Array.isArray(state.reports)?state.reports:[],notes:Array.isArray(state.notes)?state.notes:[]};
}

export function periodRange(period:GoalPeriod,anchor=today()){
  const d=asDate(anchor);
  if(period==="Weekly"){
    const mondayDistance=(d.getDay()+6)%7;const start=new Date(d);start.setDate(d.getDate()-mondayDistance);const end=new Date(start);end.setDate(start.getDate()+6);
    return{start:dateKey(start),end:dateKey(end)};
  }
  if(period==="Monthly")return{start:`${anchor.slice(0,7)}-01`,end:dateKey(new Date(d.getFullYear(),d.getMonth()+1,0,12))};
  const quarter=Math.floor(d.getMonth()/3);const start=new Date(d.getFullYear(),quarter*3,1,12);const end=new Date(d.getFullYear(),quarter*3+3,0,12);
  return{start:dateKey(start),end:dateKey(end)};
}

export function weekRange(anchor=today()){return periodRange("Weekly",anchor);}

export function userCommercialMetrics(data:WorkspaceData,userId:string,start:string,end:string){
  const ownedOrders=data.orders.filter((order)=>order.ownerId===userId&&inRange(orderDate(order),start,end));
  const paidOrders=ownedOrders.filter((order)=>order.paymentStatus==="Paid");
  const paidCases=paidOrders.reduce((sum,order)=>sum+order.cases,0);
  const collectedRevenue=paidOrders.reduce((sum,order)=>sum+order.amount,0);
  const appointments=data.appointments.filter((appointment)=>appointment.ownerId===userId&&appointment.status==="Completed"&&inRange(appointment.date,start,end));
  const accountFirstPaid=new Map<string,string>();
  for(const order of data.orders.filter((item)=>item.paymentStatus==="Paid").sort((a,b)=>orderDate(a).localeCompare(orderDate(b)))) if(!accountFirstPaid.has(order.accountId))accountFirstPaid.set(order.accountId,orderDate(order));
  const ownedAccountIds=new Set(data.accounts.filter((account)=>account.ownerId===userId).map((account)=>account.id));
  const ownedNewPaidAccounts=[...accountFirstPaid.entries()].filter(([accountId,date])=>ownedAccountIds.has(accountId)&&inRange(date,start,end)).length;
  return{paidCases,paidOrders:paidOrders.length,collectedRevenue,completedAppointments:appointments.length,newPaidAccounts:ownedNewPaidAccounts,
    sourceOrderIds:paidOrders.map((order)=>order.id),sourceAppointmentIds:appointments.map((appointment)=>appointment.id)};
}

export function goalProgress(goal:PerformanceGoal,data:WorkspaceData){
  if(goal.metric==="Manual")return Math.max(0,goal.manualValue);
  const metrics=userCommercialMetrics(data,goal.userId,goal.periodStart,goal.periodEnd);
  if(goal.metric==="Paid cases")return metrics.paidCases;
  if(goal.metric==="Completed appointments")return metrics.completedAppointments;
  if(goal.metric==="Paid orders")return metrics.paidOrders;
  if(goal.metric==="New paid accounts")return metrics.newPaidAccounts;
  return metrics.collectedRevenue;
}

export function resolvedGoalStatus(goal:PerformanceGoal,data:WorkspaceData,asOf=today()):GoalStatus{
  if(goal.status==="Cancelled")return"Cancelled";const progress=goalProgress(goal,data);if(progress>=goal.target)return"Achieved";if(asOf>goal.periodEnd)return"Missed";return"Active";
}

export function canViewPerformanceRecord(actor:WorkspaceUser|null|undefined,targetUserId:string,data:WorkspaceData){
  if(!actor)return false;if(actor.role==="Administrator")return true;if(actor.id===targetUserId)return true;
  if(actor.role!=="Sales Manager")return false;const target=data.users.find((user)=>user.id===targetUserId);
  return target?.managerId===actor.id||target?.team===actor.team;
}

export function reportVisibleTo(actor:WorkspaceUser|null|undefined,report:WorkReport,data:WorkspaceData){
  if(!actor)return false;if(actor.role==="Administrator")return true;if(report.userId===actor.id)return true;
  if(actor.role!=="Sales Manager")return false;if(report.type==="Manager weekly")return false;
  return canViewPerformanceRecord(actor,report.userId,data);
}

export function workedOnDate(data:WorkspaceData,userId:string,date:string){
  return data.timeEntries.some((entry)=>entry.userId===userId&&entry.date===date)||data.appointments.some((item)=>item.ownerId===userId&&item.date===date)||data.orders.some((order)=>order.ownerId===userId&&order.placedAt.slice(0,10)===date);
}

export function expectedDailyReportDates(data:WorkspaceData,userId:string,start:string,end:string){
  const dates=new Set<string>();
  data.timeEntries.filter((entry)=>entry.userId===userId&&inRange(entry.date,start,end)).forEach((entry)=>dates.add(entry.date));
  data.appointments.filter((item)=>item.ownerId===userId&&inRange(item.date,start,end)).forEach((item)=>dates.add(item.date));
  data.orders.filter((order)=>order.ownerId===userId&&inRange(order.placedAt.slice(0,10),start,end)).forEach((order)=>dates.add(order.placedAt.slice(0,10)));
  return[...dates].sort();
}

export function managerWeeklyMetrics(state:PerformanceState,data:WorkspaceData,managerId:string,start:string,end:string){
  const manager=data.users.find((user)=>user.id===managerId);const teamUsers=data.users.filter((user)=>user.role!=="Customer"&&user.id!==managerId&&(user.managerId===managerId||(manager?.role==="Administrator"&&user.team!=="Customer")));
  const sourceUserIds=teamUsers.map((user)=>user.id);const totals=sourceUserIds.map((userId)=>userCommercialMetrics(data,userId,start,end));
  const expected=sourceUserIds.reduce((sum,userId)=>sum+expectedDailyReportDates(data,userId,start,end).length,0);
  const submitted=state.reports.filter((report)=>report.type==="Daily"&&sourceUserIds.includes(report.userId)&&inRange(report.workDate,start,end)).length;
  return{completedAppointments:totals.reduce((s,m)=>s+m.completedAppointments,0),paidCases:totals.reduce((s,m)=>s+m.paidCases,0),paidOrders:totals.reduce((s,m)=>s+m.paidOrders,0),newPaidAccounts:totals.reduce((s,m)=>s+m.newPaidAccounts,0),collectedRevenue:totals.reduce((s,m)=>s+m.collectedRevenue,0),repReportsExpected:expected,repReportsSubmitted:submitted,sourceUserIds,sourceAppointmentIds:totals.flatMap((m)=>m.sourceAppointmentIds),sourceOrderIds:totals.flatMap((m)=>m.sourceOrderIds)};
}

function bonusEarnedAt(data:WorkspaceData,signal:ReturnType<typeof evaluateSalesRepAccountBonuses>[number]){
  if(signal.status!=="Earned")return undefined;
  const evidence=data.orders.filter((order)=>signal.evidenceOrderIds.includes(order.id)&&order.paymentStatus==="Paid").sort((a,b)=>orderDate(a).localeCompare(orderDate(b)));
  if(signal.milestone==="Opening order")return evidence[0]?orderDate(evidence[0]):undefined;
  let total=0;for(const order of evidence){total+=order.cases;if(total>=signal.thresholdCases)return orderDate(order);}return undefined;
}

export function monthlyBonusTracker(data:WorkspaceData,userId:string,anchor=today()){
  const range=periodRange("Monthly",anchor);const signals=evaluateSalesRepAccountBonuses(data).filter((signal)=>signal.repId===userId);
  const earned=signals.map((signal)=>({signal,earnedAt:bonusEarnedAt(data,signal)})).filter((item)=>item.earnedAt&&inRange(item.earnedAt,range.start,range.end));
  const pending=signals.filter((signal)=>["Tracking","Awaiting payment"].includes(signal.status));
  return{...range,earnedAmount:earned.reduce((sum,item)=>sum+item.signal.amount,0),earned,pending,potentialAmount:pending.reduce((sum,item)=>sum+item.amount,0)};
}
