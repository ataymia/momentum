import test from "node:test";
import assert from "node:assert/strict";
import { employeeEntryDecision, mayTransitionAccountState } from "../lib/employee-access-authority";
import { visibleActiveEmployees } from "../lib/employee-directory-visibility";
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
