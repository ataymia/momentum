import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {DOMAIN_BY_KEY,domainDocuments,userDocPath,documentWritable} from "../lib/firestore-domains";
import type {PersistenceScope} from "../lib/firebase-access";
type Module=typeof import("../functions/src/trusted-hr-leave-validation");
const {validateTrustedLeaveRequest,validLeaveRequestId}=createRequire(import.meta.url)(
 "../functions/src/trusted-hr-leave-validation.ts") as Module;
const normal={startDate:"2026-12-02",endDate:"2026-12-04",requestedHours:16,reason:"Family obligations"};
test("R52 trusted leave accepts valid date-bounded employee requests",()=>{
 const result=validateTrustedLeaveRequest(normal);
 assert.equal(result.ok,true);
 if(result.ok)assert.equal(result.value.reason,"Family obligations");
 for(const invalid of [
  {...normal,startDate:"2026-02-30"},{...normal,endDate:"2026-12-01"},
  {...normal,endDate:"2029-01-01"},{...normal,requestedHours:0},
  {...normal,requestedHours:0.3},{...normal,requestedHours:1000},
  {...normal,reason:" "},{...normal,reason:"x".repeat(1501)},
  {...normal,requestedHours:"16"}, {...normal,reason:null},
 ])assert.equal(validateTrustedLeaveRequest(invalid).ok,false,JSON.stringify(invalid).slice(0,130));
});
test("R52 browser cannot forge HR actor, decision, timestamps or PTO assignment",()=>{
 for(const forbidden of ["userId","status","reviewerId","decidedAt","submittedAt","policyId","approvedBy","ptoBalance","managerId"]){
  assert.equal(validateTrustedLeaveRequest({...normal,[forbidden]:"spoofed"}).ok,false,forbidden);
 }
 assert.equal(validLeaveRequestId("leave-1234567890123456789"),true);
 assert.equal(validLeaveRequestId("tiny"),false);
 assert.equal(validLeaveRequestId("../admin"),false);
});
test("R52 employee cannot directly write their own HR leave shard, while admin can review",()=>{
 const spec=DOMAIN_BY_KEY.get("momentum-hcm-v4");
 assert(spec);
 const scope:PersistenceScope={uid:"rep-a",role:"Sales Representative",accountState:"Active",
  readableUserIds:new Set(["rep-a"]),managedUserIds:new Set(),supervisedBrandAmbassadorIds:new Set()};
 const own=userDocPath("rep-a","hcm","leaveRequests");
 assert.equal(domainDocuments(spec,scope).find(item=>item.path===own)?.writable,false);
 assert.equal(documentWritable(own,scope),false);
 assert.equal(documentWritable(own,{...scope,role:"Administrator"}),true);
 const rules=readFileSync("firestore.rules","utf8");
 assert.match(rules,/employmentChanges', 'leaveRequests', 'ptoAssignments/);
 const f=readFileSync("functions/src/trusted-hr-leave-request.ts","utf8");
 const endpoint=readFileSync("functions/src/index.ts","utf8");
 assert.match(f,/tx\.create\(requestRef/);
 assert.match(f,/status:"Submitted"/);
 assert.match(endpoint,/export const submitHrLeaveRequest=onRequest/);
 assert.match(endpoint,/verifyIdToken\(token,true\)/);
});
