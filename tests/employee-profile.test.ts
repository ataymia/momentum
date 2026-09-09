import assert from "node:assert/strict";
import test from "node:test";
import { createDemoData } from "../lib/demo-data";
import { createFieldTrackingSeed } from "../lib/location-tracking-engine";
import { createHcmSeed } from "../lib/hcm-engine";
import { appointmentPunctualityEvidence, averageRecordedVariance, canViewEmployeeManagementDetail, employeePresence, shiftClockInEvidence } from "../lib/employee-profile";
import type { WorkspaceUser } from "../lib/types";

test("employee presence distinguishes active field work from ordinary clock state", () => {
  const base=createDemoData();const rep=base.users.find((user)=>user.role==="Sales Representative")!;
  const data={...base,appointments:base.appointments.map((appointment,index)=>index===0?{...appointment,ownerId:rep.id,status:"Arrived" as const}:appointment)};
  assert.equal(employeePresence(data,rep.id),"In field appointment");
});

test("manager profile detail follows direct-report or explicitly managed-team scope", () => {
  const base=createDemoData();const manager=base.users.find((user)=>user.role==="Sales Manager")!;const rep=base.users.find((user)=>user.role==="Sales Representative")!;
  assert.equal(canViewEmployeeManagementDetail(manager,rep),true);
  assert.equal(canViewEmployeeManagementDetail(manager,manager),true);
  const peer:WorkspaceUser={...rep,id:"peer",name:"Peer",firstName:"Peer",email:"peer@test",initials:"P",managerId:"someone-else"};
  const strictManager={...manager,managedTeams:[]};
  assert.equal(canViewEmployeeManagementDetail(strictManager,peer),false);
  assert.equal(canViewEmployeeManagementDetail({...strictManager,managedTeams:[peer.team]},peer),true);
});

test("appointment punctuality is raw Arizona-time variance, not an invented late score", () => {
  const base=createDemoData();const rep=base.users.find((user)=>user.role==="Sales Representative")!;const appointment={...base.appointments[0],id:"apt-punctual",ownerId:rep.id,date:"2026-09-09",startTime:"10:00",type:"First visit" as const,status:"Completed" as const};
  const data={...base,appointments:[appointment]};const tracking=createFieldTrackingSeed();
  tracking.appointmentEvents.push({id:"evt-arrival",sessionId:"session",userId:rep.id,appointmentId:appointment.id,accountId:appointment.accountId,event:"Arrival verified",sampleId:"sample",latitude:33.4,longitude:-112,accuracyMeters:10,at:"2026-09-09T17:07:00.000Z",withinGeofence:true,radiusMiles:2});
  const records=appointmentPunctualityEvidence(data,tracking,rep.id,"2026-09-01","2026-09-30");
  assert.equal(records.length,1);assert.equal(records[0].actualTime,"10:07");assert.equal(records[0].varianceMinutes,7);assert.equal(averageRecordedVariance(records),7);
});

test("completed appointments with no verified arrival remain visible as missing evidence", () => {
  const base=createDemoData();const rep=base.users.find((user)=>user.role==="Sales Representative")!;const appointment={...base.appointments[0],id:"apt-missing",ownerId:rep.id,date:"2026-09-09",startTime:"10:00",type:"First visit" as const,status:"Completed" as const};
  const data={...base,appointments:[appointment]};const records=appointmentPunctualityEvidence(data,createFieldTrackingSeed(),rep.id,"2026-09-01","2026-09-30");
  assert.equal(records[0].varianceMinutes,undefined);assert.match(records[0].note,/no verified arrival/i);
});

test("shift clock-in evidence compares first daily punch to published shift start without assigning a score", () => {
  const base=createDemoData();const rep=base.users.find((user)=>user.role==="Sales Representative")!;const hcm=createHcmSeed(base);hcm.shifts=[{id:"shift-1",userId:rep.id,date:"2026-09-09",startTime:"08:00",endTime:"17:00",role:"Sales Rep",location:"Field",status:"Published",createdBy:"admin",createdAt:"2026-09-01T12:00:00Z"}];
  const data={...base,timeEntries:[{id:"te-1",userId:rep.id,date:"2026-09-09",clockIn:"08:04",clockOut:"17:00",breakMinutes:30,source:"Demo mobile" as const}]};
  const rows=shiftClockInEvidence(data,hcm,rep.id,"2026-09-01","2026-09-30");assert.equal(rows[0].varianceMinutes,4);assert.equal(rows[0].actualTime,"08:04");
});
