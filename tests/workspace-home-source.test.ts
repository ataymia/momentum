import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {createInventoryLedgerSeed} from "../lib/inventory-ledger";
import {eligibleHomeOrders,orderedCasesByChannel,orderedCasesByProduct,recordedBusinessDay,visibleReceiptMovements,warehouseCasesByProduct} from "../lib/workspace-home-metrics";
import {canVisitRoute,requiresPrototypePage} from "../lib/navigation-route-registry";
import type {Account,InventoryLot,Order,Role,WorkspaceData,WorkspaceUser} from "../lib/types";

const order=(id:string,status:Order["status"],placedAt:string,opts:Partial<Order>={}):Order=>({
  id,number:id,accountId:"store-1",ownerId:"rep-1",priceBasis:"Test approved rate",status,
  placedAt,cases:4,pricePerCase:24,amount:96,paymentStatus:"Not invoiced",
  product:"0.25L (8.4oz) Golden Eagle Energy Drink (24pack)",...opts,
});
const account=(id:string,channel:string):Account=>({
  id,name:id,location:"Phoenix, AZ",channel,stage:"Prospect",ownerId:"rep-1",
  contactName:"",contactRole:"",phone:"",email:"",lastActivity:"",nextAction:"",
  nextActionDate:"2026-11-05",health:"New",lifetimeCases:0,reorderCount:0,notes:"",
});
const lot=(id:string,product:string,status:InventoryLot["status"],onHand:number):InventoryLot=>({
  id,lotCode:id,product,receivedAt:"2026-10-01",bestBy:"2027-08-01",
  status,location:"Main warehouse",onHand,reserved:0,available:onHand,
});
const actor=(role:Role):WorkspaceUser=>({
  id:role,role,name:"Test",firstName:"Test",initials:"TE",title:"Test",
  team:role==="Customer"?"Customer":"Operations",email:"test@example.invalid",accent:"#123456",
});

test("home orders exclude test, cancelled and draft entries and use valid AZ business dates",()=>{
  const data=[
    order("eligible","Approved","2026-11-03T04:00:00Z"),
    order("old","Paid","2026-10-28"),
    order("draft","Draft","2026-11-03"),
    order("cancelled","Cancelled","2026-11-03"),
    order("qa","Approved","2026-11-03",{testOnly:true}),
    order("invalid","Approved","not-a-date"),
  ];
  assert.deepEqual(eligibleHomeOrders(data,"2026-11-01","2026-11-03").map(o=>o.id),["eligible"]);
  assert.deepEqual(eligibleHomeOrders(data,"2026-10-01","2026-11-03").map(o=>o.id),["eligible","old"]);
  assert.equal(recordedBusinessDay("2026-11-03T12:00:00Z"),"2026-11-03");
  assert.equal(recordedBusinessDay("2026-11-31"),undefined);
});

test("ordered item and channel cases are quantities, not cash or paid revenue",()=>{
  const first=order("one","Approved","2026-11-03");
  const second=order("two","Paid","2026-11-02",{accountId:"store-2",cases:6,amount:144});
  assert.deepEqual(orderedCasesByChannel([first,second],[account("store-1","Convenience"),account("store-2","Gym")]),[["Gym",6],["Convenience",4]]);
  const byProduct=orderedCasesByProduct([first,second]);
  assert.equal(byProduct.reduce((sum,[,casesCount])=>sum+casesCount,0),10);
  assert.equal(byProduct.length,1);
});

test("sellable warehouse availability uses ledger, excludes holds and is deduplicated by lot",()=>{
  const available=lot("lot-a","Golden Eagle", "Available",12);
  const held=lot("lot-hold","Limited","Quality hold",8);
  const data={inventory:[available,held],accounts:[],orders:[],users:[]} as unknown as WorkspaceData;
  const ledger=createInventoryLedgerSeed(data);
  const totals=warehouseCasesByProduct(ledger,[available,held,available]);
  assert.deepEqual(totals,[["Golden Eagle",12],["Limited",0]]);
});

test("receipt activity uses verified recorded movements and accessible lots",()=>{
  const visible=lot("lot-visible","Golden Eagle","Available",0);
  const hidden=lot("lot-hidden","Other","Available",0);
  const seed=createInventoryLedgerSeed({inventory:[visible,hidden],accounts:[],orders:[],users:[]} as unknown as WorkspaceData);
  const receipts={...seed,movements:[
    {id:"receipt-visible",lotId:"lot-visible",product:"Golden Eagle",type:"Receipt" as const,quantity:6,reason:"Received",at:"2026-11-03T12:00:00Z",actorId:"admin"},
    {id:"receipt-hidden",lotId:"lot-hidden",product:"Other",type:"Receipt" as const,quantity:11,reason:"Received",at:"2026-11-03T12:00:00Z",actorId:"admin"},
    {id:"transfer-visible",lotId:"lot-visible",product:"Golden Eagle",type:"Transfer" as const,quantity:3,reason:"Transfer",at:"2026-11-03T12:00:00Z",actorId:"admin"},
  ]};
  assert.deepEqual(visibleReceiptMovements(receipts,[visible],"2026-11-01","2026-11-03").map(x=>x.id),["receipt-visible"]);
  assert.deepEqual(visibleReceiptMovements(receipts,[visible],"2026-10-01","2026-10-31"),[]);
});

test("home route is dedicated prototype and available to employee and customer roles",()=>{
  assert.equal(requiresPrototypePage("/"),true);
  assert(canVisitRoute(actor("Administrator"),"/"));
  assert(canVisitRoute(actor("Sales Representative"),"/"));
  assert(canVisitRoute(actor("Customer"),"/"));
  const source=readFileSync("components/prototype/workspace-home.tsx","utf8");
  assert.match(source,/buildActionNotices\(\{data,scope,currentUser/);
  assert.match(source,/eligibleHomeOrders\(scope.orders,start,today\)/);
  assert.match(source,/warehouseCasesByProduct\(ledger,scope.inventory\)/);
  assert.match(source,/visibleReceiptMovements\(ledger,scope.inventory,start,today\)/);
  assert.match(source,/customer portal/i);
});
