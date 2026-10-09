import assert from "node:assert/strict";
import test from "node:test";
import { filterOrderWorkspace,orderWorkspaceView,placedOrderDate } from "../lib/order-workspace-views";
import type { WorkspaceData,Order } from "../lib/types";
import type { CommerceState } from "../lib/commerce-engine";
const orders=[
 {id:"o1",number:"GE-1",accountId:"a1",ownerId:"rep1",placedAt:"2026-10-01T10:00:00Z",status:"Delivered",paymentStatus:"Paid",amount:100},
 {id:"o2",number:"GE-2",accountId:"a1",ownerId:"rep2",placedAt:"2026-10-03T10:00:00Z",status:"Delivered",paymentStatus:"Open",amount:120},
 {id:"o3",number:"GE-3",accountId:"a2",ownerId:"rep1",placedAt:"2026-09-15T10:00:00Z",status:"Cancelled",paymentStatus:"Open",amount:130},
 {id:"o4",number:"GE-4",accountId:"a2",ownerId:"rep1",placedAt:"2026-10-06T10:00:00Z",status:"Approved",paymentStatus:"Paid",amount:150},
] as Order[];
const data={orders,accounts:[{id:"a1",customerId:"c1",name:"ABC Market",accountManagerId:"manager1"},{id:"a2",customerId:"c2",name:"XYZ Market"}],users:[{id:"rep1",name:"Megan",role:"Sales Representative",managerId:"manager1"},{id:"rep2",name:"Matt",role:"Sales Representative"},{id:"manager1",name:"Manager",role:"Sales Manager"}]} as WorkspaceData;
const commerce={invoices:[{id:"i1",orderId:"o1",status:"Paid",total:100,accountId:"a1"}],payments:[{id:"p1",accountId:"a1",amount:100,status:"Cleared"}],allocations:[{id:"ap1",invoiceId:"i1",paymentId:"p1",amount:100}],credits:[],refunds:[],notes:[]} as CommerceState;
const opts=(view:"Active / Pending"|"Paid & Delivered"|"Hidden / Canceled"|"All Orders")=>({view});
test("completed requires delivered and invoice fully settled, not just task or payment labels",()=>{
 assert.equal(orderWorkspaceView(orders[0],commerce,false),"Paid & Delivered");
 assert.equal(orderWorkspaceView(orders[1],commerce,false),"Active / Pending");
 assert.equal(orderWorkspaceView(orders[3],commerce,false),"Active / Pending");
 assert.equal(orderWorkspaceView(orders[2],commerce,false),"Hidden / Canceled");
});
test("all views reference original orders without mutating or hiding history",()=>{
 const original=JSON.stringify(orders);
 assert.deepEqual(filterOrderWorkspace(data,orders,commerce,new Set(),opts("Paid & Delivered")).map(o=>o.id),["o1"]);
 assert.deepEqual(filterOrderWorkspace(data,orders,commerce,new Set(),opts("Hidden / Canceled")).map(o=>o.id),["o3"]);
 assert.equal(filterOrderWorkspace(data,orders,commerce,new Set(),opts("Active / Pending")).length,2);
 assert.equal(filterOrderWorkspace(data,orders,commerce,new Set(),opts("All Orders")).length,4);
 assert.equal(JSON.stringify(orders),original);
});
test("customer, sales rep, manager and placed-date filters can all combine",()=>{
 const rows=filterOrderWorkspace(data,orders,commerce,new Set(),{view:"All Orders",accountId:"a1",placedById:"rep1",managerId:"manager1",placedFrom:"2026-10-01",placedThrough:"2026-10-31"});
 assert.deepEqual(rows.map(o=>o.id),["o1"]);
 assert.equal(placedOrderDate(orders[0]),"2026-10-01");
 assert.deepEqual(filterOrderWorkspace(data,orders,commerce,new Set(),{view:"All Orders",dateSort:"oldest"}).map(o=>o.id),["o3","o1","o2","o4"]);
});
