import assert from "node:assert/strict";
import test from "node:test";
import * as archiveImported from "../functions/src/order-archive-policy";
import {processedForDelivery} from "../lib/delivery-engine";
import {filterOrderWorkspace} from "../lib/order-workspace-views";
import {createCommerceSeed} from "../lib/commerce-engine";
import type {WorkspaceData,Order} from "../lib/types";
import {readFileSync} from "node:fs";

const mod=archiveImported as typeof archiveImported & {default?:typeof archiveImported};
const {orderArchiveBlocker}=mod.default??mod;
const qa:Order={
 id:"ord-test-admin",number:"GE-TEST-01",accountId:"account-1",ownerId:"admin-1",
 cases:6,pricePerCase:0,amount:0,testOnly:true,testSkuId:"qa-live-demo-10",
 product:"QA Widget",status:"Delivered",paymentStatus:"Not invoiced",placedAt:"2026-10-29",
 priceBasis:"INTERNAL QA - $0, NO REAL INVENTORY",inventoryAvailableAtOrder:0,
 lines:[{id:"line-1",product:"QA Widget",cases:6,pricePerCase:0,amount:0}],
};
const real={...qa,id:"ord-paid-1",testOnly:undefined,testSkuId:undefined,
 pricePerCase:24,amount:144,status:"Approved",paymentStatus:"Open"} as Order;
const evidence=(order:Order)=>({order:order as unknown as Record<string,unknown>,tasks:[],overrides:[],
 invoices:[],allocations:[],credits:[],refunds:[],payments:[],journals:[],
 movements:[],reservations:[],correctionRequests:[]});
test("internal delivered QA order can enter the immutable Admin graveyard without physical stock",()=>{
 assert.equal(orderArchiveBlocker(evidence(qa)),undefined);
 assert.equal(processedForDelivery(qa),false);
});
test("financial evidence, physical custody and completed real deliveries block archive",()=>{
 assert.match(orderArchiveBlocker({...evidence(real),payments:[{id:"payment-1"}]})??"",/payment/i);
 assert.match(orderArchiveBlocker({...evidence(real),movements:[{id:"movement-1"}]})??"",/physical stock/i);
 assert.match(orderArchiveBlocker({...evidence(real),tasks:[{status:"In transit"}]})??"",/driver load/i);
 assert.match(orderArchiveBlocker({...evidence({...real,status:"Delivered"} as Order})??"",/Fulfillment/i);
 assert.match(orderArchiveBlocker({...evidence(real),correctionRequests:[{state:"Submitted"}]})??"",/correction/i);
});
test("archived errors stay out of every Orders tab including All Orders",()=>{
 const archived={...real,archivedAt:"2026-10-29T12:00:00.000Z",archivedBy:"admin-1"};
 const data={users:[],accounts:[],orders:[archived],customers:[],activities:[],
 inventory:[],placements:[],appointments:[],approvals:[]} as unknown as WorkspaceData;
 const commerce=createCommerceSeed(data);
 assert.deepEqual(filterOrderWorkspace(data,[archived],commerce,new Set(),{view:"All Orders"}),[]);
 assert.equal(processedForDelivery(archived),false);
});
test("Admin archive is server-authorized and cannot be written directly from the browser",()=>{
 const rules=readFileSync("firestore.rules","utf8");
 assert.match(rules,/match \/archivedOrders\/\{orderId\} \{\s*allow get, list: if isAdmin\(\);\s*allow create, update, delete: if false;/);
 const server=readFileSync("functions/src/order-archive.ts","utf8");
 assert.match(server,/access\.data\(\)\?\.role!=="Administrator"/);
 assert.match(server,/tx\.create\(archiveRef,snapshot\)/);
 assert.match(server,/orderArchiveBlocker\(evidence\)/);
});
test("driver signed deliveries require recipient identity and driver cannot record electronic processor payments",()=>{
 const src=readFileSync("lib/delivery-context.tsx","utf8");
 assert.match(src,/signature\.recipientName\?\.trim\(\)/);
 assert.match(src,/isDriver && !\["Cash","Check"\]\.includes\(method\)/);
 assert.match(src,/\(isDriver && task\.driverId === currentUser\.id\)/);
});
