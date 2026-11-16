import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {payrollTaxRoute,calculateBonusLine,createPayrollSeed} from "../lib/payroll-engine";
import type {HCMState} from "../lib/hcm-engine";
const make=(classification:"Contractor"|"Hourly"|"Salary"|"Not configured")=>
 ({employees:[{userId:"staff-1",classification}]} as HCMState);
test("independent contractors are never treated as W-2 payroll subjects",()=>{
 assert.equal(payrollTaxRoute(make("Contractor"),"staff-1"),"Contractor payable");
 assert.equal(payrollTaxRoute(make("Hourly"),"staff-1"),"W-2 candidate");
 assert.equal(payrollTaxRoute(make("Salary"),"staff-1"),"W-2 candidate");
 assert.equal(payrollTaxRoute(make("Not configured"),"staff-1"),"Classification review");
 assert.equal(payrollTaxRoute(make("Hourly"),"unknown"),"Classification review");
 assert.equal(calculateBonusLine(createPayrollSeed(),make("Contractor"),
  "staff-1","2026-11-20",100,["commission-id"]),null);
 const server=readFileSync("lib/payroll-engine.ts","utf8");
 assert(server.includes('payrollTaxRoute(hcm,employeeId)!=="W-2 candidate"'));
 const screen=readFileSync("components/prototype/hr-payroll-experiences.tsx","utf8");
 assert(screen.includes("Independent contractors are excluded"));
});
