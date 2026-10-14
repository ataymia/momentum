import {canAccessPage} from "./access";
import type {WorkspaceUser} from "./types";
import {arizonaDateKey,isValidCalendarDateKey} from "./date-time";
import {weeklyReportingPeriod,type PerformanceState} from "./performance-engine";
import type {CrmState} from "./crm-engine";
export function weeklySubmissionStatus(state:PerformanceState,userId:string,weekStart:string,today=arizonaDateKey()){
 const period=weeklyReportingPeriod(weekStart);
 const report=state.reports.find(row=>row.type==="Weekly progress"&&row.userId===userId&&row.weekStart===weekStart);
 return {report,status:report?"Submitted":today>period.dueDate?"Overdue":today===period.dueDate?"Due":"Not submitted",dueDate:period.dueDate};
}
function visitDay(value:string){
 if(isValidCalendarDateKey(value))return value;
 return Number.isFinite(Date.parse(value))?arizonaDateKey(value):"";
}
export function weeklyPhysicalVisits(crm:CrmState,userId:string,start:string,end:string){
 return crm.interactions.filter(row=>row.userId===userId&&row.type==="Visit"&&row.physicalVisit===true&&visitDay(row.occurredAt)>=start&&visitDay(row.occurredAt)<=end).length;
}

export function weeklyReporterEligible(user:WorkspaceUser){
 return user.employmentStatus!=="Separated" && user.employmentStatus!=="Prehire" && canAccessPage(user,"reportingCenter");
}
