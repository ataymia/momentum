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

import { weeklySalesManagementSummary } from "../lib/sales-field-engine";
import { programPricingDaysRemaining } from "../lib/notification-engine";

test("weekly management view is source-derived",()=>{
  const account={id:"acc-week",name:"Shop",location:"Phoenix",channel:"Retail",stage:"Prospect" as const,ownerId:REP,contactName:"Owner",contactRole:"Owner",phone:"1",email:"x@y.com",lastActivity:"",nextAction:"Follow up",nextActionDate:"2026-09-25",health:"New" as const,lifetimeCases:0,reorderCount:0,notes:"",responsibilityStartedAt:"2026-09-21T10:00:00.000Z"};
  const order:Order={id:"week-order",number:"GE-W",accountId:account.id,cases:12,pricePerCase:24,amount:288,status:"Awaiting approval",placedAt:"2026-09-23",ownerId:REP,creditedRepId:REP,priceBasis:"Tier A",paymentStatus:"Not invoiced"};
  const weeklyData:WorkspaceData={...data,accounts:[account],orders:[order],activities:[{id:"created",accountId:account.id,type:"note",title:"Customer location created",detail:"created",at:"2026-09-22T10:00:00.000Z",userId:REP}]};
  const interactions=[{id:"visit",locationId:account.id,userId:REP,type:"Visit" as const,occurredAt:"2026-09-22T12:00:00.000Z",summary:"visit",physicalVisit:true,prospectRating:8,nextAction:"Follow up",nextActionDate:"2026-09-25"}];
  const summary=weeklySalesManagementSummary(weeklyData,interactions,REP,"2026-09-23");assert.equal(summary.visits,1);assert.equal(summary.orders,1);assert.equal(summary.orderCases,12);assert.equal(summary.newAccounts,1);assert.equal(summary.promisingProspects,1);assert.equal(summary.followUpsDue,1);
});

test("program pricing enters the action window at 30 days",()=>{const account={id:"a",name:"A",location:"Phoenix",channel:"Retail",stage:"Prospect",ownerId:REP,contactName:"x",contactRole:"x",phone:"",email:"",lastActivity:"",nextAction:"",nextActionDate:"2026-09-23",health:"New",lifetimeCases:0,reorderCount:0,notes:"",programPricingExpirationDate:"2026-10-23",programPricingStatus:"Active"} as const;assert.equal(programPricingDaysRemaining(account,"2026-09-23"),30)});

test("date-only Sunday stays in its Arizona business week",()=>{
  const account={id:"acc-sun",name:"Sunday Shop",location:"Phoenix",channel:"Retail",stage:"Prospect" as const,ownerId:REP,contactName:"Owner",contactRole:"Owner",phone:"1",email:"x@y.com",lastActivity:"",nextAction:"",nextActionDate:"2026-09-27",health:"New" as const,lifetimeCases:0,reorderCount:0,notes:""};
  const sunday:Order={id:"sun-order",number:"GE-SUN",accountId:account.id,cases:10,pricePerCase:24,amount:240,status:"Awaiting approval",placedAt:"2026-09-27",ownerId:REP,creditedRepId:REP,priceBasis:"Tier A",paymentStatus:"Not invoiced"};
  const weekly:WorkspaceData={...data,accounts:[account],orders:[sunday]};
  const summary=weeklySalesManagementSummary(weekly,[],REP,"2026-09-27");assert.equal(summary.weekStart,"2026-09-21");assert.equal(summary.weekEnd,"2026-09-27");assert.equal(summary.orders,1);
});


import { GOLDEN_EAGLE_SKUS, HISTORICAL_PURCHASE_ORDER_POLICY, skuForProductName } from "../lib/product-catalog";

test("canonical Golden Eagle SKU master keeps historical PO quantities separate from stock",()=>{
  assert.deepEqual(GOLDEN_EAGLE_SKUS.map((sku)=>[sku.description,sku.historicalPurchaseOrderCases]),[
    ["0.25L (8.4oz) Golden Eagle Energy Drink (24pack)",5400],
    ["0.25L (8.4oz) Golden Eagle SugarFree (24pack)",1890],
    ["0.25L (8.4oz) Golden Eagle Tropical Edition (24pack)",945],
    ["0.25L (8.4oz) Golden Eagle RED Edition (24pack)",945],
    ["0.25L (8.4oz) Golden Eagle Blue (Zero) Edition (24pack)",540],
    ["0.25L (8.4oz) Golden Eagle Strawberry Edition (24pack)",0],
  ]);
  assert.match(HISTORICAL_PURCHASE_ORDER_POLICY,/never populate current on-hand/i);
  assert.equal(skuForProductName("Regular")?.description,"0.25L (8.4oz) Golden Eagle Energy Drink (24pack)");
  assert.equal(skuForProductName("Made Up Flavor"),undefined);
});
