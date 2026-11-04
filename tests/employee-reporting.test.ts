import assert from "node:assert/strict";
import test from "node:test";
import { activeReportingManagerIds, validAdditionalManagerIds, reportingManagerCandidates, selectableReportingManagerCandidates, validSelectableAdditionalManagerIds } from "../lib/employee-reporting";
import { createHcmSeed } from "../lib/hcm-engine";
import { normalizePersistedHcmState } from "../lib/hcm-persistence";
import type { WorkspaceData } from "../lib/types";

const data={users:[
 {id:"rep",role:"Sales Representative",title:"Rep",name:"Rep",team:"Sales"},
 {id:"mia",role:"Administrator",title:"Director",name:"Mia",team:"Management"},
 {id:"flo",role:"Administrator",title:"General Manager",name:"Flo",team:"Management"},
 {id:"rep2",role:"Sales Representative",title:"Rep",name:"Rep2",team:"Sales"},
 ]} as unknown as WorkspaceData;

test("reporting list accepts multiple authorized contacts without duplicate or self references",()=>{
 assert.deepEqual(reportingManagerCandidates(data,"rep").map((u)=>u.id),["flo","mia"]);
 assert.deepEqual(validAdditionalManagerIds(["flo","mia","mia","rep","rep2","unknown"],data,"rep"),["flo","mia"]);
 assert.deepEqual(validAdditionalManagerIds(["flo","mia"],data,"rep","flo"),["mia"]);
});

test("employee HCM reporting assignments survive normalization",()=>{
 const seed=createHcmSeed(data);
 const record=seed.employees.find((e)=>e.userId==="rep")!;
 record.managerId="mia";
 record.additionalManagerIds=["flo","flo","mia","rep2"];
 const result=normalizePersistedHcmState(seed,data,createHcmSeed(data));
 const after=result.employees.find((e)=>e.userId==="rep");
 assert.equal(after?.managerId,"mia");
 assert.deepEqual(after?.additionalManagerIds,["flo"]);
});

test("inactive reporting managers cannot be selected for new assignments while historical validation remains intact",()=>{
 const activeIds=new Set(["mia","rep","rep2"]);
 assert.deepEqual(selectableReportingManagerCandidates(data,"rep",activeIds).map((user)=>user.id),["mia"]);
 assert.deepEqual(validSelectableAdditionalManagerIds(["flo","mia","mia","rep2"],data,"rep",undefined,activeIds),["mia"]);
 // Historical HCM normalization must not erase a former manager merely because access ended.
 assert.deepEqual(validAdditionalManagerIds(["flo"],data,"rep"),["flo"]);
});

test("suspended manager access is not selectable even when HR directory status is stale",()=>{
 const activeIds=activeReportingManagerIds(data,{flo:{accountState:"Suspended"},mia:{accountState:"Active"}});
 assert.deepEqual(selectableReportingManagerCandidates(data,"rep",activeIds).map((user)=>user.id),["mia"]);
 assert.deepEqual(validSelectableAdditionalManagerIds(["flo","mia"],data,"rep",undefined,activeIds),["mia"]);
});
