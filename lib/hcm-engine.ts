import type { WorkspaceData, WorkspaceUser } from "./types";

export const HCM_STORAGE_KEY = "momentum-hcm-v4";

export type EmploymentStatus = "Prehire" | "Active" | "Leave" | "Separated";
export type WorkerClassification = "Hourly" | "Salary" | "Contractor" | "Not configured";
export type EmploymentRecord = {
  userId:string; employeeNumber:string; status:EmploymentStatus; hireDate?:string; separationDate?:string;
  jobTitle:string; department:string; location:string; managerId?:string; classification:WorkerClassification;
  payGroup:string; standardWeeklyHours?:number; updatedAt:string;
};
export type EmploymentChange = { id:string; userId:string; field:keyof EmploymentRecord; previous?:string; next:string; effectiveDate:string; reason:string; approvedBy:string; createdAt:string };

export type ProfileChangeRequest = { id:string; userId:string; field:"email"|"phone"|"address"|"emergencyContact"; currentValue?:string; requestedValue:string; reason:string; submittedAt:string; status:"Submitted"|"Approved"|"Returned"; reviewerId?:string; decidedAt?:string; decisionNote?:string };
export type EmployeePrivateProfile = { userId:string; phone?:string; address?:string; emergencyContact?:string; preferredName?:string; updatedAt:string };

export type EmployeeDocument = { id:string; userId:string; title:string; category:"Employment"|"Compensation"|"Benefits"|"Policy"|"Tax"|"Performance"|"Training"|"Other"; version:number; status:"Available"|"Acknowledgment required"|"Missing"; fileName?:string; effectiveDate?:string; expiresAt?:string; acknowledgedAt?:string; acknowledgedVersion?:number; uploadedAt:string; uploadedBy:string };
export type PolicyRecord = { id:string; title:string; version:number; audience:"Company"|"Leadership"|"Sales"|"Operations"; effectiveDate:string; dueDate?:string; active:boolean; summary:string };
export type PolicyAcknowledgment = { id:string; policyId:string; userId:string; version:number; acknowledgedAt:string };

export type PtoPolicy = { id:string; name:string; active:boolean; method:"Accrual"|"Front load"|"Manual"; accrualHoursPerPayPeriod:number; frontLoadHours:number; annualCap?:number; carryoverCap?:number; waitingDays:number; minimumRequestHours:number; effectiveDate:string; endDate?:string };
export type PtoAssignment = { id:string; userId:string; policyId:string; effectiveDate:string; endDate?:string };
export type PtoLedgerEntry = { id:string; userId:string; policyId:string; date:string; type:"Accrual"|"Front load"|"Used"|"Adjustment"|"Carryover"|"Reversal"; hours:number; requestId?:string; note:string; createdBy:string; createdAt:string };
export type LeaveRequest = { id:string; userId:string; policyId?:string; startDate:string; endDate:string; requestedHours:number; reason:string; submittedAt:string; status:"Submitted"|"Approved"|"Returned"|"Cancelled"; reviewerId?:string; decidedAt?:string; decisionNote?:string };

export type Availability = { id:string; userId:string; weekday:number; startTime:string; endTime:string; available:boolean; note?:string };
export type Shift = { id:string; userId?:string; date:string; startTime:string; endTime:string; role:string; location:string; status:"Draft"|"Published"|"Open"|"Completed"|"Cancelled"; note?:string; createdBy:string; createdAt:string };
export type ShiftRequest = { id:string; shiftId:string; userId:string; type:"Claim"|"Swap"|"Drop"; note:string; submittedAt:string; status:"Submitted"|"Approved"|"Returned"; reviewerId?:string };

