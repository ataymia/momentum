/* eslint-disable max-len,comma-spacing,key-spacing,object-curly-spacing,space-before-blocks,keyword-spacing,curly,brace-style,semi-spacing,arrow-parens,one-var,indent,operator-linebreak,space-before-function-paren */
/**
 * Server-authoritative timecard correction decision model.
 * An untrusted browser may request an edit; only the verified Administrator,
 * current Firestore timecard, payroll, period locks and audit receipts decide it.
 * No SDK or connection is required to exercise this with synthetic fixtures.
 */
export type Row=Record<string,unknown>;
export type CorrectionAction="amend"|"add_shift"|"create_week";
export type Punch={clockIn:string;clockOut:string;mealStart?:string;mealEnd?:string;breakMinutes:number};
export type CorrectionIntent={
 requestId:string;targetUid:string;action:CorrectionAction;reason:string;
 cardId?:string;entryId?:string;date?:string;weekDate?:string;punch?:Punch;
};
export type CorrectionSnapshot={
 actorUid:string;actor:Row|null;target:Row|null;now:string;todayArizona:string;
 timecards:Row[];entries:Row[];payrollRuns:Row[];periodLocks:Row[];
 sharedCards:Row[];sharedEntries:Row[];approvals:Row[];notifications:Row[];
 receipt:Row|null;
};
export type CorrectionPlan={
 receipt:Row;audit:Row;timecards:Row[];entries:Row[];
 approvals:Row[];notifications:Row[];replayed:boolean;
};
export type CorrectionDecision={ok:true;plan:CorrectionPlan}|{ok:false;status:number;message:string};
const bad=(status:number,message:string):CorrectionDecision=>({ok:false,status,message});
const str=(v:unknown)=>typeof v==="string"?v.trim():"";
const own=(v:unknown):v is Row=>Boolean(v&&typeof v==="object"&&!Array.isArray(v));
const isoDate=(v:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+"T00:00:00.000Z");return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v;};
const clockRe=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const mins=(x:string)=>Number(x.slice(0,2))*60+Number(x.slice(3,5));
const refOk=(v:string)=>/^[A-Za-z0-9_-]{8,120}$/.test(v);
const rows=(v:unknown)=>Array.isArray(v)&&v.every(own);
const payRunLock=(runs:Row[],targetUid:string,cardId:string,weekStart:string,weekEnd:string)=>{
 for(const run of runs){
   if(!str(run.id)||!["Draft","Approved","Released","Voided"].includes(str(run.status))||
      !rows(run.lines))return true;
   if(run.status==="Voided")continue;
   const lines=run.lines as Row[];
   if(lines.some(line=>!str(line.employeeId)||!Array.isArray(line.sourceTimecardIds)))return true;
   if(lines.some(line=>Array.isArray(line.sourceTimecardIds)&&line.sourceTimecardIds.includes(cardId)))return true;
   if(cardId==="__new__"&&["Regular","Final pay"].includes(str(run.kind))&&
      str(run.periodStart)<=weekEnd&&str(run.periodEnd)>=weekStart&&
      lines.some(line=>str(line.employeeId)===targetUid))return true;
 }
 return false;
};
const periodLocked=(locks:Row[],start:string,end:string)=>locks.some(lock=>{
 if(!str(lock.id)||!str(lock.domain)||!isoDate(str(lock.startDate))||
    !isoDate(str(lock.endDate)))return true;
 return lock.domain==="Payroll"&&!str(lock.releasedAt)&&
   str(lock.startDate)<=end&&str(lock.endDate)>=start;
});
const week=(value:string)=>{
 const date=new Date(value+"T00:00:00.000Z");
 const monday=(date.getUTCDay()+6)%7;date.setUTCDate(date.getUTCDate()-monday);
 const start=date.toISOString().slice(0,10);
 date.setUTCDate(date.getUTCDate()+6);
 return{start,end:date.toISOString().slice(0,10)};
};
const validatePunch=(p:Punch|undefined)=>{
 if(!p||!clockRe.test(p.clockIn)||!clockRe.test(p.clockOut)||
    !Number.isInteger(p.breakMinutes)||p.breakMinutes<0||
    mins(p.clockOut)<=mins(p.clockIn)||
    p.breakMinutes>=mins(p.clockOut)-mins(p.clockIn))return false;
 if(Boolean(p.mealStart)!==Boolean(p.mealEnd))return false;
 if(p.mealStart&&p.mealEnd){
   if(!clockRe.test(p.mealStart)||!clockRe.test(p.mealEnd)||
      mins(p.mealStart)<mins(p.clockIn)||mins(p.mealEnd)>mins(p.clockOut)||
      mins(p.mealEnd)<=mins(p.mealStart)||
      p.breakMinutes<mins(p.mealEnd)-mins(p.mealStart))return false;
 }
 return true;
};
const overlaps=(entries:Row[],userId:string,date:string,p:Punch,exclude:string)=>
 entries.some(e=>str(e.userId)===userId&&str(e.date)===date&&str(e.id)!==exclude&&
   (!clockRe.test(str(e.clockIn))||!clockRe.test(str(e.clockOut))||
    (mins(str(e.clockIn))<mins(p.clockOut)&&mins(p.clockIn)<mins(str(e.clockOut)))));
