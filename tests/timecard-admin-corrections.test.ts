import assert from "node:assert/strict";
import test from "node:test";
import {amendTimeEntry,insertMissedPunch,insertMissingTimecard} from "../lib/timecard-admin-corrections";
import {createPayrollSeed} from "../lib/payroll-engine";
import {normalizeWorkspaceData} from "../lib/workspace-normalization";
import type {WorkspaceData} from "../lib/types";

const at="2026-11-04T20:00:00.000Z";
const data=()=>({
 users:[
  {id:"admin",role:"Administrator",name:"Admin User",firstName:"Admin",email:"admin@example.invalid",initials:"AU",title:"Director",team:"Leadership",accent:"#000000"},
  {id:"worker",role:"Sales Representative",name:"Worker User",firstName:"Worker",email:"worker@example.invalid",initials:"WU",title:"Rep",team:"Sales",accent:"#111111"},
 ],
 timecards:[{id:"card-1",userId:"worker",weekStart:"2026-10-26",weekEnd:"2026-11-01",status:"Manager approved",submittedAt:"2026-11-02T10:00:00.000Z",approvedAt:"2026-11-03T10:00:00.000Z",approverId:"admin",attested:true}],
 timeEntries:[{id:"entry-1",userId:"worker",date:"2026-10-27",clockIn:"08:00",clockInAt:"2026-10-27T15:00:00.000Z",clockOut:"17:00",clockOutAt:"2026-10-28T00:00:00.000Z",breakMinutes:30,source:"Web clock"}],
 approvals:[{id:"approval-1",type:"Timecard",recordId:"card-1",status:"Pending",requestedBy:"Worker User",requesterId:"worker",title:"Review time",detail:"week",team:"Sales",submittedAt:at,dueAt:at,priority:"Normal"}],
 notifications:[],accounts:[],orders:[],inventory:[],
}) as unknown as WorkspaceData;
const punch={clockIn:"08:00",clockOut:"18:00",breakMinutes:30};
const processed=()=>{
 const payroll=createPayrollSeed();
 payroll.runs.push({
  id:"processed-1",kind:"Regular",createdAt:at,periodStart:"2026-10-26",periodEnd:"2026-11-01",payDate:"2026-11-06",status:"Draft",
  lines:[{employeeId:"worker",regularHours:8,overtimeHours:0,regularPay:160,overtimePay:0,bonusPay:0,grossPay:160,benefitDeduction:0,taxableWages:160,federalTax:16,stateTax:8,localTax:0,additionalWithholding:0,postTaxDeduction:0,employeeTaxes:24,employerTaxes:12,netPay:136,sourceTimecardIds:["card-1"],sourceBonusIds:[]}],
 });
 return payroll;
};
test("administrator can correct another employee's approved punch and preserve before-image",()=>{
 const src=data();
 const result=amendTimeEntry(src,createPayrollSeed(),{actorId:"admin",entryId:"entry-1",punch,reason:"Employee verified missing hour",at});
 assert(result.ok);
 if(!result.ok)return;
 assert.equal(result.data.timeEntries[0].clockOut,"18:00");
 assert.equal(result.data.timeEntries[0].clockOutAt,undefined);
 assert.equal(result.data.timeEntries[0].corrections?.[0].before.clockOut,"17:00");
 assert.equal(result.data.timeEntries[0].corrections?.[0].before.clockInAt,"2026-10-27T15:00:00.000Z");
 assert.equal(result.data.timeEntries[0].corrections?.[0].by,"admin");
 assert.equal(result.data.timecards[0].status,"Returned");
 assert.equal(result.data.timecards[0].attested,false);
 assert.equal(result.data.timecards[0].approvedAt,undefined);
 assert.equal(result.data.approvals[0].status,"Returned");
 assert.deepEqual(result.data.notifications[0].audienceUserIds,["worker"]);
 const normalized=normalizeWorkspaceData(result.data,src);
 assert.equal(normalized.timeEntries[0].corrections?.[0].before.clockOutAt,"2026-10-28T00:00:00.000Z");
 assert.equal(normalized.timecards[0].status,"Returned");
});
test("non-administrators and payroll-processed timecards are protected",()=>{
 const src=data();
 const input={actorId:"worker",entryId:"entry-1",punch,reason:"Employee verified missing hour",at};
 assert.equal(amendTimeEntry(src,createPayrollSeed(),input).ok,false);
 assert.equal(amendTimeEntry(src,processed(),{...input,actorId:"admin"}).ok,false);
 assert.equal(insertMissedPunch(src,processed(),{actorId:"admin",userId:"worker",cardId:"card-1",
  entryId:"entry-2",date:"2026-10-28",punch,reason:"Verified missing punch",at}).ok,false);
});
test("Administrator can insert a documented missed day, with provenance and no overlap",()=>{
 const src=data();
 const input={actorId:"admin",userId:"worker",cardId:"card-1",entryId:"entry-2",date:"2026-10-28",
  punch:{clockIn:"09:00",clockOut:"15:00",breakMinutes:30},reason:"Confirmed from employee message",at};
 const result=insertMissedPunch(src,createPayrollSeed(),input);
 assert(result.ok);
 if(!result.ok)return;
 assert.equal(result.data.timeEntries[0].createdBy,"admin");
 assert.equal(result.data.timeEntries[0].creationReason,input.reason);
 assert.equal(result.data.timecards[0].status,"Returned");
 assert.equal(normalizeWorkspaceData(result.data,src).timeEntries.find(e=>e.id==="entry-2")?.createdBy,"admin");
 assert.equal(insertMissedPunch(result.data,createPayrollSeed(),input).ok,false);
});
test("overlaps, overnight punches, and invalid breaks are rejected",()=>{
 const src=data(),p=createPayrollSeed();
 const sameDay={actorId:"admin",userId:"worker",cardId:"card-1",entryId:"entry-2",date:"2026-10-27",
  punch:{clockIn:"12:00",clockOut:"16:00",breakMinutes:0},reason:"Employee confirmed second punch",at};
 assert.equal(insertMissedPunch(src,p,sameDay).ok,false);
 assert.equal(insertMissedPunch(src,p,{...sameDay,date:"2026-10-28",punch:{clockIn:"22:00",clockOut:"05:00",breakMinutes:0}}).ok,false);
 assert.equal(amendTimeEntry(src,p,{actorId:"admin",entryId:"entry-1",punch:{clockIn:"08:00",clockOut:"17:00",breakMinutes:600},reason:"Fix break",at}).ok,false);
});


