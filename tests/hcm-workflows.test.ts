import assert from "node:assert/strict";
import test from "node:test";
import { createDemoData } from "../lib/demo-data";
import {
  activeBenefitEnrollments,
  activeCompensation,
  benefitDeductionPerPayPeriod,
  buildOffboardingTasks,
  buildOnboardingTasks,
  canManageEmployee,
  createHcmSeed,
  ptoBalance,
} from "../lib/hcm-engine";

test("HCM seed creates workforce records only for non-customer users",()=>{
  const data=createDemoData();
  const hcm=createHcmSeed(data);
  assert.equal(hcm.employees.length,data.users.filter((user)=>user.role!=="Customer").length);
  assert.equal(hcm.employees.some((employee)=>employee.userId==="usr-customer"),false);
  assert.equal(hcm.employees.every((employee)=>employee.employeeNumber.startsWith("MD-")),true);
});

test("PTO balance is derived from immutable-style ledger entries",()=>{
  const data=createDemoData();
  const hcm=createHcmSeed(data);
  hcm.ptoLedger=[
    {id:"pto-1",userId:"usr-jordan",policyId:"policy-1",date:"2026-01-01",type:"Front load",hours:40,note:"front load",createdBy:"usr-mia",createdAt:"2026-01-01T12:00:00Z"},
    {id:"pto-2",userId:"usr-jordan",policyId:"policy-1",date:"2026-02-01",type:"Used",hours:-8,note:"approved leave",createdBy:"usr-mia",createdAt:"2026-02-01T12:00:00Z"},
    {id:"pto-3",userId:"usr-jordan",policyId:"policy-1",date:"2026-03-01",type:"Adjustment",hours:2,note:"correction",createdBy:"usr-mia",createdAt:"2026-03-01T12:00:00Z"},
  ];
  assert.equal(ptoBalance(hcm,"usr-jordan","policy-1","2026-03-02"),34);
  assert.equal(ptoBalance(hcm,"usr-jordan","policy-1","2026-01-15"),40);
});

test("benefit deduction is calculated from active enrollment tier, not an editable total",()=>{
  const data=createDemoData();
  const hcm=createHcmSeed(data);
  hcm.benefitPlans=[{id:"plan-1",name:"Configured medical",category:"Medical",planYear:"2026",startDate:"2026-01-01",endDate:"2026-12-31",active:true,eligibilityNote:"Configured in test",tiers:[{id:"tier-1",name:"Employee",employeeContributionPerPayPeriod:55,employerContributionPerPayPeriod:120}]}];
  hcm.benefitEnrollments=[{id:"enroll-1",userId:"usr-jordan",planId:"plan-1",tierId:"tier-1",dependentIds:[],election:"Enroll",status:"Active",effectiveDate:"2026-01-01",event:"Open enrollment",submittedAt:"2025-12-01T12:00:00Z"}];
  assert.equal(activeBenefitEnrollments(hcm,"usr-jordan","2026-06-01").length,1);
  assert.equal(benefitDeductionPerPayPeriod(hcm,"usr-jordan","2026-06-01"),55);
});

test("effective-dated compensation selects the applicable active record",()=>{
  const data=createDemoData();
  const hcm=createHcmSeed(data);
  hcm.compensation=[
    {id:"comp-old",userId:"usr-jordan",basis:"Hourly",rate:20,effectiveDate:"2026-01-01",endDate:"2026-06-30",reason:"test",status:"Ended",approvedBy:"usr-mia",createdAt:"2026-01-01T12:00:00Z"},
    {id:"comp-current",userId:"usr-jordan",basis:"Hourly",rate:24,effectiveDate:"2026-07-01",reason:"test",status:"Active",approvedBy:"usr-mia",createdAt:"2026-06-20T12:00:00Z"},
  ];
  assert.equal(activeCompensation(hcm,"usr-jordan","2026-08-01")?.rate,24);
  assert.equal(activeCompensation(hcm,"usr-jordan","2026-05-01"),undefined);
});

test("manager scope follows employee reporting relationship while administrators retain company scope",()=>{
  const data=createDemoData();
  const manager=data.users.find((user)=>user.id==="usr-avery");
  const admin=data.users.find((user)=>user.id==="usr-mia");
  assert.equal(canManageEmployee(manager,"usr-jordan",data),true);
  assert.equal(canManageEmployee(manager,"usr-elena",data),false);
  assert.equal(canManageEmployee(admin,"usr-elena",data),true);
});

test("onboarding and offboarding builders create auditable task checklists",()=>{
  const onboarding=buildOnboardingTasks("candidate-1","2026-09-01");
  const offboarding=buildOffboardingTasks("2026-09-30");
  assert.equal(onboarding.length>=5,true);
  assert.equal(offboarding.length>=5,true);
  assert.equal(onboarding.every((task)=>task.status==="Open"),true);
  assert.equal(offboarding.every((task)=>task.status==="Open"),true);
  assert.equal(onboarding.every((task)=>task.dueDate==="2026-09-01"),true);
  assert.equal(offboarding.every((task)=>task.dueDate==="2026-09-30"),true);
});
