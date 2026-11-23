import assert from "node:assert/strict";
import test from "node:test";

test("server midnight boundary closes only prior-day open punches and never rewrites employee punch evidence",async()=>{
  const mod=await import(new URL("../functions/src/workforce-retention.ts",import.meta.url).href);
  const close=mod.closePriorDayOpenPunches as (rows:Array<Record<string,unknown>>,today:string)=>
    {entries:Array<Record<string,unknown>>;closed:number};
  const rows=[
    {id:"prior",userId:"rep",date:"2026-10-19",clockIn:"08:15",clockInAt:"2026-10-19T15:15:00.000Z",breakMinutes:30,source:"Web clock"},
    {id:"midnight",userId:"rep",date:"2026-10-20",clockIn:"00:00",clockInAt:"2026-10-20T07:00:00.000Z",breakMinutes:0,source:"Web clock"},
    {id:"closed",userId:"rep",date:"2026-10-19",clockIn:"09:00",clockOut:"16:00",breakMinutes:0},
  ];
  const result=close(rows,"2026-10-20");
  assert.equal(result.closed,1);
  assert.equal(result.entries[0].clockIn,"08:15");
  assert.equal(result.entries[0].clockOut,"23:59");
  assert.equal(result.entries[0].clockOutAt,"2026-10-20T07:00:00.000Z");
  assert.match(String(result.entries[0].note),/manager\/payroll review required/);
  assert.equal(result.entries[1].clockOut,undefined);
  assert.equal(result.entries[2].clockOut,"16:00");
  assert.equal(close(result.entries,"2026-10-20").closed,0);
});
test("server location cleanup excludes old GPS and does not erase day-ten boundary",async()=>{
  const mod=await import(new URL("../functions/src/workforce-retention.ts",import.meta.url).href);
  const rows=[{id:"new",at:"2026-10-20T10:00:00-07:00"},
    {id:"old",at:"2026-10-10T23:59:00-07:00"},
    {id:"edge",at:"2026-10-11T00:01:00-07:00"}];
  assert.deepEqual(mod.retainedLocationItems(rows,"2026-10-20").map((row:{id:string})=>row.id),["new","edge"]);
});

test("midnight punch closure is role-agnostic across the entire employee workforce",async()=>{
  const mod=await import(new URL("../functions/src/workforce-retention.ts",import.meta.url).href);
  const roles=["Sales Representative","Sales Manager","Operations","Warehouse","Administrator"];
  const rows=roles.map((role,index)=>({
    id:"punch-"+index,userId:"employee-"+index,role,date:"2026-10-19",
    clockIn:"08:00",clockInAt:"2026-10-19T15:00:00.000Z",
    breakMinutes:0,source:"Web clock",
  }));
  const result=mod.closePriorDayOpenPunches(rows,"2026-10-20");
  assert.equal(result.closed,roles.length);
  assert.equal(result.entries.every((entry:{clockOut?:string;note?:string})=>
    entry.clockOut==="23:59"&&Boolean(entry.note?.includes("Automatically closed at Arizona midnight"))),true);
});