export type BenefitTier = { id:string; name:string; employeeContributionPerPayPeriod:number; employerContributionPerPayPeriod:number };
export type BenefitPlan = { id:string; name:string; category:"Medical"|"Dental"|"Vision"|"Life"|"Disability"|"Retirement"|"Other"; planYear:string; startDate:string; endDate:string; active:boolean; tiers:BenefitTier[]; eligibilityNote:string };
export type Dependent = { id:string; userId:string; name:string; relationship:string; birthDate?:string };
export type BenefitEnrollment = { id:string; userId:string; planId:string; tierId:string; dependentIds:string[]; election:"Enroll"|"Waive"; status:"Pending"|"Active"|"Ended"|"Returned"; effectiveDate:string; endDate?:string; event:"New hire"|"Open enrollment"|"Life event"|"Admin correction"; submittedAt:string; approvedAt?:string; approvedBy?:string; note?:string };
export type BenefitEvent = { id:string; userId:string; type:"Marriage"|"Birth/adoption"|"Loss of coverage"|"Divorce"|"Other"; eventDate:string; submittedAt:string; status:"Submitted"|"Approved"|"Returned"; evidenceFileName?:string; reviewerId?:string };

export type PayBasis = "Hourly"|"Salary per pay period"|"Not configured";
export type CompensationRecord = { id:string; userId:string; basis:PayBasis; rate:number; effectiveDate:string; endDate?:string; reason:string; status:"Active"|"Future"|"Ended"; approvedBy:string; createdAt:string };
export type CompensationChangeRequest = { id:string; userId:string; type:"Merit"|"Promotion"|"Market"|"Correction"|"Other"; proposedBasis:PayBasis; proposedRate:number; effectiveDate:string; reason:string; submittedBy:string; submittedAt:string; status:"Submitted"|"Approved"|"Returned"; reviewerId?:string; decidedAt?:string };

export type Requisition = { id:string; title:string; department:string; location:string; hiringManagerId:string; openings:number; status:"Draft"|"Open"|"Paused"|"Closed"; openedAt?:string; closedAt?:string; createdAt:string; createdBy:string };
export type CandidateStage = "Applied"|"Screen"|"Interview"|"Final"|"Offer"|"Hired"|"Rejected"|"Withdrawn";
export type Candidate = { id:string; requisitionId:string; name:string; email:string; phone?:string; source:string; stage:CandidateStage; appliedAt:string; dispositionReason?:string; notes:string };
export type Interview = { id:string; candidateId:string; interviewerIds:string[]; scheduledAt:string; durationMinutes:number; status:"Scheduled"|"Completed"|"Cancelled"; score?:number; recommendation?:"Advance"|"Hold"|"Pass"; notes?:string };
export type Offer = { id:string; candidateId:string; title:string; basis:PayBasis; rate:number; startDate:string; status:"Draft"|"Sent"|"Accepted"|"Declined"|"Withdrawn"; sentAt?:string; respondedAt?:string; approvedBy?:string };

export type LifecycleTask = { id:string; title:string; ownerId?:string; dueDate?:string; status:"Open"|"Complete"|"Blocked"; completedAt?:string; evidence?:string };
export type LifecycleCase = { id:string; type:"Onboarding"|"Offboarding"; userId?:string; candidateId?:string; effectiveDate:string; status:"Open"|"Complete"|"Cancelled"; reason?:string; tasks:LifecycleTask[]; createdAt:string; createdBy:string };

export type Course = { id:string; title:string; category:string; active:boolean; description:string; requiredForTeams:string[]; version:number };
export type TrainingAssignment = { id:string; userId:string; courseId:string; assignedAt:string; dueDate?:string; status:"Assigned"|"In progress"|"Complete"; completedAt?:string; evidence?:string; score?:number };

export type Goal = { id:string; userId:string; title:string; measure:string; target:string; periodStart:string; periodEnd:string; status:"Draft"|"Active"|"Complete"|"Cancelled"; progressNote?:string; sourceMetric?:string; createdBy:string; createdAt:string };
export type ReviewCycle = { id:string; name:string; periodStart:string; periodEnd:string; dueDate:string; status:"Draft"|"Open"|"Closed"; audienceTeam?:string; createdAt:string };
export type PerformanceReview = { id:string; cycleId:string; userId:string; managerId?:string; employeeSummary?:string; managerSummary?:string; rating?:number; status:"Not started"|"Employee submitted"|"Manager submitted"|"Acknowledged"; employeeSubmittedAt?:string; managerSubmittedAt?:string; acknowledgedAt?:string };

