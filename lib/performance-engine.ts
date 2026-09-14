import { canManageUser } from "./access";
import { evaluateSalesRepAccountBonuses } from "./bonus-engine";
import { arizonaDateKey, endOfLocalWeek, isValidCalendarDateKey, startOfLocalWeek } from "./date-time";
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

const today=()=>arizonaDateKey();
const orderDate=(order:WorkspaceData["orders"][number])=>(order.paidAt??order.placedAt).slice(0,10);
const orderCreditUser=(order:WorkspaceData["orders"][number])=>order.creditedRepId??order.ownerId;
const inRange=(value:string,start:string,end:string)=>value>=start&&value<=end;
const monthEnd=(year:number,monthOneBased:number)=>String(new Date(Date.UTC(year,monthOneBased,0)).getUTCDate()).padStart(2,"0");
const validInstant=(value?:string)=>Boolean(value&&!Number.isNaN(new Date(value).getTime()));
const finiteNonNegative=(value:number)=>Number.isFinite(value)&&value>=0;
const goalPeriods=new Set<GoalPeriod>(["Weekly","Monthly","Quarterly"]);
const goalMetrics=new Set<GoalMetric>(["Paid cases","Completed appointments","Paid orders","New paid accounts","Collected revenue","Manual"]);
const goalStatuses=new Set<GoalStatus>(["Active","Achieved","Missed","Cancelled"]);
const reportStatuses=new Set<WorkReport["status"]>(["Submitted","Reviewed"]);
const uniqueById=<T extends {id:string}>(records:T[])=>{const seen=new Set<string>();return records.filter((record)=>Boolean(record?.id)&&!seen.has(record.id)&&(seen.add(record.id),true));};
const reportMetricsValid=(report:WorkReport)=>[report.completedAppointments,report.paidCases,report.paidOrders,report.newPaidAccounts,report.collectedRevenue].every(finiteNonNegative);

export function createPerformanceSeed():PerformanceState{return{version:1,goals:[],reports:[],notes:[]};}
export function normalizePerformanceState(input:unknown):PerformanceState{
  const seed=createPerformanceSeed();if(!input||typeof input!=="object")return seed;const state=input as Partial<PerformanceState>;
  const goals=uniqueById((Array.isArray(state.goals)?state.goals:[]).filter((goal):goal is PerformanceGoal=>Boolean(goal?.id&&goal.userId&&goalPeriods.has(goal.period)&&goal.title?.trim()&&goalMetrics.has(goal.metric)&&finiteNonNegative(goal.target)&&finiteNonNegative(goal.manualValue)&&goal.unit?.trim()&&goalStatuses.has(goal.status)&&isValidCalendarDateKey(goal.periodStart)&&isValidCalendarDateKey(goal.periodEnd)&&goal.periodEnd>=goal.periodStart&&goal.createdBy&&validInstant(goal.createdAt)&&validInstant(goal.updatedAt))));
  const reports=uniqueById((Array.isArray(state.reports)?state.reports:[]).filter((report):report is WorkReport=>{
    if(!report?.id||!report.userId||!report.summary?.trim()||!validInstant(report.submittedAt)||!reportStatuses.has(report.status)||!reportMetricsValid(report)||!Array.isArray(report.sourceAppointmentIds)||!Array.isArray(report.sourceOrderIds)||new Set(report.sourceAppointmentIds).size!==report.sourceAppointmentIds.length||new Set(report.sourceOrderIds).size!==report.sourceOrderIds.length)return false;
    if(report.status==="Reviewed"&&(!report.reviewerId||!report.reviewedAt||!validInstant(report.reviewedAt)))return false;
    if(report.type==="Daily")return isValidCalendarDateKey(report.workDate);
    if(report.type==="Manager weekly")return Boolean(isValidCalendarDateKey(report.weekStart)&&isValidCalendarDateKey(report.weekEnd)&&report.weekEnd>=report.weekStart&&finiteNonNegative(report.repReportsExpected)&&finiteNonNegative(report.repReportsSubmitted)&&Array.isArray(report.sourceUserIds)&&new Set(report.sourceUserIds).size===report.sourceUserIds.length);
    return false;
  }));
  const reportIds=new Set(reports.map((report)=>report.id));
  const notes=uniqueById((Array.isArray(state.notes)?state.notes:[]).filter((note):note is ReportNote=>Boolean(note?.id&&reportIds.has(note.reportId)&&note.authorId&&note.note?.trim()&&validInstant(note.createdAt))));
  return{version:1,goals,reports,notes};
}

