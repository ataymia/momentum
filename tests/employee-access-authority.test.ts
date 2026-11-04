import test from "node:test";
import assert from "node:assert/strict";
import { employeeEntryDecision, mayTransitionAccountState } from "../lib/employee-access-authority";
import { visibleActiveEmployees } from "../lib/employee-directory-visibility";
import { hrWorkspaceOverview } from "../lib/hr-workspace-overview";
import { createHcmSeed } from "../lib/hcm-engine";
import type { Timecard } from "../lib/types";
import { createIdentityProvisioningSeed, normalizeIdentityProvisioningState } from "../lib/identity-provisioning";
import type { WorkspaceData,WorkspaceUser } from "../lib/types";

const user=(id:string,employmentStatus:"Active"|"Separated"="Active")=>({
 id,name:id,role:"Sales Representative",team:"Sales",email:`${id}@momentum.test`,
 initials:"SR",title:"Rep",accent:"#123456",employmentStatus,
} as WorkspaceUser);
const users=[user("matt"),user("former","Separated"),user("previously-marked"),user("new")];
const data={users} as WorkspaceData;

test("missing or invalid HR records never auto-suspend a production identity",()=>{
 for(const raw of [undefined,null,{}, {version:1,records:[],drafts:[]}]){
  const state=normalizeIdentityProvisioningState(raw,data);
  assert.ok(state.records.every(record=>record.state!=="Suspended"),"synthetic suspension must not be created");
  assert.equal(employeeEntryDecision({production:true,role:"Sales Representative",firebaseAccountState:"Active",onboardingState:state.records[0]?.state}),"Workspace");
 }
 const seed=createIdentityProvisioningSeed(data);
 assert.equal(seed.records.find(x=>x.userId==="matt")?.state,"Onboarding");
});

test("Administrator activated account is not restricted by stale HR status",()=>{
 for(const onboardingState of ["Suspended","Separated","Onboarding","Password change required",undefined] as const){
  assert.equal(employeeEntryDecision({production:true,role:"Sales Representative",firebaseAccountState:"Active",onboardingState}),"Workspace");
 }
});
test("Firebase suspension, separation or missing authorization always blocks production entry",()=>{
 for(const state of ["Suspended","Separated",undefined] as const){
  assert.equal(employeeEntryDecision({production:true,role:"Sales Representative",firebaseAccountState:state,onboardingState:"Active"}),"Unavailable");
 }
 assert.equal(employeeEntryDecision({production:true,role:"Sales Representative",firebaseAccountState:"Onboarding",onboardingState:"Active"}),"Onboarding");
 assert.equal(employeeEntryDecision({production:false,role:"Sales Representative",onboardingState:"Active"}),"Workspace");
 assert.equal(employeeEntryDecision({production:false,role:"Sales Representative",onboardingState:"Suspended"}),"Unavailable");
});

test("active account can only lose active access by a direct Administrator suspension or separation",()=>{
 for(const nextState of ["Onboarding","Pending approval","Password change required","Suspended","Separated"] as const){
  assert.equal(mayTransitionAccountState({currentState:"Active",nextState,adminInitiated:false}),false);
 }
 assert.equal(mayTransitionAccountState({currentState:"Active",nextState:"Suspended",adminInitiated:true}),true);
 assert.equal(mayTransitionAccountState({currentState:"Active",nextState:"Separated",adminInitiated:true}),true);
 assert.equal(mayTransitionAccountState({currentState:"Active",nextState:"Onboarding",adminInitiated:true}),false);
});

test("former employees vanish from active directory but remain in historical identity source",()=>{
 const directory=visibleActiveEmployees(users,{"matt":{accountState:"Active"},"former":{accountState:"Separated"},"previously-marked":{accountState:"Separated"},"new":{accountState:"Onboarding"}});
 assert.deepEqual(directory.map(x=>x.id),["matt","new"]);
 assert.equal(users.length,4,"source histories must not be deleted");
 assert.deepEqual(visibleActiveEmployees(users,{"former":{accountState:"Active"},"previously-marked":{accountState:"Active"}}).map(x=>x.id),["matt","former","previously-marked","new"],"Firebase Active overrides stale HR separation");
});