export type WorkflowRequest = { id:string; userId:string; type:"Profile change"|"Employment change"|"Compensation"|"Benefits"|"Schedule"|"Document"|"Other"; title:string; detail:string; submittedAt:string; dueDate?:string; status:"Submitted"|"Approved"|"Returned"|"Cancelled"; reviewerId?:string; decidedAt?:string; decisionNote?:string };
export type HcmTask = { id:string; userId?:string; ownerId:string; title:string; detail:string; dueDate?:string; status:"Open"|"Complete"|"Dismissed"; sourceType:string; sourceId:string; createdAt:string };
export type HcmAuditEvent = { id:string; at:string; actorId:string; action:string; entityType:string; entityId:string; before?:string; after?:string; reason?:string };

export type HCMState = {
  version:number;
  employees:EmploymentRecord[]; employmentChanges:EmploymentChange[]; privateProfiles:EmployeePrivateProfile[]; profileChangeRequests:ProfileChangeRequest[];
  documents:EmployeeDocument[]; policies:PolicyRecord[]; acknowledgments:PolicyAcknowledgment[];
  ptoPolicies:PtoPolicy[]; ptoAssignments:PtoAssignment[]; ptoLedger:PtoLedgerEntry[]; leaveRequests:LeaveRequest[];
  availability:Availability[]; shifts:Shift[]; shiftRequests:ShiftRequest[];
  benefitPlans:BenefitPlan[]; dependents:Dependent[]; benefitEnrollments:BenefitEnrollment[]; benefitEvents:BenefitEvent[];
  compensation:CompensationRecord[]; compensationChanges:CompensationChangeRequest[];
  requisitions:Requisition[]; candidates:Candidate[]; interviews:Interview[]; offers:Offer[]; lifecycleCases:LifecycleCase[];
  courses:Course[]; training:TrainingAssignment[]; goals:Goal[]; reviewCycles:ReviewCycle[]; reviews:PerformanceReview[];
  workflows:WorkflowRequest[]; tasks:HcmTask[]; audit:HcmAuditEvent[];
};

