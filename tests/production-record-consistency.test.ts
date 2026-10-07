import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canCreateOrder } from "../lib/access";
import { processedForDelivery } from "../lib/delivery-engine";
import { normalizeCommercialState } from "../lib/commercial-state";
import { mergeDocument } from "../lib/persistence";
import { reconcileApprovals, reconcileOrders } from "../lib/order-approval-engine";
import type { Approval, Order, WorkspaceData, WorkspaceUser } from "../lib/types";

const rep:WorkspaceUser={id:"rep",name:"Rep",firstName:"Rep",email:"rep@test.local",initials:"RP",title:"Sales Representative",role:"Sales Representative",team:"Sales",accent:"#000"};
const admin:WorkspaceUser={id:"admin",name:"Admin",firstName:"Admin",email:"admin@test.local",initials:"AD",title:"Administrator",role:"Administrator",team:"Leadership",accent:"#000"};
const account={id:"acc",name:"Store",location:"Phoenix",channel:"Retail",stage:"Opening order" as const,ownerId:rep.id,contactName:"Owner",contactRole:"Owner",phone:"1",email:"a@b.com",lastActivity:"",nextAction:"",nextActionDate:"2026-10-02",health:"New" as const,lifetimeCases:0,reorderCount:0,notes:""};
const baseData:WorkspaceData={users:[admin,rep],customers:[],accounts:[account],activities:[],appointments:[],orders:[],placements:[],inventory:[],approvals:[],timeEntries:[],timecards:[],notifications:[],bulletins:[],territories:[]};
const order=(status:Order["status"]):Order=>({id:"ord",number:"GE-1",accountId:account.id,cases:10,pricePerCase:24,amount:240,status,placedAt:"2026-10-01",ownerId:rep.id,creditedRepId:rep.id,priceBasis:"Tier A",paymentStatus:status==="Delivered"?"Open":"Not invoiced",product:"0.25L (8.4oz) Golden Eagle Energy Drink (24pack)",inventoryAvailableAtOrder:100});
const pending:Approval={id:"apr",type:"Order",title:"Review GE-1",detail:"10 cases",requestedBy:rep.name,requesterId:rep.id,recordId:"ord",team:"Sales",submittedAt:"2026-10-01T16:00:00.000Z",dueAt:"2026-10-02T16:00:00.000Z",priority:"High",status:"Pending"};

test("a stale order record cannot roll Delivered backward",()=>{
  const path="domains/commercial/fields/orders";
  const base={items:[order("Approved")]};
  const local={items:[order("Allocated")]};
  const remote={items:[order("Delivered")]};
  const merged=mergeDocument(base,local,remote,path);
  assert.equal((merged.items as Order[])[0].status,"Delivered");
});

test("a final Administrator approval cannot return to Pending",()=>{
  const approved={...pending,status:"Approved" as const,decidedBy:admin.id,decidedAt:"2026-10-01T16:05:00.000Z"};
  const path="domains/commercial/fields/approvals";
  const merged=mergeDocument({items:[pending]},{items:[pending]},{items:[approved]},path);
  assert.equal((merged.items as Approval[])[0].status,"Approved");
  assert.equal((merged.items as Approval[])[0].decidedBy,admin.id);
});

test("delivery and reservation custody evidence is monotonic",()=>{
  const taskBase={id:"task",orderId:"ord",driverId:"driver",status:"Accepted",acceptedAt:"2026-10-01T16:00:00.000Z",acceptedBy:"admin",history:[]};
  const local={...taskBase,status:"Loaded",loadedAt:"2026-10-01T16:10:00.000Z"};
  const remote={...local,status:"Delivered",departedAt:"2026-10-01T16:20:00.000Z",deliveredAt:"2026-10-01T16:30:00.000Z"};
  const tasks=mergeDocument({items:[taskBase]},{items:[local]},{items:[remote]},"domains/delivery/fields/tasks");
  assert.equal((tasks.items as Array<{status:string}>)[0].status,"Delivered");
  const reservations=mergeDocument({items:[{id:"r",status:"Active"}]},{items:[{id:"r",status:"Active"}]},{items:[{id:"r",status:"Fulfilled",fulfilledAt:"2026-10-01T16:30:00.000Z"}]},"domains/inventoryLedger/fields/reservations");
  assert.equal((reservations.items as Array<{status:string}>)[0].status,"Fulfilled");
});

