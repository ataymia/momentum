import type {Timecard,TimeEntry} from "./types";
import {addCalendarDays,arizonaDateKey,startOfLocalWeek} from "./date-time";

/** Outstanding weekly timecards remain due until attested and submitted.
 * Unmatched punches require manual coverage reconciliation rather than an
 * invented company timecard or payroll approval.
 */
export function weeklyTimecardReview(
 timecards:readonly Timecard[],timeEntries:readonly TimeEntry[],asOf:string,
){
 const pending=timecards.filter(card=>["Open","Returned"].includes(card.status));
 const due=pending.filter(card=>card.weekEnd<=asOf);
 const overdue=due.filter(card=>card.weekEnd<asOf);
 const submitted=timecards.filter(card=>card.status==="Submitted");
 const approved=timecards.filter(card=>["Manager approved","Payroll ready"].includes(card.status));
 const covered=(entry:TimeEntry)=>timecards.some(card=>card.userId===entry.userId&&
   entry.date>=card.weekStart&&entry.date<=card.weekEnd);
 const unmatchedPunches=timeEntries.filter(entry=>entry.date<=asOf&&!covered(entry));
 // Missing weekly records are explicit reconciliation exceptions, never fabricated submissions.
 const missingByWeek=new Map<string,{
  userId:string;weekStart:string;weekEnd:string;entryIds:string[];
 }>();
 for(const entry of unmatchedPunches){
  const weekStart=startOfLocalWeek(entry.date);
  const weekEnd=addCalendarDays(weekStart,6);
  const key=entry.userId+":"+weekStart;
  const period=missingByWeek.get(key)??{userId:entry.userId,weekStart,weekEnd,entryIds:[]};
  period.entryIds.push(entry.id);
  missingByWeek.set(key,period);
 }
 const uncoveredWeeks=[...missingByWeek.values()]
  .filter(period=>period.weekEnd<=asOf)
  .sort((a,b)=>a.weekStart.localeCompare(b.weekStart)||a.userId.localeCompare(b.userId));
 return{pending,due,overdue,submitted,approved,unmatchedPunches,uncoveredWeeks};
}
export function canSubmitWeeklyTimecard(card:Timecard,entries:readonly TimeEntry[],asOf=arizonaDateKey()):boolean{
 if(!["Open","Returned"].includes(card.status)||
  card.weekStart>card.weekEnd||card.weekEnd>asOf)return false;
 const scoped=entries.filter(e=>e.userId===card.userId&&e.date>=card.weekStart&&e.date<=card.weekEnd);
 return !scoped.some(e=>!e.clockOut||Boolean(e.mealStart&&!e.mealEnd)||
   Boolean(e.note?.includes("Automatically closed at Arizona midnight")&&e.source!=="Manual correction"));
}
