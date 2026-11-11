import type {Timecard,TimeEntry} from "./types";

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
 return{pending,due,overdue,submitted,approved,unmatchedPunches};
}
export function canSubmitWeeklyTimecard(card:Timecard,entries:readonly TimeEntry[]):boolean{
 if(!["Open","Returned"].includes(card.status))return false;
 const scoped=entries.filter(e=>e.userId===card.userId&&e.date>=card.weekStart&&e.date<=card.weekEnd);
 return !scoped.some(e=>!e.clockOut||Boolean(e.mealStart&&!e.mealEnd)||
   Boolean(e.note?.includes("Automatically closed at Arizona midnight")&&e.source!=="Manual correction"));
}
