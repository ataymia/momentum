import assert from "node:assert/strict";
import test from "node:test";
import { validAdditionalManagerIds, reportingManagerCandidates } from "../lib/employee-reporting";
import { createHcmSeed, type HCMState } from "../lib/hcm-engine";
import { averageRecordedVariance, shiftClockInEvidence } from "../lib/employee-profile";
import { normalizePersistedHcmState } from "../lib/hcm-persistence";
import type { TimeEntry, WorkspaceData } from "../lib/types";

const data={users:[
 {id:"rep",role:"Sales Representative",title:"Rep",name:"Rep",team:"Sales"},
 {id:"mia",role:"Administrator",title:"Director",name:"Mia",team:"Management"},
 {id:"flo",role:"Administrator",title:"General Manager",name:"Flo",team:"Management"},
 {id:"rep2",role:"Sales Representative",title:"Rep",name:"Rep2",team:"Sales"},
 ]} as unknown as WorkspaceData;

test("reporting list accepts multiple authorized contacts without duplicate or self references",()=>{
 assert.deepEqual(reportingManagerCandidates(data,"rep").map((u)=>u.id),["flo","mia"]);
 assert.deepEqual(validAdditionalManagerIds(["flo","mia","mia","rep","rep2","unknown"],data,"rep"),["flo","mia"]);
 assert.deepEqual(validAdditionalManagerIds(["flo","mia"],data,"rep","flo"),["mia"]);
});

test("employee HCM reporting assignments survive normalization",()=>{
 const seed=createHcmSeed(data);
 const record=seed.employees.find((e)=>e.userId==="rep")!;
 record.managerId="mia";
 record.additionalManagerIds=["flo","flo","mia","rep2"];
 const result=normalizePersistedHcmState(seed,data,createHcmSeed(data));
 const after=result.employees.find((e)=>e.userId==="rep");
 assert.equal(after?.managerId,"mia");
 assert.deepEqual(after?.additionalManagerIds,["flo"]);
});

const shiftDate = "2026-10-30";
const shift = (id: string, startTime: string, endTime: string): HCMState["shifts"][number] => ({
 id, userId: "rep", date: shiftDate, startTime, endTime, role: "Sales", location: "Phoenix",
 status: "Published", createdBy: "mia", createdAt: "2026-10-29T20:00:00.000Z",
});
const punch = (id: string, clockIn: string): TimeEntry => ({
 id, userId: "rep", date: shiftDate, clockIn, breakMinutes: 0, source: "Web clock",
});

test("split-shift punctuality uses distinct clock-ins rather than repeating the first punch", () => {
 const hcm = { ...createHcmSeed(data), shifts: [
   shift("morning", "09:00", "12:00"),
   shift("afternoon", "14:00", "18:00"),
 ] };
 const entries = [punch("am", "09:03"), punch("pm", "14:07")];
 const evidence = shiftClockInEvidence({ ...data, timeEntries: entries }, hcm, "rep", shiftDate, shiftDate);
 const byId = new Map(evidence.map((record) => [record.id, record]));
 assert.equal(byId.get("shift-morning")?.sourceId, "am");
 assert.equal(byId.get("shift-morning")?.varianceMinutes, 3);
 assert.equal(byId.get("shift-afternoon")?.sourceId, "pm");
 assert.equal(byId.get("shift-afternoon")?.varianceMinutes, 7);
 assert.equal(averageRecordedVariance(evidence), 5);

 const morningOnly = shiftClockInEvidence({ ...data, timeEntries: [punch("am", "09:03")] }, hcm, "rep", shiftDate, shiftDate);
 const missingAfternoon = morningOnly.find((record) => record.id === "shift-afternoon");
 assert.equal(missingAfternoon?.actualTime, undefined);
 assert.equal(missingAfternoon?.varianceMinutes, undefined);
 assert.equal(missingAfternoon?.sourceId, "afternoon");

 const afternoonOnly = shiftClockInEvidence({ ...data, timeEntries: [punch("pm", "14:07")] }, hcm, "rep", shiftDate, shiftDate);
 assert.equal(afternoonOnly.find((record) => record.id === "shift-morning")?.varianceMinutes, undefined);
 assert.equal(afternoonOnly.find((record) => record.id === "shift-afternoon")?.varianceMinutes, 7);
});

test("invalid punch times cannot be used as shift punctuality evidence", () => {
 const hcm = { ...createHcmSeed(data), shifts: [shift("morning", "09:00", "12:00")] };
 const evidence = shiftClockInEvidence(
   { ...data, timeEntries: [punch("invalid", "99:99")] }, hcm, "rep", shiftDate, shiftDate,
 );
 assert.equal(evidence[0]?.actualTime, undefined);
 assert.equal(evidence[0]?.varianceMinutes, undefined);
});
