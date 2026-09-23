import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { canReviewApproval } from "../lib/access";
import { collectAuditableRecords, diffAuditableRecords } from "../lib/audit-engine";
import { auditEventCreatesNotification } from "../lib/notification-engine";
import { reconcileApprovals, reconcileOrders } from "../lib/order-approval-engine";
import type { Approval, Order, WorkspaceData, WorkspaceUser } from "../lib/types";

const ADMIN = "admin"; const REP = "rep"; const MANAGER = "manager";
const user=(id:string,role:WorkspaceUser["role"],team:WorkspaceUser["team"]):WorkspaceUser=>({id,name:id,firstName:id,email:`${id}@test.local`,initials:id.slice(0,2).toUpperCase(),title:role,role,team,accent:"#53657d",managerId:role==="Sales Representative"?MANAGER:undefined,managedTeams:role==="Sales Manager"?["Sales"]:undefined});
const users=[user(ADMIN,"Administrator","Leadership"),user(MANAGER,"Sales Manager","Sales"),user(REP,"Sales Representative","Sales")];
const data:WorkspaceData={users,customers:[],accounts:[],activities:[],appointments:[],orders:[],placements:[],inventory:[],approvals:[],timeEntries:[],timecards:[],notifications:[],bulletins:[],territories:[]};
const pending:Approval={id:"apr",type:"Order",title:"Review GE-1",detail:"10 cases",requestedBy:"rep",requesterId:REP,recordId:"ord",team:"Sales",submittedAt:"2026-09-22T16:00:00.000Z",dueAt:"2026-09-23T16:00:00.000Z",priority:"High",status:"Pending"};

describe("order approval coherence",()=>{
  test("one Administrator decision dominates stale Pending replicas",()=>{const approved={...pending,status:"Approved" as const,decidedBy:ADMIN,decidedAt:"2026-09-22T16:05:00.000Z"};const approvals=reconcileApprovals([pending],[approved]);assert.equal(approvals.length,1);assert.equal(approvals[0].status,"Approved");const order:Order={id:"ord",number:"GE-1",accountId:"acc",cases:10,pricePerCase:24,amount:240,status:"Awaiting approval",placedAt:"2026-09-22",ownerId:REP,priceBasis:"test",paymentStatus:"Not invoiced"};assert.equal(reconcileOrders([order],[],approvals)[0].status,"Approved");});
  test("Sales Manager cannot approve an order",()=>{assert.equal(canReviewApproval(data,users[1],pending),false);assert.equal(canReviewApproval(data,users[0],pending),true);});
});

describe("audit actor integrity",()=>{
  test("passive changes without provenance are System, never the viewer",()=>{const before=collectAuditableRecords("Workspace",{orders:[{id:"ord",number:"GE-1",status:"Awaiting approval"}]});const after=collectAuditableRecords("Workspace",{orders:[{id:"ord",number:"GE-1",status:"Approved"}]});const[event]=diffAuditableRecords(before,after,{id:"system",role:"System"},"2026-09-22T17:00:00.000Z",users);assert.equal(event.actorId,"system");});
  test("explicit decidedBy identifies the actual actor",()=>{const before=collectAuditableRecords("Workspace",{approvals:[{id:"apr",title:"Review",status:"Pending",requesterId:REP}]});const after=collectAuditableRecords("Workspace",{approvals:[{id:"apr",title:"Review",status:"Approved",requesterId:REP,decidedBy:ADMIN}]});const[event]=diffAuditableRecords(before,after,{id:"system",role:"System"},"2026-09-22T17:00:00.000Z",users);assert.equal(event.actorId,ADMIN);});
});

describe("notification classification",()=>{
  const routine={id:"audit",at:"2026-09-22T17:00:00.000Z",actorId:REP,actorRole:"Sales Representative",action:"Updated" as const,module:"CRM",collection:"interactions",entityType:"CRM.interactions",entityId:"i",label:"Visit",summary:"Visit updated",sensitivity:"operational" as const,changes:[{field:"summary",before:"a",after:"b"}]};
  test("routine audit movement does not ring the bell",()=>assert.equal(auditEventCreatesNotification(routine),false));
  test("a newly pending approval is actionable",()=>assert.equal(auditEventCreatesNotification({...routine,action:"Created",module:"Workspace",collection:"approvals",changes:[{field:"status",after:"Pending"}]}),true));
});
