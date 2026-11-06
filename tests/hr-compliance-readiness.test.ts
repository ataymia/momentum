import assert from "node:assert/strict";
import test from "node:test";
import {hiringReadiness,requiredForms} from "../lib/hr-compliance-readiness";
import type {EmployeeRecord,EmployeeDocument} from "../lib/hcm-engine";
const employment=(classification:EmployeeRecord["classification"]):EmployeeRecord=>({userId:"emp-1",employeeNumber:"E001",status:"Active",jobTitle:"Test",department:"Operations",location:"Phoenix",classification,payGroup:"Not configured",updatedAt:"2026-11-06T17:00:00.000Z",hireDate:"2026-11-09"});
test("unverified classifications never receive an assumed federal or Arizona form package",()=>{
 assert.deepEqual(requiredForms("Not configured"),[]);
 assert.deepEqual(requiredForms("Contractor"),["W-9"]);
 assert.deepEqual(requiredForms("Hourly"),["I-9","W-4","Arizona A-4"]);
 const r=hiringReadiness(employment("Not configured"),[]);
 assert.equal(r.productionReady,false);
 assert(r.blockers.some(b=>b.includes("classification")));
});
test("metadata-only records do not certify signed tax forms",()=>{
 const doc:EmployeeDocument={id:"d1",userId:"emp-1",title:"Form W-4",category:"Tax",status:"Available",version:1,uploadedAt:"2026-11-06T17:00:00.000Z",uploadedBy:"admin"};
 const r=hiringReadiness(employment("Hourly"),[doc]);
 assert.equal(r.productionReady,false);
 assert.equal(r.formEvidence.find(f=>f.kind==="W-4")?.status,"Missing secure verification");
 assert(r.blockers.some(b=>b.includes("Section 2")));
 assert.equal(r.retentionReviewDate,"2029-11-09");
});