test("commercial hydration keeps cancellation evidence and duplicate ids for canonical reconciliation",()=>{
  const cancelled={...order("Cancelled"),cancelledAt:"2026-10-01T17:00:00.000Z",cancelledBy:admin.id,cancellationReason:"Duplicate order"};
  const approved={...pending,status:"Approved" as const,decidedBy:admin.id,decidedAt:"2026-10-01T16:05:00.000Z"};
  const withLegacy:WorkspaceData={...baseData,orders:[order("Awaiting approval")],approvals:[pending]};
  const normalized=normalizeCommercialState({version:1,accountPatches:{},customerPatches:{},orders:[cancelled],appointments:[],approvals:[approved],activities:[],inventoryLots:[],territories:[]},withLegacy,"2026-10-01");
  assert.equal(normalized.orders.length,1);
  assert.equal(normalized.orders[0].status,"Cancelled");
  assert.equal(normalized.orders[0].cancellationReason,"Duplicate order");
  assert.equal(normalized.approvals.length,1);
  const approvals=reconcileApprovals(normalized.approvals,withLegacy.approvals);
  assert.equal(approvals[0].status,"Approved");
  const orders=reconcileOrders(normalized.orders,withLegacy.orders,approvals);
  assert.equal(orders[0].status,"Cancelled");
});

test("cloud confirmation cannot claim success while a permission-denied journal is blocked",()=>{
  const persistence=readFileSync("lib/persistence.ts","utf8");
  assert.match(persistence,/blockedKeys\.get\(key\)/);
  assert.match(persistence,/The change remains safely queued and is not cloud-confirmed/);
  assert.match(persistence,/commitFirestoreWrites\(\[write,metaWrite\]\)/);
});

test("Administrator approval UI identifies the submitting rep before decision",()=>{
  const ui=readFileSync("components/pages/work-v2.tsx","utf8");
  assert.match(ui,/Sales rep/);
  assert.match(ui,/Submitted by/);
  assert.match(ui,/flushAndConfirm\(COMMERCIAL_KEY\)/);
  assert.match(ui,/orderApproval\(approval.type\).*Awaiting approval/);
});

test("stale Pending or Returned approval cannot move an approved order backward",()=>{
  const approved=order("Approved");
  assert.equal(reconcileOrders([approved],[],[pending])[0].status,"Approved");
  const returned={...pending,status:"Returned" as const,decidedBy:admin.id,decidedAt:"2026-10-01T16:05:00.000Z",returnReason:"stale"};
  assert.equal(reconcileOrders([approved],[],[returned])[0].status,"Approved");
});

test("every operational order surface identifies the creator and Delivery can print invoices",()=>{
  const orders=readFileSync("components/pages/orders-v3.tsx","utf8");
  const work=readFileSync("components/pages/work-v2.tsx","utf8");
  const delivery=readFileSync("components/pages/deliveries.tsx","utf8");
  const accounts=readFileSync("components/pages/accounts.tsx","utf8");
  const invoices=readFileSync("components/finance/invoice-print-center.tsx","utf8");
  assert.match(orders,/Placed by/);
  assert.match(work,/Submitted by/);
  assert.match(delivery,/Placed by/);
  assert.match(accounts,/Placed by/);
  assert.match(invoices,/Placed by/);
  assert.match(delivery,/InvoicePrintCenter/);
  assert.match(delivery,/flushAndConfirm\(DELIVERY_STORAGE_KEY\)/);
});

test("Delivery Driver invoice access is read-only in the persistence domain",()=>{
  const domains=readFileSync("lib/firestore-domains.ts","utf8");
  assert.match(domains,/momentum-commerce-v1[\s\S]*Delivery Driver/);
  assert.match(domains,/momentum-commerce-v1[\s\S]*write:ADMIN/);
});


test("every authoritative commercial order mutation persists its own snapshot before returning",()=>{
  const workspace=readFileSync("lib/workspace-context.tsx","utf8");
  const decide=workspace.slice(workspace.indexOf("const decideApproval"),workspace.indexOf("const setOrderStatus"));
  const fulfillment=workspace.slice(workspace.indexOf("const setOrderStatus"),workspace.indexOf("const cancelOrder"));
  const payment=workspace.slice(workspace.indexOf("const reconcileOrderPayment"),workspace.indexOf("const importInventoryLots"));
  assert.match(decide,/const nextCommercial:[^=]*=/);
  assert.match(decide,/momentumStorage\.setItem\(COMMERCIAL_KEY,JSON\.stringify\(nextCommercial\)\)/);
  assert.match(fulfillment,/momentumStorage\.setItem\(COMMERCIAL_KEY,JSON\.stringify\(nextCommercial\)\)/);
  assert.match(payment,/momentumStorage\.setItem\(COMMERCIAL_KEY,JSON\.stringify\(nextCommercial\)\)/);
});