test("HR home scopes every work-queue count and assigned task to the viewer",()=>{
 const admin={...user("admin"),role:"Administrator"} as WorkspaceUser;
 const staff=[admin,user("matt"),user("new"),user("former","Separated")];
 const hcm=createHcmSeed({users:staff} as WorkspaceData);
 hcm.leaveRequests=[
  {id:"leave-matt",userId:"matt",startDate:"2026-11-10",endDate:"2026-11-10",requestedHours:8,reason:"Private",submittedAt:"2026-11-03",status:"Submitted"},
  {id:"leave-new",userId:"new",startDate:"2026-11-10",endDate:"2026-11-10",requestedHours:8,reason:"Private",submittedAt:"2026-11-03",status:"Submitted"},
  {id:"leave-former",userId:"former",startDate:"2026-11-10",endDate:"2026-11-10",requestedHours:8,reason:"Private",submittedAt:"2026-11-03",status:"Submitted"},
 ];
 hcm.training=[{id:"training-new",userId:"new",courseId:"course",assignedAt:"2026-11-03",status:"Assigned"}];
 hcm.documents=[
  {id:"doc-new",userId:"new",title:"Form",category:"Employment",version:1,status:"Missing",uploadedAt:"2026-11-03",uploadedBy:"system"},
  {id:"doc-former",userId:"former",title:"Form",category:"Employment",version:1,status:"Missing",uploadedAt:"2026-11-03",uploadedBy:"system"},
 ];
 hcm.lifecycleCases=[
  {id:"onboarding-new",type:"Onboarding",userId:"new",effectiveDate:"2026-11-03",status:"Open",tasks:[],createdAt:"2026-11-03",createdBy:"admin"},
  {id:"onboarding-former",type:"Onboarding",userId:"former",effectiveDate:"2026-11-03",status:"Open",tasks:[],createdAt:"2026-11-03",createdBy:"admin"},
 ];
 hcm.profileChangeRequests=[{id:"profile-new",userId:"new",field:"phone",requestedValue:"withheld",reason:"Private",submittedAt:"2026-11-03",status:"Submitted"}];
 hcm.workflows=[{id:"workflow-new",userId:"new",type:"Document",title:"Private",detail:"Private",submittedAt:"2026-11-03",status:"Submitted"}];
 hcm.reviews=[{id:"review-new",cycleId:"cycle",userId:"new",status:"Employee submitted"}];
 hcm.tasks=[
  {id:"task-matt",ownerId:"matt",title:"Own task",detail:"Private",status:"Open",sourceType:"HR",sourceId:"1",createdAt:"2026-11-03"},
  {id:"task-new",ownerId:"new",title:"Other task",detail:"Private",status:"Open",sourceType:"HR",sourceId:"2",createdAt:"2026-11-03"},
 ];
 const timecards:Timecard[]=[
  {id:"card-matt",userId:"matt",weekStart:"2026-11-01",weekEnd:"2026-11-07",status:"Submitted",attested:true},
  {id:"card-new",userId:"new",weekStart:"2026-11-01",weekEnd:"2026-11-07",status:"Submitted",attested:true},
  {id:"card-former",userId:"former",weekStart:"2026-11-01",weekEnd:"2026-11-07",status:"Submitted",attested:true},
 ];
 const project=(viewer:WorkspaceUser|null)=>hrWorkspaceOverview({viewer,users:staff,hcm,timecards});
 const adminView=project(admin);
 assert.deepEqual(adminView.visibleEmployees.map(x=>x.id),["admin","matt","new"]);
 assert.equal(adminView.submittedTimecards,2);
 assert.equal(adminView.submittedLeave,2);
 assert.equal(adminView.documentsNeedingAttention,1);
 assert.equal(adminView.openOnboarding,1);
 assert.equal(adminView.pendingProfileChanges,1);
 assert.equal(adminView.pendingWorkflows,1);
 assert.equal(adminView.performanceForReview,1);
 assert.equal(adminView.incompleteTraining,1);
 assert.deepEqual(adminView.assignedTasks,[]);
 const repView=project(staff[1]);
 assert.deepEqual(repView.visibleEmployees.map(x=>x.id),["matt"]);
 assert.equal(repView.submittedTimecards,1);
 assert.equal(repView.submittedLeave,1);
 assert.equal(repView.incompleteTraining,0);
 assert.equal(repView.documentsNeedingAttention,0);
 assert.equal(repView.openOnboarding,0);
 assert.equal(repView.pendingProfileChanges,0);
 assert.equal(repView.pendingWorkflows,0);
 assert.equal(repView.performanceForReview,0);
 assert.deepEqual(repView.assignedTasks.map(x=>x.id),["task-matt"]);
 assert.equal(project({...staff[2],role:"Customer"}).visibleEmployees.length,0);
 assert.equal(project(null).submittedLeave,0);
});

test("authoritative Firebase active access retains an employee even with stale local separation",()=>{
 const admin={...user("admin"),role:"Administrator"} as WorkspaceUser;
 const stale=user("matt","Separated");
 const users=[admin,stale];
 const hcm=createHcmSeed({users} as WorkspaceData);
 const withoutAccess=hrWorkspaceOverview({viewer:admin,users,hcm,timecards:[]});
 assert.deepEqual(withoutAccess.visibleEmployees.map(x=>x.id),["admin"]);
 const withAccess=hrWorkspaceOverview({viewer:admin,users,hcm,timecards:[],accessRecords:{matt:{accountState:"Active"}}});
 assert.deepEqual(withAccess.visibleEmployees.map(x=>x.id),["admin","matt"]);
 assert.equal(users.length,2,"HR projection does not erase historical identity records");
});
