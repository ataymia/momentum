import assert from "node:assert/strict";
import test from "node:test";
import { appointmentConflict, appointmentSlotIsValid } from "../lib/appointment-scheduling";
import type { Appointment } from "../lib/types";

const appointment=(overrides:Partial<Appointment>={}):Appointment=>({
  id:"a1",accountId:"acct",ownerId:"rep",customerId:"customer",date:"2026-10-12",startTime:"10:00",duration:30,
  type:"First visit",status:"Scheduled",objective:"Visit",location:"Phoenix",priority:"Normal",tags:[],...overrides,
});

test("overlapping active appointments conflict for the same employee",()=>{
  const existing=[appointment()];
  assert.equal(appointmentConflict(existing,{ownerId:"rep",date:"2026-10-12",startTime:"10:15",duration:30})?.id,"a1");
  assert.equal(appointmentConflict(existing,{ownerId:"rep",date:"2026-10-12",startTime:"10:30",duration:30}),undefined);
  assert.equal(appointmentConflict(existing,{ownerId:"other",date:"2026-10-12",startTime:"10:15",duration:30}),undefined);
});

test("completed work and the appointment being moved do not conflict",()=>{
  assert.equal(appointmentConflict([appointment({status:"Completed"})],{ownerId:"rep",date:"2026-10-12",startTime:"10:15",duration:30}),undefined);
  assert.equal(appointmentConflict([appointment()],{ownerId:"rep",date:"2026-10-12",startTime:"10:15",duration:30,excludeId:"a1"}),undefined);
});


test("appointment slots reject impossible dates, invalid times, and midnight overflow",()=>{
  const valid={date:"2026-10-15",startTime:"23:30",duration:30};
  assert.equal(appointmentSlotIsValid(valid),true);
  for(const invalid of [
    {...valid,date:"2026-02-30"},
    {...valid,startTime:"24:00"},
    {...valid,startTime:"10:60"},
    {...valid,startTime:"not-a-time"},
    {...valid,duration:31},
    {...valid,duration:0},
    {...valid,duration:1.5},
  ]) assert.equal(appointmentSlotIsValid(invalid),false,JSON.stringify(invalid));
});

test("conflict detection rejects invalid proposed slots without false matches",()=>{
  assert.equal(appointmentConflict([appointment()],{ownerId:"rep",date:"2026-02-30",startTime:"10:15",duration:30}),undefined);
  assert.equal(appointmentConflict([appointment()],{ownerId:"rep",date:"2026-10-12",startTime:"24:00",duration:30}),undefined);
});