export function periodRange(period:GoalPeriod,anchor=today()){
  const safeAnchor=isValidCalendarDateKey(anchor)?anchor:today();
  if(period==="Weekly")return{start:startOfLocalWeek(safeAnchor),end:endOfLocalWeek(safeAnchor)};
  const year=Number(safeAnchor.slice(0,4));const month=Number(safeAnchor.slice(5,7));
  if(period==="Monthly")return{start:`${safeAnchor.slice(0,7)}-01`,end:`${safeAnchor.slice(0,7)}-${monthEnd(year,month)}`};
  const quarterStartMonth=Math.floor((month-1)/3)*3+1;const quarterEndMonth=quarterStartMonth+2;
  return{start:`${year}-${String(quarterStartMonth).padStart(2,"0")}-01`,end:`${year}-${String(quarterEndMonth).padStart(2,"0")}-${monthEnd(year,quarterEndMonth)}`};
}

export function weekRange(anchor=today()){return periodRange("Weekly",anchor);}

export function userCommercialMetrics(data:WorkspaceData,userId:string,start:string,end:string){
  const creditedOrders=data.orders.filter((order)=>orderCreditUser(order)===userId&&inRange(orderDate(order),start,end));
  const paidOrders=creditedOrders.filter((order)=>order.paymentStatus==="Paid"&&Number.isFinite(order.cases)&&order.cases>=0&&Number.isFinite(order.amount)&&order.amount>=0);
  const paidCases=paidOrders.reduce((sum,order)=>sum+order.cases,0);
  const collectedRevenue=paidOrders.reduce((sum,order)=>sum+order.amount,0);
  const appointments=data.appointments.filter((appointment)=>appointment.ownerId===userId&&appointment.status==="Completed"&&inRange(appointment.date,start,end));
  const accountFirstPaid=new Map<string,WorkspaceData["orders"][number]>();
  for(const order of data.orders.filter((item)=>item.paymentStatus==="Paid").sort((a,b)=>orderDate(a).localeCompare(orderDate(b))||a.id.localeCompare(b.id))) if(!accountFirstPaid.has(order.accountId))accountFirstPaid.set(order.accountId,order);
  const ownedNewPaidAccounts=[...accountFirstPaid.values()].filter((order)=>orderCreditUser(order)===userId&&inRange(orderDate(order),start,end)).length;
  return{paidCases,paidOrders:paidOrders.length,collectedRevenue,completedAppointments:appointments.length,newPaidAccounts:ownedNewPaidAccounts,
    sourceOrderIds:paidOrders.map((order)=>order.id),sourceAppointmentIds:appointments.map((appointment)=>appointment.id)};
}

export function goalProgress(goal:PerformanceGoal,data:WorkspaceData){
  if(goal.metric==="Manual")return Math.max(0,Number.isFinite(goal.manualValue)?goal.manualValue:0);
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
  return canManageUser(data,actor,targetUserId,true);
}

export function reportVisibleTo(actor:WorkspaceUser|null|undefined,report:WorkReport,data:WorkspaceData){
  if(!actor)return false;if(actor.role==="Administrator")return true;if(report.userId===actor.id)return true;
  if(actor.role!=="Sales Manager"||report.type==="Manager weekly")return false;
  return canViewPerformanceRecord(actor,report.userId,data);
}

export function workedOnDate(data:WorkspaceData,userId:string,date:string){
  return data.timeEntries.some((entry)=>entry.userId===userId&&entry.date===date)||data.appointments.some((item)=>item.ownerId===userId&&item.date===date)||data.orders.some((order)=>orderCreditUser(order)===userId&&order.placedAt.slice(0,10)===date);
}