test("Administrator can open a missing historical week but cannot self-approve it",()=>{
 const src=data();src.timecards=[];src.timeEntries=[];
 const payload={actorId:"admin",userId:"worker",weekDate:"2026-10-28",
   cardId:"new-week-1",reason:"Employee verified missing week",at};
 const result=insertMissingTimecard(src,createPayrollSeed(),payload);
 assert(result.ok);
 if(!result.ok)return;
 const card=result.data.timecards[0];
 assert.equal(card.weekStart,"2026-10-26");
 assert.equal(card.weekEnd,"2026-11-01");
 assert.equal(card.status,"Returned");
 assert.equal(card.attested,false);
 assert.equal(card.approvedAt,undefined);
 assert.equal(card.returnedBy,"admin");
 assert.equal(result.data.timeEntries.length,0);
 assert.equal(insertMissingTimecard(result.data,createPayrollSeed(),payload).ok,false);
 assert.equal(normalizeWorkspaceData(result.data,src).timecards[0].status,"Returned");
});
test("only admins may create historical timecards and duplicate weeks are rejected",()=>{
 const src=data();
 const sample={actorId:"admin",userId:"worker",weekDate:"2026-10-28",
   cardId:"new-week",reason:"Verified missing week",at};
 assert.equal(insertMissingTimecard(src,createPayrollSeed(),sample).ok,false);
 src.timecards=[];
 assert.equal(insertMissingTimecard(src,createPayrollSeed(),{...sample,actorId:"worker"}).ok,false);
 assert.equal(insertMissingTimecard(src,createPayrollSeed(),{...sample,weekDate:"2099-01-01"}).ok,false);
});


test("a missing week cannot be added when paid or approved payroll overlaps that employee",()=>{
 const src=data();src.timecards=[];src.timeEntries=[];
 const p=processed();
 const result=insertMissingTimecard(src,p,{actorId:"admin",userId:"worker",weekDate:"2026-10-28",
   cardId:"new-timecard",reason:"Need a verified missing week",at});
 assert.equal(result.ok,false);
});