export function planTrustedTimecardCorrection(intent:CorrectionIntent,state:CorrectionSnapshot):CorrectionDecision{
 const {actorUid,actor,target,now,todayArizona}=state;
 if(!refOk(intent.requestId)||!refOk(intent.targetUid)||!["amend","add_shift","create_week"].includes(intent.action))
   return bad(400,"Invalid correction request or employee ID.");
 if(!actor||actor.role!=="Administrator"||actor.accountState!=="Active"||
    !str(actorUid))return bad(403,"An active Administrator is required.");
 if(!target||target.accountState!=="Active"||target.role==="Customer")
   return bad(409,"The employee must have an active eligible account.");
 if(!isoDate(todayArizona)||!Number.isFinite(Date.parse(now))||
    intent.reason.trim().length<8||intent.reason.length>500)return bad(400,"Use a verified reason of 8-500 characters.");
 if(state.sharedCards.some(c=>str(c.userId)===intent.targetUid)||
    state.sharedEntries.some(e=>str(e.userId)===intent.targetUid))
   return bad(409,"Legacy shared timecard rows require migration before correction.");
 if(state.timecards.some(c=>str(c.userId)!==intent.targetUid)||
    state.entries.some(e=>str(e.userId)!==intent.targetUid))
   return bad(409,"Timecard shard ownership does not match the employee.");
 if(!state.receipt&&state.timecards.some(c=>!str(c.id))||
    state.entries.some(e=>!str(e.id)))return bad(409,"Timecard record identifiers are incomplete.");
 const fingerprint=JSON.stringify({actorUid,intent});
 if(state.receipt){
   if(state.receipt.actorUid===actorUid&&state.receipt.fingerprint===fingerprint&&
      state.receipt.targetUid===intent.targetUid)
     return{ok:true,plan:{receipt:state.receipt,audit:{},timecards:state.timecards,
       entries:state.entries,approvals:state.approvals,notifications:state.notifications,replayed:true}};
   return bad(409,"This correction request ID was already used with different details.");
 }
 let targetCard:Row|undefined;let targetEntry:Row|undefined;
 let start="";let end="";let date="";
 let newCards=[...state.timecards],newEntries=[...state.entries];
 if(intent.action==="create_week"){
   if(!isoDate(str(intent.weekDate))||str(intent.weekDate)>todayArizona)
     return bad(400,"Missing-week date must be a real Arizona date that is not in the future.");
   ({start,end}=week(str(intent.weekDate)));
   if(newCards.some(c=>str(c.weekStart)<=end&&str(c.weekEnd)>=start))
     return bad(409,"An existing timecard already covers this employee's week.");
   if(periodLocked(state.periodLocks,start,end)||payRunLock(state.payrollRuns,intent.targetUid,
      "__new__",start,end))
     return bad(409,"The payroll period or employee wages are already locked.");
   const cardId="tc-trusted-"+intent.requestId;
   targetCard={id:cardId,userId:intent.targetUid,weekStart:start,weekEnd:end,
      status:"Returned",attested:false,returnedAt:now,returnedBy:actorUid,
      returnReason:"Administrator created missing week: "+intent.reason.trim()};
   newCards=[targetCard,...newCards];
 }else{
   if(!refOk(str(intent.cardId)))return bad(400,"A valid timecard ID is required.");
   const found=newCards.filter(c=>str(c.id)===intent.cardId);
   if(found.length!==1)return bad(409,"Timecard missing or duplicate; refresh and retry.");
   targetCard=found[0];start=str(targetCard.weekStart);end=str(targetCard.weekEnd);
   if(!isoDate(start)||!isoDate(end)||end<start)
     return bad(409,"Timecard week dates are invalid.");
   if(periodLocked(state.periodLocks,start,end)||
      payRunLock(state.payrollRuns,intent.targetUid,str(targetCard.id),start,end))
     return bad(409,"Timecard is already locked by payroll or an accounting period.");
   if(!validatePunch(intent.punch)||!isoDate(str(intent.date))||
      str(intent.date)<start||str(intent.date)>end||
      str(intent.date)>todayArizona)return bad(400,"Enter a complete valid shift within the employee's week.");
   date=str(intent.date);
   if(intent.action==="amend"){
     const matched=newEntries.filter(e=>str(e.id)===str(intent.entryId));
     if(matched.length!==1||str(matched[0].date)!==date)
       return bad(409,"The original punch was changed or not found.");
     targetEntry=matched[0];
     if(overlaps(newEntries,intent.targetUid,date,intent.punch!,str(targetEntry.id)))
       return bad(409,"Corrected hours overlap another punch.");
     const before={clockIn:targetEntry.clockIn,clockOut:targetEntry.clockOut,
       clockInAt:targetEntry.clockInAt,clockOutAt:targetEntry.clockOutAt,
       mealStart:targetEntry.mealStart,mealEnd:targetEntry.mealEnd,
       breakMinutes:targetEntry.breakMinutes,source:targetEntry.source,note:targetEntry.note};
     if(str(before.clockIn)===intent.punch!.clockIn&&str(before.clockOut)===intent.punch!.clockOut&&
        str(before.mealStart)===str(intent.punch!.mealStart)&&
        str(before.mealEnd)===str(intent.punch!.mealEnd)&&
        before.breakMinutes===intent.punch!.breakMinutes)return bad(409,"No time values were changed.");
     const history={at:now,by:actorUid,reason:intent.reason.trim(),before};
     const edited={...targetEntry,...intent.punch,clockInAt:null,clockOutAt:null,
       source:"Manual correction",note:intent.reason.trim(),
       corrections:[history,...(Array.isArray(targetEntry.corrections)?targetEntry.corrections:[])]};
     newEntries=newEntries.map(e=>e.id===targetEntry!.id?edited:e);
   }else{
     if(overlaps(newEntries,intent.targetUid,date,intent.punch!,""))
       return bad(409,"Missed shift overlaps an existing punch.");
     const entry={id:"te-trusted-"+intent.requestId,userId:intent.targetUid,date,
       ...intent.punch,source:"Manual correction",note:intent.reason.trim(),
       createdBy:actorUid,createdAt:now,creationReason:intent.reason.trim()};
     if(newEntries.some(e=>str(e.id)===entry.id))
       return bad(409,"Missing-shift identifier already exists.");
     newEntries=[entry,...newEntries];
   }
   const returned={...targetCard,status:"Returned",attested:false,approvedAt:null,approverId:null,
     returnedAt:now,returnedBy:actorUid,returnReason:"Administrator correction: "+intent.reason.trim(),
     resubmissionNote:null};
   newCards=newCards.map(c=>c.id===targetCard!.id?returned:c);
 }
 const cardId=str(targetCard!.id),auditId="tc-correction-"+intent.requestId;
 const newApprovals=state.approvals.map(a=>
   str(a.type)==="Timecard"&&str(a.recordId)===cardId&&a.status==="Pending"?
     {...a,status:"Returned"}:a);
 const notification={id:auditId,title:"Your timecard needs review",
   detail:"An Administrator updated your timecard. Review the recorded hours, attest and resubmit.",
   at:now,tone:"warning",readBy:[actorUid],audienceUserIds:[intent.targetUid]};
 const audit={id:auditId,actorUid,targetUid:intent.targetUid,action:intent.action,
   cardId,entryId:intent.entryId??null,date:date||start,reason:intent.reason.trim(),
   at:now,source:"Trusted server transaction",before:targetEntry??null,
   after:intent.action==="create_week"?targetCard:
     newEntries.find(e=>str(e.id)===str(intent.entryId)||str(e.id)==="te-trusted-"+intent.requestId)??null};
 const receipt={id:intent.requestId,actorUid,targetUid:intent.targetUid,cardId,
   action:intent.action,at:now,auditId,fingerprint,status:"Recorded"};
 return{ok:true,plan:{receipt,audit,timecards:newCards,entries:newEntries,
   approvals:newApprovals,notifications:[notification,...state.notifications],replayed:false}};
}
