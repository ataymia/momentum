import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildPersistenceScope, type UserAccessRecord } from "../lib/firebase-access";
import { DOMAIN_SPECS, assembleState, domainDocuments, parseDocPath, shardState, sharedDocPath, userDocPath } from "../lib/firestore-domains";
import { mergeDocument } from "../lib/persistence";
import type { WorkspaceUser } from "../lib/types";

const config=readFileSync(new URL("../lib/firebase-config.ts",import.meta.url),"utf8");
const auth=readFileSync(new URL("../lib/firebase-auth-rest.ts",import.meta.url),"utf8");
const adminProvisioning=readFileSync(new URL("../lib/firebase-admin-provisioning.ts",import.meta.url),"utf8");
const firestore=readFileSync(new URL("../lib/firebase-firestore-rest.ts",import.meta.url),"utf8");
const firestoreRules=readFileSync(new URL("../firestore.rules",import.meta.url),"utf8");
const storageRules=readFileSync(new URL("../storage.rules",import.meta.url),"utf8");
const loginScreen=readFileSync(new URL("../components/login-screen.tsx",import.meta.url),"utf8");
const gate=readFileSync(new URL("../components/firebase-gate.tsx",import.meta.url),"utf8");

const user=(id:string,role:WorkspaceUser["role"],team:WorkspaceUser["team"],managerId?:string):WorkspaceUser=>({id,name:id,firstName:id,email:`${id}@example.com`,initials:"XX",title:role,role,team,managerId,accent:"#000"});
const access=(uid:string,role:UserAccessRecord["role"],team:UserAccessRecord["team"],extra:Partial<UserAccessRecord>={}):UserAccessRecord=>({uid,email:`${uid}@example.com`,role,team,accountState:"Active",updatedAt:"2026-01-01T00:00:00.000Z",updatedBy:"test",...extra});
const directory=[user("admin","Administrator","Leadership"),user("mgr","Sales Manager","Sales","admin"),user("rep","Sales Representative","Sales","mgr"),user("rep2","Sales Representative","Sales","mgr"),user("ops","Operations","Operations","admin")];

test("Firebase browser boundary uses only public web configuration and never embeds a service credential",()=>{
  assert.match(config,/NEXT_PUBLIC_FIREBASE_API_KEY/);
  assert.match(config,/NEXT_PUBLIC_FIREBASE_PROJECT_ID/);
  for(const source of [config,auth,adminProvisioning,firestore])assert.doesNotMatch(source,/private_key|service_account|client_email/i);
});

test("Firebase Authentication supports sign-in, refresh, password rotation, verification and reset without public self-signup",()=>{
  assert.match(auth,/accounts:signInWithPassword/);
  assert.match(auth,/securetoken\.googleapis\.com\/v1\/token/);
  assert.match(auth,/accounts:update/);
  assert.match(auth,/requestType:"VERIFY_EMAIL"/);
  assert.match(auth,/requestType:"PASSWORD_RESET"/);
  assert.doesNotMatch(auth,/accounts:signUp/);
  assert.doesNotMatch(loginScreen,/signUp|createFirebaseIdentity/);
  assert.doesNotMatch(gate,/createFirebaseIdentity|accounts:signUp/);
});

test("Identity creation is Administrator-only and never persists the new employee's token",()=>{
  assert.match(adminProvisioning,/export async function createFirebaseIdentityAsAdministrator/);
  assert.match(adminProvisioning,/returnSecureToken:false/);
  assert.doesNotMatch(adminProvisioning,/persistFirebaseSession|sessionStorage/);
});

