import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {canSubmitWeeklyTimecard,weeklyTimecardReview} from "../lib/weekly-timecard-review";
import type {Timecard,TimeEntry} from "../lib/types";
const punch=(id:string,userId:string,date:string,clockOut?:string):TimeEntry=>({
 id,userId,date,clockIn:"08:00",clockOut,breakMinutes:0,source:"Web clock",
});
const card=(id:string,userId:string,start:string,end:string,status:Timecard["status"]="Open"):Timecard=>({
 id,userId,weekStart:start,weekEnd:end,status,attested:false,
});

test("R82 records absent weekly cards as separate employee/week reconciliation exceptions",()=>{
 const existing=card("one","a","2026-11-02","2026-11-08");
 const punches=[punch("e1","a","2026-11-03","17:00"),
  punch("e2","b","2026-11-03","17:00"),punch("e3","b","2026-11-07","17:00"),
  punch("e4","b","2026-11-10","17:00"),punch("e5","a","2026-10-27","17:00")];
 const state=weeklyTimecardReview([existing],punches,"2026-11-12");
 assert.deepEqual(state.unmatchedPunches.map(p=>p.id),["e2","e3","e4","e5"]);
 assert.deepEqual(state.uncoveredWeeks.map(p=>[p.userId,p.weekStart,p.weekEnd,p.entryIds.length]),[
  ["a","2026-10-26","2026-11-01",1],["b","2026-11-02","2026-11-08",2],
 ]);
 assert.equal(existing.status,"Open");
 assert.equal(state.due.length,1);
});
test("R82 does not invent an overdue weekly card for the current or future week",()=>{
 const state=weeklyTimecardReview([],[
  punch("today","a","2026-11-12"),punch("future","a","2026-11-20"),
 ],"2026-11-12");
 assert.equal(state.unmatchedPunches.length,1);
 assert.deepEqual(state.uncoveredWeeks,[]);
});
test("R82 cannot submit early, reapprove, or attest an incomplete punch",()=>{
 const current=card("current","a","2026-11-09","2026-11-15");
 const complete=punch("ok","a","2026-11-12","17:00");
 assert.equal(canSubmitWeeklyTimecard(current,[complete],"2026-11-12"),false);
 assert.equal(canSubmitWeeklyTimecard(current,[punch("open","a","2026-11-12")],"2026-11-15"),false);
 assert.equal(canSubmitWeeklyTimecard(current,[complete],"2026-11-15"),true);
 assert.equal(canSubmitWeeklyTimecard({...current,status:"Manager approved"},[],"2026-11-15"),false);
 const prior=card("prior","a","2026-11-02","2026-11-08");
 const auto={...punch("auto","a","2026-11-03","00:00"),
  note:"Automatically closed at Arizona midnight"};
 assert.equal(canSubmitWeeklyTimecard(prior,[auto],"2026-11-12"),false);
 assert.equal(canSubmitWeeklyTimecard(prior,[{...auto,source:"Manual correction"}],"2026-11-12"),true);
});
test("R83 UI and source handler reject stale, unsigned manager approval",()=>{
 const base=readFileSync("lib/workspace-context-v5.tsx","utf8");
 const ui=readFileSync("components/prototype/hr-attendance-experience.tsx","utf8");
 assert.match(base,/card\.status !== "Submitted" \|\| !card\.attested/);
 assert.match(ui,/activeCard\.status==="Submitted"&&activeCard\.attested/);
});