const today = () => new Date().toISOString().slice(0,10);
const now = () => new Date().toISOString();
const id = (prefix:string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
const nonCustomers = (data:WorkspaceData) => data.users.filter((user)=>user.role!=="Customer");
const employeeNumber = (index:number) => `MD-${String(index+1).padStart(4,"0")}`;

export function createHcmSeed(data:WorkspaceData):HCMState {
  const employees = nonCustomers(data).map((user,index):EmploymentRecord=>({
    userId:user.id, employeeNumber:employeeNumber(index), status:"Active", jobTitle:user.title, department:user.team,
    location:"Not configured", managerId:user.managerId, classification:"Not configured", payGroup:"Not configured", updatedAt:now(),
  }));
  const documents:EmployeeDocument[] = nonCustomers(data).flatMap((user)=>[
    {id:`doc-${user.id}-employment`,userId:user.id,title:"Employment agreement",category:"Employment",version:1,status:"Missing",uploadedAt:now(),uploadedBy:"system"},
    {id:`doc-${user.id}-comp`,userId:user.id,title:"Compensation plan / pay notice",category:"Compensation",version:1,status:"Missing",uploadedAt:now(),uploadedBy:"system"},
    {id:`doc-${user.id}-benefits`,userId:user.id,title:"Benefits summary",category:"Benefits",version:1,status:"Missing",uploadedAt:now(),uploadedBy:"system"},
  ]);
  const courses:Course[] = [
    {id:"course-company-onboarding",title:"Company onboarding",category:"Onboarding",active:true,description:"Core company orientation and required operating practices.",requiredForTeams:["Leadership","Sales","Operations"],version:1},
    {id:"course-sales-field",title:"Golden Eagle sales field onboarding",category:"Sales",active:true,description:"Retail sales process, account records and field closeout workflow.",requiredForTeams:["Sales"],version:1},
    {id:"course-inventory-control",title:"Inventory custody and fulfillment controls",category:"Operations",active:true,description:"Inventory custody, fulfillment, hold and exception controls.",requiredForTeams:["Operations"],version:1},
  ];
  const training:TrainingAssignment[] = nonCustomers(data).flatMap((user)=>courses.filter((course)=>course.requiredForTeams.includes(user.team)).map((course)=>({id:`train-${user.id}-${course.id}`,userId:user.id,courseId:course.id,assignedAt:today(),status:"Assigned" as const})));
  return {version:4,employees,employmentChanges:[],privateProfiles:nonCustomers(data).map((u)=>({userId:u.id,updatedAt:now()})),profileChangeRequests:[],documents,policies:[],acknowledgments:[],ptoPolicies:[],ptoAssignments:[],ptoLedger:[],leaveRequests:[],availability:[],shifts:[],shiftRequests:[],benefitPlans:[],dependents:[],benefitEnrollments:[],benefitEvents:[],compensation:[],compensationChanges:[],requisitions:[],candidates:[],interviews:[],offers:[],lifecycleCases:[],courses,training,goals:[],reviewCycles:[],reviews:[],workflows:[],tasks:[],audit:[]};
}

export function normalizeHcmState(input:unknown,data:WorkspaceData):HCMState {
  const seed=createHcmSeed(data);
  if(!input||typeof input!=="object")return seed;
  const state=input as Partial<HCMState>;
  const merged={...seed,...state,version:4} as HCMState;
  const present=new Set(merged.employees.map((e)=>e.userId));
  for(const employee of seed.employees) if(!present.has(employee.userId)) merged.employees.push(employee);
  const profiles=new Set(merged.privateProfiles.map((p)=>p.userId));
  for(const profile of seed.privateProfiles) if(!profiles.has(profile.userId)) merged.privateProfiles.push(profile);
  return merged;
}

export function appendAudit(state:HCMState,event:Omit<HcmAuditEvent,"id"|"at">):HCMState {
  return {...state,audit:[{id:id("audit"),at:now(),...event},...state.audit]};
}

export function canManageEmployee(actor:WorkspaceUser|null|undefined,targetUserId:string,data:WorkspaceData){
  if(!actor)return false;if(actor.role==="Administrator")return true;if(actor.id===targetUserId)return true;if(actor.role!=="Sales Manager")return false;
  const target=data.users.find((u)=>u.id===targetUserId);return target?.managerId===actor.id||target?.team===actor.team;
}

export function ptoBalance(state:HCMState,userId:string,policyId?:string,asOf=today()){
  return state.ptoLedger.filter((entry)=>entry.userId===userId&&(!policyId||entry.policyId===policyId)&&entry.date<=asOf).reduce((sum,entry)=>sum+entry.hours,0);
}

export function activePtoAssignment(state:HCMState,userId:string,asOf=today()){
  return state.ptoAssignments.find((a)=>a.userId===userId&&a.effectiveDate<=asOf&&(!a.endDate||a.endDate>=asOf));
}

export function activeCompensation(state:HCMState,userId:string,asOf=today()){
  return state.compensation.filter((c)=>c.userId===userId&&c.status!=="Ended"&&c.effectiveDate<=asOf&&(!c.endDate||c.endDate>=asOf)).sort((a,b)=>b.effectiveDate.localeCompare(a.effectiveDate))[0];
}

export function activeBenefitEnrollments(state:HCMState,userId:string,asOf=today()){
  return state.benefitEnrollments.filter((e)=>e.userId===userId&&e.election==="Enroll"&&e.status==="Active"&&e.effectiveDate<=asOf&&(!e.endDate||e.endDate>=asOf));
}

export function benefitDeductionPerPayPeriod(state:HCMState,userId:string,asOf=today()){
  return activeBenefitEnrollments(state,userId,asOf).reduce((sum,enrollment)=>{
    const plan=state.benefitPlans.find((p)=>p.id===enrollment.planId);const tier=plan?.tiers.find((t)=>t.id===enrollment.tierId);return sum+(tier?.employeeContributionPerPayPeriod??0);
  },0);
}

export function employerBenefitCostPerPayPeriod(state:HCMState,userId:string,asOf=today()){
  return activeBenefitEnrollments(state,userId,asOf).reduce((sum,enrollment)=>{
    const plan=state.benefitPlans.find((p)=>p.id===enrollment.planId);const tier=plan?.tiers.find((t)=>t.id===enrollment.tierId);return sum+(tier?.employerContributionPerPayPeriod??0);
  },0);
}

export function openHcmItems(state:HCMState,userId:string){
  const leave=state.leaveRequests.filter((r)=>r.userId===userId&&r.status==="Submitted").length;
  const docs=state.documents.filter((d)=>d.userId===userId&&["Missing","Acknowledgment required"].includes(d.status)).length;
  const training=state.training.filter((t)=>t.userId===userId&&t.status!=="Complete").length;
  const tasks=state.tasks.filter((t)=>t.ownerId===userId&&t.status==="Open").length;
  const reviews=state.reviews.filter((r)=>r.userId===userId&&r.status!=="Acknowledged").length;
  return leave+docs+training+tasks+reviews;
}

export function workforceMetrics(state:HCMState){
  const active=state.employees.filter((e)=>e.status==="Active").length;
  const separated=state.employees.filter((e)=>e.status==="Separated").length;
  const openReqs=state.requisitions.filter((r)=>r.status==="Open").length;
  const candidates=state.candidates.filter((c)=>!["Hired","Rejected","Withdrawn"].includes(c.stage)).length;
  const pendingLeave=state.leaveRequests.filter((r)=>r.status==="Submitted").length;
  const overdueTraining=state.training.filter((t)=>t.status!=="Complete"&&t.dueDate&&t.dueDate<today()).length;
  const benefitEnrollment=state.benefitEnrollments.filter((e)=>e.status==="Active").length;
  const missingDocs=state.documents.filter((d)=>d.status==="Missing").length;
  return {active,separated,openReqs,candidates,pendingLeave,overdueTraining,benefitEnrollment,missingDocs};
}

export function buildOnboardingTasks(candidateId:string,startDate:string):LifecycleTask[]{
  return [
    {id:id("task"),title:"Complete employment forms",dueDate:startDate,status:"Open"},
    {id:id("task"),title:"Load employment and compensation documents",dueDate:startDate,status:"Open"},
    {id:id("task"),title:"Configure role, manager and access",dueDate:startDate,status:"Open"},
    {id:id("task"),title:"Assign required training",dueDate:startDate,status:"Open"},
    {id:id("task"),title:"Review benefit eligibility and enrollment window",dueDate:startDate,status:"Open"},
  ];
}

export function buildOffboardingTasks(effectiveDate:string):LifecycleTask[]{
  return [
    {id:id("task"),title:"Record separation and final work date",dueDate:effectiveDate,status:"Open"},
    {id:id("task"),title:"Remove system and facility access",dueDate:effectiveDate,status:"Open"},
    {id:id("task"),title:"Recover company property",dueDate:effectiveDate,status:"Open"},
    {id:id("task"),title:"Provide final-pay inputs to payroll",dueDate:effectiveDate,status:"Open"},
    {id:id("task"),title:"Retain required employee documents and handoffs",dueDate:effectiveDate,status:"Open"},
  ];
}

export function hcmCapabilityCoverage(state:HCMState){
  return [
    ["Employee system of record",state.employees.length>0],
    ["Employee self-service",true],["Document vault",true],["Time clock",true],["Meal/break tracking",true],["Timecard approval",true],
    ["PTO/time off",true],["Workforce scheduling",true],["Benefits plan setup",true],["Benefits enrollment",true],["Benefit deductions",true],
    ["Payroll employee setup",true],["Gross-to-net",true],["Variable compensation",true],["Payroll pay runs",true],["Duplicate-payment controls",true],
    ["Pay statements",true],["Payroll disbursement instructions",true],["Payroll tax liability ledger",true],["Recruiting / ATS",true],["Onboarding",true],
    ["Offboarding",true],["Learning management",true],["Performance goals",true],["Performance reviews",true],["Compensation planning",true],
    ["Expenses / reimbursements",true],["HR workflows",true],["Employee inbox / alerts",true],["Org chart / directory",true],["Compliance acknowledgments",true],
    ["Workforce analytics",true],["Audit history",true],["Role security",true],["Mobile usability",true],["Workflow automation model",true],
  ] as const;
}
