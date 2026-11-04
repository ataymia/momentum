import assert from "node:assert/strict";
import test from "node:test";
import {
  planTrustedTimecardCorrection,
  type CorrectionIntent,type CorrectionSnapshot,
} from "../functions/src/timecard-correction-policy";

const original=():CorrectionSnapshot=>({
 actorUid:"administrator-001",actor:{role:"Administrator",accountState:"Active"},
 target:{role:"Sales Representative",accountState:"Active"},
 now:"2026-11-04T20:33:00.000Z",todayArizona:"2026-11-04",
 timecards:[{id:"card-0001",userId:"employee-0001",weekStart:"2026-10-26",weekEnd:"2026-11-01",
   status:"Manager approved",attested:true,approvedAt:"2026-11-03T12:00:00.000Z",approverId:"administrator-001"}],
 entries:[{id:"entry-001",userId:"employee-0001",date:"2026-10-27",clockIn:"08:00",clockOut:"17:00",
  clockInAt:"2026-10-27T15:00:00.000Z",clockOutAt:"2026-10-28T00:00:00.000Z",
  breakMinutes:30,source:"Web clock"}],
 payrollRuns:[],periodLocks:[],sharedCards:[],sharedEntries:[],
 approvals:[{id:"approve-001",type:"Timecard",recordId:"card-0001",status:"Pending"}],
 notifications:[],receipt:null,
});
const amend:CorrectionIntent={action:"amend",requestId:"request-0001",targetUid:"employee-0001",
  cardId:"card-0001",entryId:"entry-001",date:"2026-10-27",
  reason:"Employee verified a missed hour",
  punch:{clockIn:"08:00",clockOut:"18:00",breakMinutes:30},
};
const newWeek:CorrectionIntent={action:"create_week",requestId:"request-0002",targetUid:"employee-0001",
  weekDate:"2026-10-19",reason:"Missing historical week verified by employee"};