export function expectedDailyReportDates(data:WorkspaceData,userId:string,start:string,end:string){
  const dates=new Set<string>();
  data.timeEntries.filter((entry)=>entry.userId===userId&&inRange(entry.date,start,end)).forEach((entry)=>dates.add(entry.date));
  data.appointments.filter((item)=>item.ownerId===userId&&inRange(item.date,start,end)).forEach((item)=>dates.add(item.date));
  data.orders.filter((order)=>orderCreditUser(order)===userId&&inRange(order.placedAt.slice(0,10),start,end)).forEach((order)=>dates.add(order.placedAt.slice(0,10)));
  return[...dates].filter(isValidCalendarDateKey).sort();
}

export function managerWeeklyMetrics(state:PerformanceState,data:WorkspaceData,managerId:string,start:string,end:string){
  const manager=data.users.find((user)=>user.id===managerId);const teamUsers=data.users.filter((user)=>user.role!=="Customer"&&user.id!==managerId&&(manager?.role==="Administrator"||canManageUser(data,manager,user.id,false)));
  const sourceUserIds=teamUsers.map((user)=>user.id);const totals=sourceUserIds.map((userId)=>userCommercialMetrics(data,userId,start,end));
  const expected=sourceUserIds.reduce((sum,userId)=>sum+expectedDailyReportDates(data,userId,start,end).length,0);
  const submitted=state.reports.filter((report)=>report.type==="Daily"&&sourceUserIds.includes(report.userId)&&inRange(report.workDate,start,end)).length;
  return{completedAppointments:totals.reduce((s,m)=>s+m.completedAppointments,0),paidCases:totals.reduce((s,m)=>s+m.paidCases,0),paidOrders:totals.reduce((s,m)=>s+m.paidOrders,0),newPaidAccounts:totals.reduce((s,m)=>s+m.newPaidAccounts,0),collectedRevenue:totals.reduce((s,m)=>s+m.collectedRevenue,0),repReportsExpected:expected,repReportsSubmitted:submitted,sourceUserIds,sourceAppointmentIds:totals.flatMap((m)=>m.sourceAppointmentIds),sourceOrderIds:totals.flatMap((m)=>m.sourceOrderIds)};
}

function bonusEarnedAt(data:WorkspaceData,signal:ReturnType<typeof evaluateSalesRepAccountBonuses>[number]){
  if(signal.status!=="Earned")return undefined;
  const evidence=data.orders.filter((order)=>signal.evidenceOrderIds.includes(order.id)&&order.paymentStatus==="Paid").sort((a,b)=>orderDate(a).localeCompare(orderDate(b)));
  if(signal.milestone==="Opening order")return evidence[0]?orderDate(evidence[0]):undefined;
  let total=0;for(const order of evidence){if(!Number.isFinite(order.cases)||order.cases<=0)continue;total+=order.cases;if(total>=signal.thresholdCases)return orderDate(order);}return undefined;
}

export function monthlyBonusTracker(data:WorkspaceData,userId:string,anchor=today()){
  const range=periodRange("Monthly",anchor);const asOf=range.end<today()?new Date(`${range.end}T12:00:00-07:00`):new Date();const signals=evaluateSalesRepAccountBonuses(data,asOf).filter((signal)=>signal.repId===userId);
  const earned=signals.map((signal)=>({signal,earnedAt:bonusEarnedAt(data,signal)})).filter((item)=>item.earnedAt&&inRange(item.earnedAt,range.start,range.end));
  const pending=signals.filter((signal)=>["Tracking","Awaiting payment"].includes(signal.status)&&signal.windowStart&&inRange(signal.windowStart,range.start,range.end));
  return{...range,earnedAmount:earned.reduce((sum,item)=>sum+item.signal.amount,0),earned,pending,potentialAmount:pending.reduce((sum,item)=>sum+item.amount,0)};
}
