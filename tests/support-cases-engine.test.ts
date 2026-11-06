import assert from "node:assert/strict";
import test from "node:test";
import type {WorkspaceUser} from "../lib/types";
import {createCase,changeCase,visibleCase,restoreDemoCases,caseNextStatuses,caseStatusLabel,caseAssignableStaff} from "../lib/support-cases-engine";
import {readFileSync} from "node:fs";
import type {WorkspaceData} from "../lib/types";
const user=(id:string,role:WorkspaceUser["role"]):WorkspaceUser=>({id,role,name:id,firstName:id,email:"test@example.invalid",team:"Sales",title:"Test",initials:"T",accent:"#000"});
const rep=user("r1","Sales Representative"),admin=user("a","Administrator"),other=user("r2","Sales Representative");
const allowed=new Set(["acc-1"]),orders=new Map([["order-1","acc-1"]]),t="2026-11-06T17:00:00.000Z";
const draft={title:"Damaged shipment",description:"Several crushed cases were delivered.",accountId:"acc-1",orderId:"order-1",category:"Delivery" as const,priority:"High" as const};
test("case creation refuses unauthorized account and unrelated order",()=>{
 assert.equal(createCase({...draft,accountId:"secret"},rep,allowed,orders,"c",t),null);
 assert.equal(createCase({...draft,orderId:"other"},rep,allowed,orders,"c",t),null);
 assert(createCase(draft,rep,allowed,orders,"c",t));
});
test("case visibility, note history and authorized transitions",()=>{
 const c=createCase(draft,rep,allowed,orders,"c",t);assert(c);
 assert.equal(visibleCase(other,new Set(),c),false);
 assert.equal(changeCase(c,rep,allowed,"Status","Investigating","starting",new Map(),"e1",t),null);
 const started=changeCase(c,admin,allowed,"Status","Investigating","Verified customer report",new Map(),"e1",t);assert(started);
 assert.equal(started.status,"Investigating");
 const noted=changeCase(started,rep,allowed,"Note","Spoke with buyer","",new Map(),"e2",t);assert(noted);
 assert.equal(noted.history.length,3);
 assert.equal(changeCase(noted,rep,allowed,"Note","duplicate","",new Map(),"e2",t),null);
 assert.equal(c.history.length,1);
});
test("demo hydration rejects unknown users",()=>{
 const c=createCase(draft,rep,allowed,orders,"c",t);assert(c);
 assert.deepEqual(restoreDemoCases([c,{...c,id:"other",ownerId:"ghost"}],new Set(["r1"])),[c]);
});

test("F09: only actionable next states appear in the service triage editor",()=>{
 assert.deepEqual(caseNextStatuses("Open"),["Investigating"]);
 assert.deepEqual(caseNextStatuses("Resolved"),["Closed","Investigating"]);
 assert.equal(caseStatusLabel("Waiting"),"Waiting on customer");
 const view=readFileSync("components/prototype/support-cases-experience.tsx","utf8");
 assert(view.includes("caseNextStatuses(selected.status)"));
 assert(view.includes('if(action==="Note")setNote("")'));
});
test("F09: case handoff excludes representatives who do not own the customer",()=>{
 const c=createCase(draft,rep,allowed,orders,"c",t);assert(c);
 const state={users:[admin,rep,other],accounts:[{id:"acc-1",ownerId:"r1",stage:"Active"}]} as unknown as WorkspaceData;
 const candidates=caseAssignableStaff(state,admin,c);
 assert(candidates.some(u=>u.id==="r1"));
 assert(!candidates.some(u=>u.id==="r2"));
 assert.equal(changeCase(c,admin,allowed,"Owner","r2","",new Map(candidates.map(u=>[u.id,u])),"e2",t),null);
 assert(caseAssignableStaff(state,admin,{...c,accountId:undefined}).every(u=>["Administrator","Operations"].includes(u.role)));
});
test("F09: corrupt demo history and malformed text cannot crash a detail record",()=>{
 const c=createCase(draft,rep,allowed,orders,"c",t);assert(c);
 assert.deepEqual(restoreDemoCases([{...c,history:[{...c.history[0],at:null}]}],new Set(["r1"])),[]);
 assert.deepEqual(restoreDemoCases([{...c,description:null}],new Set(["r1"])),[]);
 assert.deepEqual(restoreDemoCases([c,{...c,id:"clone",history:[c.history[0],c.history[0]]}],new Set(["r1"])),[c]);
});