const assertDenied=(input:CorrectionIntent,snapshot:CorrectionSnapshot)=>{
 const result=planTrustedTimecardCorrection(input,snapshot);assert.equal(result.ok,false);
};
test("trusted amendment resets attestation, records immutable before-image and targets employee notice",()=>{
 const result=planTrustedTimecardCorrection(amend,original());assert(result.ok);
 if(!result.ok)return;
 const p=result.plan;
 assert.equal(p.replayed,false);
 assert.equal(p.timecards[0].status,"Returned");
 assert.equal(p.timecards[0].attested,false);
 assert.equal(p.timecards[0].approvedAt,null);
 assert.equal(p.approvals[0].status,"Returned");
 assert.deepEqual(p.notifications[0].audienceUserIds,["employee-0001"]);
 assert.equal(p.entries[0].clockOut,"18:00");
 assert.equal(p.entries[0].clockOutAt,null);
 const corrections=p.entries[0].corrections as Record<string,unknown>[];
 assert.equal((corrections[0].before as Record<string,unknown>).clockOutAt,"2026-10-28T00:00:00.000Z");
 assert.equal(p.audit.action,"amend");
 assert.equal(p.receipt.targetUid,"employee-0001");
 assert.equal(p.receipt.auditId,"tc-correction-request-0001");
});
test("request receipts permit identical replay but reject payload reuse",()=>{
 const first=planTrustedTimecardCorrection(amend,original());assert(first.ok);
 if(!first.ok)return;
 const replay=planTrustedTimecardCorrection(amend,{...original(),receipt:first.plan.receipt,
   timecards:first.plan.timecards,entries:first.plan.entries});
 assert(replay.ok);
 if(replay.ok)assert.equal(replay.plan.replayed,true);
 assertDenied({...amend,reason:"Different reason for same request"},
   {...original(),receipt:first.plan.receipt});
});
test("no unsigned or separated actor/target can issue admin correction",()=>{
 assertDenied(amend,{...original(),actor:null});
 assertDenied(amend,{...original(),actor:{role:"Sales Manager",accountState:"Active"}});
 assertDenied(amend,{...original(),actor:{role:"Administrator",accountState:"Suspended"}});
 assertDenied(amend,{...original(),target:{role:"Sales Representative",accountState:"Separated"}});
 assertDenied(amend,{...original(),target:{role:"Customer",accountState:"Active"}});
});
test("payroll Draft, Approved and Released all lock consumed source timecards",()=>{
 for(const status of ["Draft","Approved","Released"]){
   const snapshot=original();
   snapshot.payrollRuns=[{id:"pay-0001",kind:"Regular",status,periodStart:"2026-10-26",
     periodEnd:"2026-11-01",lines:[{employeeId:"employee-0001",sourceTimecardIds:["card-0001"]}]}];
   assertDenied(amend,snapshot);
 }
 const voided=original();
 voided.payrollRuns=[{id:"pay-0001",kind:"Regular",status:"Voided",
   lines:[{employeeId:"employee-0001",sourceTimecardIds:["card-0001"]}]}];
 assert.equal(planTrustedTimecardCorrection(amend,voided).ok,true);
});
test("payroll period locks, legacy shards and malformed payroll records fail closed",()=>{
 assertDenied(amend,{...original(),periodLocks:[{id:"lock-0001",domain:"Payroll",
   startDate:"2026-10-27",endDate:"2026-10-29"}]});
 assertDenied(amend,{...original(),sharedCards:[{id:"legacy-1",userId:"employee-0001"}]});
 assertDenied(amend,{...original(),sharedEntries:[{id:"legacy-2",userId:"employee-0001"}]});
 assertDenied(amend,{...original(),payrollRuns:[{id:"pay-1",status:"Approved",lines:"corrupted"}]});
 assertDenied(amend,{...original(),timecards:[{id:"card-0001",userId:"wrong-uid"}]});
});
test("amendments cannot silently overlap shifts or fabricate overnight punches",()=>{
 const snapshot=original();
 snapshot.entries.push({id:"entry-002",userId:"employee-0001",date:"2026-10-27",
   clockIn:"17:30",clockOut:"20:00",breakMinutes:0});
 assertDenied(amend,snapshot);
 assertDenied({...amend,punch:{clockIn:"23:00",clockOut:"04:00",breakMinutes:0}},original());
 assertDenied({...amend,punch:{clockIn:"08:00",clockOut:"18:00",breakMinutes:800}},original());
 assertDenied({...amend,punch:{clockIn:"08:00",clockOut:"18:00",
   mealStart:"13:00",breakMinutes:30}},original());
});
test("missing shift is distinct from original punch, requires employee review",()=>{
 const intent:CorrectionIntent={...amend,action:"add_shift",requestId:"request-0010",
   entryId:undefined,date:"2026-10-28",punch:{clockIn:"09:00",clockOut:"12:00",breakMinutes:0}};
 const result=planTrustedTimecardCorrection(intent,original());assert(result.ok);
 if(!result.ok)return;
 assert.equal(result.plan.entries.length,2);
 assert.equal(result.plan.entries[0].createdBy,"administrator-001");
 assert.equal(result.plan.entries[0].id,"te-trusted-request-0010");
 assert.equal(result.plan.timecards[0].status,"Returned");
 assert.equal(result.plan.timecards[0].attested,false);
});
test("missing week begins with no shifts, cannot duplicate weekly card or paid period",()=>{
 const result=planTrustedTimecardCorrection(newWeek,original());assert(result.ok);
 if(!result.ok)return;
 assert.equal(result.plan.timecards[0].weekStart,"2026-10-19");
 assert.equal(result.plan.timecards[0].weekEnd,"2026-10-25");
 assert.equal(result.plan.timecards[0].status,"Returned");
 assert.equal(result.plan.timecards[0].attested,false);
 assert.equal(result.plan.entries.length,1);
 assertDenied({...newWeek,weekDate:"2026-10-27"},original());
 assertDenied({...newWeek,weekDate:"2027-11-01"},original());
 assertDenied(newWeek,{...original(),payrollRuns:[{id:"pay-2",kind:"Regular",status:"Approved",
   periodStart:"2026-10-19",periodEnd:"2026-10-25",
   lines:[{employeeId:"employee-0001",sourceTimecardIds:["card-other"]}]}]});
});
