import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {canMutatePayroll} from "../lib/payroll-release-gate";
import type {Role} from "../lib/types";
test("F04: payroll mutations are restricted to administrator in isolated local demo",()=>{
 assert.equal(canMutatePayroll("Administrator",true,"local"),true);
 assert.equal(canMutatePayroll("Administrator",true,"firestore"),false);
 assert.equal(canMutatePayroll("Administrator",false,"local"),false);
 assert.equal(canMutatePayroll("Administrator",false,"firestore"),false);
 for(const role of ["Sales Manager","Operations","Marketing","Warehouse","Sales Representative","Customer",undefined] as (Role|undefined)[]){
  assert.equal(canMutatePayroll(role,true,"local"),false);
 }
});
test("F04: payroll provider interlocks all mutators and forbids connected auto-persistence",()=>{
 const src=readFileSync("lib/payroll-context-v2.tsx","utf8");
 assert.match(src,/const isAdmin=canMutatePayroll\(currentUser\?\.role,runtime\.isDemo,momentumStorage\.mode\(\)\)/);
 assert.match(src,/if\(typeof window==="undefined"\|\|!runtime\.isDemo\|\|momentumStorage\.mode\(\)!=="local"\)return;/);
 assert.match(src,/const setRunStatus=\(.*?if\(!isAdmin\|\|!currentUser\)return false/);
 assert.match(src,/const settleDisbursement=\(.*?if\(!isAdmin\)return false/);
});

test("F05: employee-facing payroll readers receive only their own pay data",async()=>{
 const {payrollForViewer}=await import("../lib/payroll-reader-scope");
 const {createPayrollSeed}=await import("../lib/payroll-engine");
 const source={...createPayrollSeed(),
  employees:[{userId:"rep",payGroupId:"g",paymentMethod:"ACH",paymentTokenLabel:"own",active:true},{userId:"other",payGroupId:"g",paymentMethod:"ACH",paymentTokenLabel:"other",active:true}],
  runs:[{id:"run1",lines:[{employeeId:"rep",netPay:100},{employeeId:"other",netPay:900}]}],
  withholdingProfiles:[{userId:"other",federalPercent:10}],
  disbursements:[{id:"otherpay",payRunId:"run1",userId:"other",amount:900}],
  liabilities:[{id:"tax",payRunId:"run1",amount:500}]
 } as unknown as import("../lib/payroll-engine").PayrollState;
 const user={id:"rep",role:"Sales Representative"} as import("../lib/types").WorkspaceUser;
 const own=payrollForViewer(source,user);
 assert.deepEqual(own.employees.map(e=>e.userId),["rep"]);
 assert.deepEqual(own.runs[0].lines.map(l=>l.employeeId),["rep"]);
 assert.equal(own.withholdingProfiles.length,0);
 assert.equal(own.liabilities.length,0);
 assert.equal(own.disbursements.length,0);
 assert.equal(payrollForViewer(source,{id:"admin",role:"Administrator"} as import("../lib/types").WorkspaceUser),source);
 assert.equal(payrollForViewer(source,null).runs.length,0);
});
