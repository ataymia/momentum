import {addCalendarDays,isValidCalendarDateKey,startOfLocalWeek,arizonaDateKey} from "./date-time";
import {consumedTimecards,type PayrollState} from "./payroll-engine";
import type {TimeEntry,Timecard,WorkspaceData} from "./types";

/** Administrator time-entry corrections preserve source evidence and re-attestation. */
export type CorrectedPunch={clockIn:string;clockOut?:string;mealStart?:string;mealEnd?:string;breakMinutes:number};
export type CorrectionInput={actorId:string;entryId:string;punch:CorrectedPunch;reason:string;at:string};
export type MissedPunchInput={actorId:string;userId:string;cardId:string;entryId:string;date:string;punch:CorrectedPunch;reason:string;at:string};
export type TimeCorrectionResult={ok:true;data:WorkspaceData}|{ok:false;error:string};
const validInstant=(x:string)=>!Number.isNaN(Date.parse(x));
const validTime=(x:string|undefined)=>x===undefined||/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(x);
const clockMinutes=(x:string)=>{const [h,m]=x.split(":").map(Number);return h*60+m;};
const reject=(error:string):TimeCorrectionResult=>({ok:false,error});
const hasAdmin=(data:WorkspaceData,id:string)=>data.users.some(u=>u.id===id&&u.role==="Administrator");
const cardFor=(data:WorkspaceData,userId:string,date:string)=>
 data.timecards.find(c=>c.userId===userId&&c.weekStart<=date&&c.weekEnd>=date);
export function punchProblem(p:CorrectedPunch){
 if(!validTime(p.clockIn)||!p.clockIn||!validTime(p.clockOut)||!validTime(p.mealStart)||!validTime(p.mealEnd))
   return "Enter valid 24-hour clock and meal times.";
 if(!Number.isInteger(p.breakMinutes)||p.breakMinutes<0)return "Break minutes must be a whole nonnegative number.";
 if(Boolean(p.mealStart)!==Boolean(p.mealEnd))return "Meal start and end must be entered together.";
 if(p.clockOut&&clockMinutes(p.clockOut)<=clockMinutes(p.clockIn))
   return "Clock-out must be after clock-in. Overnight shifts require a separate reviewed workflow.";
 if(p.mealStart&&p.mealEnd){
   if(!p.clockOut||clockMinutes(p.mealStart)<clockMinutes(p.clockIn)||
     clockMinutes(p.mealEnd)<=clockMinutes(p.mealStart)||
     clockMinutes(p.mealEnd)>clockMinutes(p.clockOut))
     return "Meal times must fall within the completed shift.";
   if(p.breakMinutes<clockMinutes(p.mealEnd)-clockMinutes(p.mealStart))
     return "Total break minutes cannot be less than the recorded meal duration.";
 }
 if(p.clockOut&&p.breakMinutes>=clockMinutes(p.clockOut)-clockMinutes(p.clockIn))
   return "Breaks must be shorter than the recorded shift.";
 return null;
}
function overlaps(data:WorkspaceData,userId:string,date:string,p:CorrectedPunch,excludeId?:string){
 const end=p.clockOut;
 if(!end)return false;
 return data.timeEntries.some(e=>e.userId===userId&&e.date===date&&e.id!==excludeId&&
   (!e.clockOut||clockMinutes(e.clockIn)<clockMinutes(end)&&
     clockMinutes(p.clockIn)<clockMinutes(e.clockOut)));
}
function cardProcessed(payroll:PayrollState,card:Timecard){
 return consumedTimecards(payroll).has(card.id);
}
function resetApproval(data:WorkspaceData,card:Timecard,actorId:string,at:string,reason:string){
 return {
  timecards:data.timecards.map(c=>c.id===card.id?{...c,
    status:"Returned" as const,attested:false,approvedAt:undefined,approverId:undefined,
    returnedAt:at,returnedBy:actorId,returnReason:"Administrator correction: "+reason,resubmissionNote:undefined}:c),
  approvals:data.approvals.map(a=>a.type==="Timecard"&&a.recordId===card.id&&a.status==="Pending"?
     {...a,status:"Returned" as const}:a),
  notifications:[{id:"time-adjust-"+card.id+"-"+at,title:"Timecard corrected by Administrator",
    detail:"Your timecard was corrected and requires your review and re-attestation: "+reason,
    at,readBy:[actorId],tone:"warning" as const,audienceUserIds:[card.userId]},...data.notifications],
 };
}
export function amendTimeEntry(data:WorkspaceData,payroll:PayrollState,input:CorrectionInput):TimeCorrectionResult{
 if(!hasAdmin(data,input.actorId))return reject("Only Administrators can correct another employee's timecard.");
 if(!validInstant(input.at)||input.reason.trim().length<8)return reject("Provide a specific reason (at least 8 characters).");
 const error=punchProblem(input.punch);if(error)return reject(error);
 const entry=data.timeEntries.find(e=>e.id===input.entryId);
 if(!entry)return reject("The time entry no longer exists.");
 const card=cardFor(data,entry.userId,entry.date);
 if(!card)return reject("A matching weekly timecard must exist.");
 if(cardProcessed(payroll,card))return reject("This timecard is already included in a payroll run. Use a reviewed payroll adjustment instead of editing paid/approved source wages.");
 if(overlaps(data,entry.userId,entry.date,input.punch,entry.id))return reject("Shift would overlap another recorded punch.");
 const old={clockIn:entry.clockIn,clockOut:entry.clockOut,mealStart:entry.mealStart,
  mealEnd:entry.mealEnd,breakMinutes:entry.breakMinutes};
 if(old.clockIn===input.punch.clockIn&&old.clockOut===input.punch.clockOut&&
   old.mealStart===input.punch.mealStart&&old.mealEnd===input.punch.mealEnd&&
   old.breakMinutes===input.punch.breakMinutes)return reject("No time or break values changed.");
 const history={
  at:input.at,by:input.actorId,reason:input.reason.trim(),
  before:{...old,clockInAt:entry.clockInAt,clockOutAt:entry.clockOutAt,
    source:entry.source,note:entry.note},
 };
 const entryUpdated:TimeEntry={...entry,...input.punch,
  clockInAt:undefined,clockOutAt:undefined,source:"Manual correction",
  note:input.reason.trim(),corrections:[history,...(entry.corrections??[])]};
 return{ok:true,data:{...data,...resetApproval(data,card,input.actorId,input.at,input.reason.trim()),
  timeEntries:data.timeEntries.map(e=>e.id===entry.id?entryUpdated:e)}};
}
export function insertMissedPunch(data:WorkspaceData,payroll:PayrollState,input:MissedPunchInput):TimeCorrectionResult{
 if(!hasAdmin(data,input.actorId))return reject("Administrator access required.");
 if(!validInstant(input.at)||input.reason.trim().length<8)return reject("Describe the verified missing punch.");
 if(!isValidCalendarDateKey(input.date))return reject("Enter a valid shift date.");
 const error=punchProblem(input.punch);if(error)return reject(error);
 if(!input.punch.clockOut)return reject("New historical shifts must have a verified clock-out.");
 if(data.timeEntries.some(e=>e.id===input.entryId))return reject("Duplicate time entry identifier.");
 const card=data.timecards.find(c=>c.id===input.cardId&&c.userId===input.userId&&
  c.weekStart<=input.date&&c.weekEnd>=input.date);
 if(!card)return reject("Select the employee's matching timecard and date.");
 if(cardProcessed(payroll,card))return reject("Payroll already consumed this timecard; create a reviewed adjustment instead.");
 if(overlaps(data,input.userId,input.date,input.punch))return reject("This shift overlaps another recorded punch.");
 return{ok:true,data:{...data,...resetApproval(data,card,input.actorId,input.at,input.reason.trim()),
  timeEntries:[{id:input.entryId,userId:input.userId,date:input.date,
   ...input.punch,source:"Manual correction",note:input.reason.trim(),
   createdBy:input.actorId,createdAt:input.at,creationReason:input.reason.trim()},...data.timeEntries]}};
}