test("delivery mutations enter persistence before the page can ask for cloud confirmation",()=>{
  const delivery=readFileSync("lib/delivery-context.tsx","utf8");
  const commit=delivery.slice(delivery.indexOf("const commitState"),delivery.indexOf("const canReconcileCancelledDelivery"));
  assert.match(commit,/momentumStorage\.setItem\(DELIVERY_STORAGE_KEY,JSON\.stringify\(next\)\)/);
  assert.match(commit,/setState\(next\)/);
  assert.doesNotMatch(commit,/setState\(\(current\)=>/);
});

test("secondary order surfaces identify who placed each concrete order",()=>{
  const dashboard=readFileSync("components/pages/dashboard.tsx","utf8");
  const inventory=readFileSync("components/inventory/inventory-ledger-panel-v2.tsx","utf8");
  const marketing=readFileSync("components/pages/marketing.tsx","utf8");
  const search=readFileSync("components/app-shell-v4.tsx","utf8");
  const orderCash=readFileSync("components/commerce/order-cash-panel-v2.tsx","utf8");
  assert.match(dashboard,/Placed by/);
  assert.match(inventory,/Placed by/);
  assert.match(marketing,/Placed by/);
  assert.match(search,/Placed by/);
  assert.match(orderCash,/Placed by/);
});


test("order cloud confirmation uses the requested commercial key",()=>{
  const persistence=readFileSync("lib/persistence.ts","utf8");
  assert.match(persistence,/await this\.flush\(\[key\],true\)/);
  assert.match(persistence,/async flushLatest\(\)/);
});


test("standard order approval waits on one confirmation path instead of launching a second global flush",()=>{
  const workspace=readFileSync("lib/workspace-context.tsx","utf8");
  const approvalStart=workspace.indexOf("let returnReason: string | undefined",workspace.indexOf("const decideApproval"));
  const decide=workspace.slice(approvalStart,workspace.indexOf("const setOrderStatus"));
  assert.doesNotMatch(decide,/momentumStorage\.flush\(\)/);
  const work=readFileSync("components/pages/work-v2.tsx","utf8");
  assert.match(work,/flushAndConfirm\(COMMERCIAL_KEY\)/);
});


test("cloud-confirmed commercial work can flush while another domain is already syncing",()=>{
  const persistence=readFileSync("lib/persistence.ts","utf8");
  assert.match(persistence,/private activeFlushKeys=new Set<string>\(\)/);
  assert.match(persistence,/this\.dirty\.has\(key\)&&!this\.activeFlushKeys\.has\(key\)\)await this\.flush\(\[key\],true\)/);
  assert.match(persistence,/async flush\(onlyKeys\?:string\[\],allowConcurrent=false\)/);
  assert.match(persistence,/requested\.filter\(\(key\)=>!this\.activeFlushKeys\.has\(key\)\)/);
});

test("all intended order-entry roles retain order creation access",()=>{
  const make=(role:WorkspaceUser["role"]):WorkspaceUser=>({...rep,id:`user-${role}`,role,title:role});
  for(const role of ["Administrator","Sales Manager","Sales Representative","Customer"] as const)assert.equal(canCreateOrder(make(role)),true,role);
  for(const role of ["Operations","Delivery Driver","Warehouse","Brand Ambassador"] as const)assert.equal(canCreateOrder(make(role)),false,role);
});


test("an approved approval becomes an actual delivery-eligible order status",()=>{
  const approved={...pending,status:"Approved" as const,decidedBy:admin.id,decidedAt:"2026-10-07T20:00:00.000Z"};
  const repaired=reconcileOrders([order("Awaiting approval")],[],[approved])[0];
  assert.equal(repaired.status,"Approved");
  assert.equal(processedForDelivery(repaired),true);
});

test("Administrator workspace repairs approval/order drift into the persisted commercial order source",()=>{
  const workspace=readFileSync("lib/workspace-context.tsx","utf8");
  assert.match(workspace,/The order document, not the approval document, is the cross-role delivery source of truth/);
  assert.match(workspace,/currentUser\?\.role !== "Administrator"/);
  assert.match(workspace,/reconcileOrders\(commercial\.orders, \[\], approvals\)/);
  assert.match(workspace,/return changed \? \{ \.\.\.state, orders \} : state/);
});
