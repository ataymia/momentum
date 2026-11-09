import assert from "node:assert/strict";
import test from "node:test";
import { appointmentConflict, isValidAppointmentSlot } from "../lib/appointment-scheduling";
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

test("appointment slots require real dates, valid 24-hour times, and same-day end boundaries",()=>{
  const valid={date:"2028-02-29",startTime:"23:30",duration:30};
  assert.equal(isValidAppointmentSlot(valid),true);
  for(const date of ["2026-02-29","2026-04-31","2026-13-01","2026-1-01","not-a-date"]){
    assert.equal(isValidAppointmentSlot({...valid,date}),false,date);
  }
  for(const startTime of ["24:00","12:60","99:00","9:30","12:3","bad"]){
    assert.equal(isValidAppointmentSlot({...valid,startTime}),false,startTime);
  }
  for(const duration of [0,-1,0.5,31,Number.NaN,Number.POSITIVE_INFINITY]){
    assert.equal(isValidAppointmentSlot({...valid,duration}),false,String(duration));
  }
  assert.equal(isValidAppointmentSlot({...valid,date:"2026-10-24",startTime:"00:00",duration:1440}),true);
});

test("invalid requests cannot bypass validation and legacy midnight overlaps remain protected",()=>{
  const existing=[appointment({date:"2026-10-24",startTime:"23:30",duration:60})];
  assert.equal(appointmentConflict(existing,{ownerId:"rep",date:"2026-10-24",startTime:"23:45",duration:15})?.id,"a1");
  assert.equal(appointmentConflict(existing,{ownerId:"rep",date:"2026-10-24",startTime:"24:00",duration:15}),undefined);
  assert.equal(appointmentConflict(existing,{ownerId:"rep",date:"2026-10-24",startTime:"23:45",duration:30}),undefined);
});
