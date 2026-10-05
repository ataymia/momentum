import assert from "node:assert/strict";
import test from "node:test";
import {
  WEEKLY_REPORTING_LAUNCH_DATE,
  createPerformanceSeed,
  normalizePerformanceState,
  rollForwardNextWeekDraft,
  weeklyCarryForwardGoals,
  weeklyReportingObligations,
  type PerformanceState,
  type WeeklyProgressReport,
} from "../lib/performance-engine";

const submittedReport = (weekStart:string,nextWeekGoals:string[]):WeeklyProgressReport => ({
  id:`report-${weekStart}`,
  type:"Weekly progress",
  userId:"usr-rep",
  weekStart,
  weekEnd:"2026-10-11",
  dueDate:"2026-10-12",
  submittedAt:"2026-10-12T10:00:00.000Z",
  status:"Submitted",
  goals:[
    {goal:"N/A",actual:"N/A",notes:""},
    {goal:"N/A",actual:"N/A",notes:""},
    {goal:"N/A",actual:"N/A",notes:""},
  ],
  summary:"First weekly report.",
  nextWeekGoals,
});

test("legacy performance state normalizes with an empty weekly draft ledger",()=>{
  const state=normalizePerformanceState({version:1,goals:[],reports:[],notes:[]});
  assert.deepEqual(state.weeklyDrafts,[]);
});

test("the weekly reporting launch begins Monday October 5 with a following-Monday due date",()=>{
  assert.equal(WEEKLY_REPORTING_LAUNCH_DATE,"2026-10-05");
  const periods=weeklyReportingObligations(createPerformanceSeed(),"usr-rep","2026-10-05");
  assert.deepEqual(periods,[{
    weekStart:"2026-10-05",
    weekEnd:"2026-10-11",
    dueDate:"2026-10-12",
    overdue:false,
    dueToday:false,
  }]);
});

test("the first report starts with N/A goals",()=>{
  assert.deepEqual(weeklyCarryForwardGoals(createPerformanceSeed(),"usr-rep","2026-10-05"),["N/A","N/A","N/A"]);
});

test("next-week goals carry into the next weekly report",()=>{
  const state:PerformanceState={...createPerformanceSeed(),reports:[submittedReport("2026-10-05",["Close 3 accounts","Complete 80 visits","Get 2 reorders"])]};
  assert.deepEqual(weeklyCarryForwardGoals(state,"usr-rep","2026-10-12"),["Close 3 accounts","Complete 80 visits","Get 2 reorders"]);
});

test("carry-forward never skips a missing immediately previous week",()=>{
  const state:PerformanceState={...createPerformanceSeed(),reports:[submittedReport("2026-10-05",["A","B","C"])]};
  assert.deepEqual(weeklyCarryForwardGoals(state,"usr-rep","2026-10-19"),["N/A","N/A","N/A"]);
});

test("late submission repairs an already-open next-week draft without erasing future planning",()=>{
  const draft={
    id:"draft-next",userId:"usr-rep",weekStart:"2026-10-12",weekEnd:"2026-10-18",dueDate:"2026-10-19",
    createdAt:"2026-10-12T08:00:00.000Z",updatedAt:"2026-10-12T08:00:00.000Z",
    goals:[{goal:"N/A",actual:"N/A",notes:""},{goal:"N/A",actual:"N/A",notes:""},{goal:"N/A",actual:"N/A",notes:""}],
    summary:"",nextWeekGoals:["Future 1","Future 2","Future 3"],
  };
  const repaired=rollForwardNextWeekDraft(draft,["Close 3 accounts","Complete 80 visits","Get 2 reorders"],"2026-10-12T12:00:00.000Z");
  assert.deepEqual(repaired.goals,[
    {goal:"Close 3 accounts",actual:"",notes:""},
    {goal:"Complete 80 visits",actual:"",notes:""},
    {goal:"Get 2 reorders",actual:"",notes:""},
  ]);
  assert.deepEqual(repaired.nextWeekGoals,["Future 1","Future 2","Future 3"]);
});

test("an unsubmitted prior week stays due when the new Monday begins",()=>{
  const periods=weeklyReportingObligations(createPerformanceSeed(),"usr-rep","2026-10-12");
  assert.equal(periods.length,2);
  assert.deepEqual(periods[0],{
    weekStart:"2026-10-05",
    weekEnd:"2026-10-11",
    dueDate:"2026-10-12",
    overdue:false,
    dueToday:true,
  });
  assert.deepEqual(periods[1],{
    weekStart:"2026-10-12",
    weekEnd:"2026-10-18",
    dueDate:"2026-10-19",
    overdue:false,
    dueToday:false,
  });
});

test("a submitted prior week disappears from Required Actions while the new week remains",()=>{
  const state:PerformanceState={...createPerformanceSeed(),reports:[submittedReport("2026-10-05",["A","B","C"])]};
  const periods=weeklyReportingObligations(state,"usr-rep","2026-10-12");
  assert.deepEqual(periods,[{
    weekStart:"2026-10-12",
    weekEnd:"2026-10-18",
    dueDate:"2026-10-19",
    overdue:false,
    dueToday:false,
  }]);
});

test("a missed due date becomes blocking/overdue on the next day",()=>{
  const periods=weeklyReportingObligations(createPerformanceSeed(),"usr-rep","2026-10-13");
  assert.equal(periods[0].weekStart,"2026-10-05");
  assert.equal(periods[0].overdue,true);
  assert.equal(periods[0].dueToday,false);
});