test("Firestore REST requests use Firebase ID tokens and write with preconditions so Security Rules and concurrency stay authoritative",()=>{
  assert.match(firestore,/authorization:`Bearer \$\{session\.idToken\}`/);
  assert.match(firestore,/firestore\.googleapis\.com\/v1\/projects/);
  assert.match(firestore,/:commit`/);
  assert.match(firestore,/currentDocument:\{updateTime:write\.updateTime\}/);
  assert.match(firestore,/currentDocument:\{exists:false\}/);
});

test("Firestore rules are deny-by-default, gate Administrator bootstrap on verified e-mail, and only Administrators write access records",()=>{
  assert.match(firestoreRules,/match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
  assert.match(firestoreRules,/function bootstrapEmails\(\) \{ return \[[^\]]*\]; \}/);
  assert.match(firestoreRules,/request\.auth\.token\.email_verified == true/);
  assert.match(firestoreRules,/getAfter\(bootstrapPath\(\)\)\.data\.claimedBy == request\.auth\.uid/);
  assert.match(firestoreRules,/match \/userAccess\/\{uid\} \{[\s\S]*?allow update: if isAdmin\(\) && uid != request\.auth\.uid/);
  assert.match(firestoreRules,/function isAdmin\(\) \{ return callerHasAccess\(\) && myAccess\(\)\.role == 'Administrator' && myAccess\(\)\.accountState == 'Active'; \}/);
});

test("Firestore rules mirror the domain specification (domain ids, per-user fields, owner-locked and manager-blocked shards)",()=>{
  const rulesDomainRead=firestoreRules.slice(firestoreRules.indexOf("function domainRead"),firestoreRules.indexOf("function domainWrite"));
  const rulesDomainWrite=firestoreRules.slice(firestoreRules.indexOf("function domainWrite"),firestoreRules.indexOf("match /domains/"));
  const perUserBlock=firestoreRules.slice(firestoreRules.indexOf("function perUserField"),firestoreRules.indexOf("function ownerLockedField"));
  const ownerLockedBlock=firestoreRules.slice(firestoreRules.indexOf("function ownerLockedField"),firestoreRules.indexOf("function managerBlockedField"));
  for(const spec of DOMAIN_SPECS){
    assert.match(rulesDomainRead,new RegExp(`domainId == '${spec.id}'`),`domainRead is missing ${spec.id}`);
    assert.match(rulesDomainWrite,new RegExp(`domainId == '${spec.id}'`),`domainWrite is missing ${spec.id}`);
    for(const [field,fieldSpec] of Object.entries(spec.fields)){
      if(!fieldSpec.userIdField)continue;
      assert.match(perUserBlock,new RegExp(`'${field}'`),`perUserField is missing ${spec.id}.${field}`);
      if(fieldSpec.selfWrite===false)assert.match(ownerLockedBlock,new RegExp(`'${field}'`),`ownerLockedField is missing ${spec.id}.${field}`);
    }
  }
  assert.match(firestoreRules,/domainId == 'identity' \|\| domainId == 'payroll' \|\| domainId == 'audit'/);
  assert.match(firestoreRules,/resource\.data\.items\[0\]\.state == 'Password change required' && request\.resource\.data\.items\[0\]\.state == 'Onboarding'/);
});

test("Storage rules keep onboarding and employee documents authenticated and private",()=>{
  assert.match(storageRules,/match \/onboardingTemplates/);
  assert.match(storageRules,/match \/employeeDocuments\/\{uid\}/);
  assert.match(storageRules,/uid == request\.auth\.uid \|\| isAdmin\(\)/);
  assert.match(storageRules,/allow read, write: if false;/);
});

test("Persistence scope limits per-user shards to self, direct reports (manager), or everyone (Administrator)",()=>{
  const admin=buildPersistenceScope(access("admin","Administrator","Leadership"),directory);
  const manager=buildPersistenceScope(access("mgr","Sales Manager","Sales",{managerId:"admin"}),directory);
  const rep=buildPersistenceScope(access("rep","Sales Representative","Sales",{managerId:"mgr"}),directory);
  assert.deepEqual([...admin.readableUserIds].sort(),["admin","mgr","ops","rep","rep2"]);
  assert.deepEqual([...manager.readableUserIds].sort(),["mgr","rep","rep2"]);
  assert.deepEqual([...manager.managedUserIds].sort(),["rep","rep2"]);
  assert.deepEqual([...rep.readableUserIds],["rep"]);

  const hcm=DOMAIN_SPECS.find((spec)=>spec.id==="hcm")!;
  const payroll=DOMAIN_SPECS.find((spec)=>spec.id==="payroll")!;
  const identity=DOMAIN_SPECS.find((spec)=>spec.id==="identity")!;
  const managerHcm=domainDocuments(hcm,manager).map((doc)=>doc.path);
  assert.ok(managerHcm.includes(userDocPath("rep","hcm","leaveRequests")),"manager reads reports' leave requests");
  assert.ok(!managerHcm.includes(userDocPath("rep","hcm","compensation")),"manager never reads reports' compensation");
  assert.ok(!managerHcm.includes(userDocPath("admin","hcm","privateProfiles")),"manager cannot read the Administrator's private profile");
  const repPayroll=domainDocuments(payroll,rep);
  assert.ok(repPayroll.every((doc)=>doc.path.startsWith("userDomains/rep/payroll/")&&!doc.writable),"sales reps only read their own payroll shards and cannot write them");
  assert.deepEqual(domainDocuments(identity,rep).map((doc)=>doc.path),[userDocPath("rep","identity","records")]);
  const repCompensation=domainDocuments(hcm,rep).find((doc)=>doc.path===userDocPath("rep","hcm","compensation"));
  assert.equal(repCompensation?.writable,false,"an employee cannot author their own compensation");
  const repProfile=domainDocuments(hcm,rep).find((doc)=>doc.path===userDocPath("rep","hcm","privateProfiles"));
  assert.equal(repProfile?.writable,true);
  assert.equal(domainDocuments(hcm,rep).find((doc)=>doc.path===sharedDocPath("hcm","requisitions")),undefined,"recruiting pipeline is hidden from reps");
});

test("Domain sharding round-trips engine state and keeps the employee directory out of the workspace blob",()=>{
  const workspace=DOMAIN_SPECS.find((spec)=>spec.id==="workspace")!;
  const state={users:[{id:"u1"}],accounts:[{id:"a1"}],timeEntries:[{id:"t1",userId:"rep"},{id:"t2",userId:"mgr"}],timecards:[],customers:[],activities:[],appointments:[],orders:[],placements:[],inventory:[],approvals:[],notifications:[],bulletins:[],territories:[]};
  const shards=shardState(workspace,state);
  assert.equal(shards.has(sharedDocPath("workspace","users")),false);
  assert.deepEqual(shards.get(userDocPath("rep","workspace","timeEntries")),{items:[{id:"t1",userId:"rep"}]});
  assert.deepEqual(shards.get(sharedDocPath("workspace","timeEntries")),{items:[]});
  const assembled=assembleState(workspace,new Map([...shards.entries()]))!;
  assert.deepEqual(assembled.accounts,[{id:"a1"}]);
  assert.deepEqual(new Set(assembled.timeEntries as unknown[]),new Set(state.timeEntries));
  assert.equal("users" in assembled,false);
  assert.deepEqual(parseDocPath(userDocPath("rep","workspace","timeEntries")),{uid:"rep",domainId:"workspace",field:"timeEntries"});
  assert.equal(assembleState(workspace,new Map()),null);
});

test("Three-way document merge keeps concurrent additions and local edits without resurrecting local deletions",()=>{
  const base={items:[{id:"1",v:"a"},{id:"2",v:"b"},{id:"3",v:"c"}]};
  const local={items:[{id:"4",v:"local-new"},{id:"1",v:"a-edited"},{id:"3",v:"c"}]};
  const remote={items:[{id:"5",v:"remote-new"},{id:"1",v:"a"},{id:"2",v:"b"},{id:"3",v:"c-remote"}]};
  const merged=mergeDocument(base,local,remote) as {items:Array<{id:string;v:string}>};
  assert.deepEqual(merged.items.map((item)=>item.id),["5","4","1","3"]);
  assert.equal(merged.items.find((item)=>item.id==="1")?.v,"a-edited");
  assert.equal(merged.items.find((item)=>item.id==="3")?.v,"c-remote");
  const root=mergeDocument({data:{version:1,accountPatches:{a:{tier:"A"},b:{tier:"B"}}}},{data:{version:1,accountPatches:{a:{tier:"C"},b:{tier:"B"}}}},{data:{version:1,accountPatches:{a:{tier:"A"},b:{tier:"B",note:"remote"},c:{tier:"A"}}}}) as {data:{accountPatches:Record<string,unknown>}};
  assert.deepEqual(root.data.accountPatches,{a:{tier:"C"},b:{tier:"B",note:"remote"},c:{tier:"A"}});
});