export type MissingTimecardInput={actorId:string;userId:string;weekDate:string;cardId:string;reason:string;at:string};
/** Create a weekly correction case with zero payable hours, never an auto-approved timecard. */
export function insertMissingTimecard(data:WorkspaceData,payroll:PayrollState,input:MissingTimecardInput):TimeCorrectionResult{
 if(!hasAdmin(data,input.actorId))return reject("Administrator access required.");
 if(!validInstant(input.at)||input.reason.trim().length<8)return reject("Provide a documented reason for adding a missing week.");
 if(!isValidCalendarDateKey(input.weekDate)||input.weekDate>arizonaDateKey())
  return reject("Select a valid current or historical week.");
 if(!data.users.some(u=>u.id===input.userId&&u.role!=="Customer"))
  return reject("Employee not found.");
 const start=startOfLocalWeek(input.weekDate),end=addCalendarDays(start,6);
 if(payroll.runs.some(run=>run.status!=="Voided"&&["Regular","Final pay"].includes(run.kind)&&
   run.periodStart<=end&&run.periodEnd>=start&&run.lines.some(line=>line.employeeId===input.userId)))
    return reject("Existing regular/final payroll overlaps this employee and week. Review a payroll adjustment rather than creating another payable source.");
 if(data.timecards.some(c=>c.id===input.cardId))return reject("Duplicate timecard identifier.");
 if(data.timecards.some(c=>c.userId===input.userId&&start<=c.weekEnd&&end>=c.weekStart))
  return reject("This employee already has an overlapping weekly timecard.");
 const card:Timecard={id:input.cardId,userId:input.userId,weekStart:start,weekEnd:end,
  status:"Returned",attested:false,returnedAt:input.at,returnedBy:input.actorId,
  returnReason:"Administrator created missing week: "+input.reason.trim()};
 return{ok:true,data:{...data,timecards:[card,...data.timecards],
  notifications:[{id:"missing-card-"+input.cardId,title:"Missing timecard created",
   detail:"An Administrator added a missing timecard. Review its shifts and submit your attestation.",
   at:input.at,readBy:[input.actorId],tone:"warning",audienceUserIds:[input.userId]},...data.notifications]}};
}
