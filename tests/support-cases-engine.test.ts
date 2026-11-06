import assert from "node:assert/strict";
import test from "node:test";
import type {WorkspaceUser} from "../lib/types";
import {createCase,changeCase,visibleCase,restoreDemoCases} from "../lib/support-cases-engine";
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
