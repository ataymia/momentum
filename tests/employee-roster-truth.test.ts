import test from "node:test";
import assert from "node:assert/strict";
import {employeeRosterTruth} from "../lib/employee-roster-truth";
import {visibleActiveEmployees} from "../lib/employee-directory-visibility";
import type {WorkspaceUser} from "../lib/types";
const user={id:"rep-1",role:"Sales Representative",employmentStatus:"Active",name:"Rep"} as WorkspaceUser;
test("HR and IAM disagreement never displays an active worker without review",()=>{
 assert.equal(employeeRosterTruth(user,{status:"Active"},{accountState:"Active"},true).status,"Active");
 const separated=employeeRosterTruth(user,{status:"Separated"},{accountState:"Active"},true);
 assert.equal(separated.status,"Separated");assert.equal(separated.needsReconciliation,true);
 assert.equal(employeeRosterTruth(user,{status:"Active"},{accountState:"Separated"},true).status,"Separated");
 assert.equal(employeeRosterTruth(user,{status:"Active"},{accountState:"Suspended"},true).status,"Suspended");
 assert.equal(employeeRosterTruth(user,{status:"Active"},undefined,true).status,"Unverified");
 assert.equal(employeeRosterTruth(user,{status:"Prehire"},{accountState:"Active"},true).needsReconciliation,true);
 assert.equal(employeeRosterTruth(user,{status:"Leave"},{accountState:"Active"},true).status,"Leave");
});
test("operational directory excludes separated HCM records even if identity is Active",()=>{
 const states={"rep-1":{accountState:"Active" as const}};
 assert.equal(visibleActiveEmployees([user],states).length,1);
 assert.equal(visibleActiveEmployees([user],states,[{userId:"rep-1",status:"Separated"}]).length,0);
 assert.equal(visibleActiveEmployees([user],states,[{userId:"rep-1",status:"Prehire"}]).length,0);
 assert.equal(visibleActiveEmployees([user],states,[{userId:"rep-1",status:"Active"}]).length,1);
});
