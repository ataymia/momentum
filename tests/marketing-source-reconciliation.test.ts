import test from "node:test";
import assert from "node:assert/strict";
import {campaignCommercialActivity,attributionSummary} from "../lib/marketing-engine";
import type {MarketingState} from "../lib/marketing-engine";
import type {CommerceState} from "../lib/commerce-engine";
import type {WorkspaceData} from "../lib/types";
import {MENU_GROUPS,canVisitRoute,pageForPath,requiresPrototypePage,routeLabel} from "../lib/navigation-route-registry";
import type {WorkspaceUser} from "../lib/types";
import {readFileSync} from "node:fs";

const data={
 accounts:[{id:"account-1",reorderCount:1}],
 orders:[{id:"order-1",accountId:"account-1",number:"GE-1",placedAt:"2026-11-03",status:"Delivered",
  paymentStatus:"Paid",ownerId:"rep",cases:5,amount:120,pricePerCase:24,priceBasis:"Test"}],
} as WorkspaceData;
const marketing={
 campaigns:[{id:"campaign-1",startDate:"2026-11-01",endDate:"2026-11-30"}],
 touches:[{id:"touch-1",campaignId:"campaign-1",accountId:"account-1"}],
 attributions:[{id:"attr-1",campaignId:"campaign-1",accountId:"account-1",sourceType:"Order",
   sourceId:"order-1",reviewed:true}],
} as MarketingState;
const emptyCommerce:CommerceState={version:1,invoices:[],payments:[],allocations:[],refunds:[],credits:[],notes:[]};
test("R74 marketing cannot count a Paid label without Commerce source evidence",()=>{
 const actual=campaignCommercialActivity(marketing,data,"campaign-1",emptyCommerce);
 assert.equal(actual.paidCases,0);
 assert.equal(actual.paidRevenue,0);
 assert.equal(actual.locations,1);
 assert.equal(attributionSummary(marketing,data,"campaign-1",emptyCommerce).paidRevenue,0);
});
test("R74 completed source-ledger invoice permits reviewed marketing-associated cases",()=>{
 const commerce:CommerceState={...emptyCommerce,invoices:[{
  id:"invoice-1",number:"INV-1",orderId:"order-1",accountId:"account-1",
  issuedAt:"2026-11-03",createdAt:"2026-11-03",terms:"COD",total:120,status:"Paid",
 }],payments:[{
  id:"payment-1",accountId:"account-1",receivedAt:"2026-11-05",amount:120,method:"ACH",
  status:"Cleared",settledAt:"2026-11-06",settledBy:"reviewer",createdAt:"2026-11-05",createdBy:"reviewer",
 }],allocations:[{
  id:"allocate-1",paymentId:"payment-1",invoiceId:"invoice-1",amount:120,
  createdAt:"2026-11-06",createdBy:"reviewer",
 }]};
 const activity=campaignCommercialActivity(marketing,data,"campaign-1",commerce);
 const evidence=attributionSummary(marketing,data,"campaign-1",commerce);
 assert.equal(activity.paidCases,5);
 assert.equal(activity.paidRevenue,120);
 assert.equal(evidence.evidenceCount,1);
 assert.equal(evidence.paidRevenue,120);
});
test("R74 unreviewed or foreign-account attribution never receives paid credit",()=>{
 const commerce={...emptyCommerce};
 const copy=JSON.parse(JSON.stringify(marketing)) as MarketingState;
 copy.attributions[0].reviewed=false;
 assert.equal(attributionSummary(copy,data,"campaign-1",commerce).paidRevenue,0);
 copy.attributions[0].reviewed=true;
 copy.attributions[0].accountId="foreign";
 assert.equal(attributionSummary(copy,data,"campaign-1").paidRevenue,0);
});

test("R56 Marketing has one campaign workstream and preserves authorized bookmarked routes",()=>{
 const marketing=MENU_GROUPS.find(group=>group.label==="Marketing");
 assert(marketing);
 assert.equal(marketing.entries.filter(entry=>entry.path==="/marketing").length,1);
 assert.equal(marketing.entries.filter(entry=>entry.path==="/marketing/campaigns").length,0);
 assert.equal(requiresPrototypePage("/marketing/campaigns"),true);
 assert.equal(pageForPath("/marketing/campaigns"),"marketing");
 assert.equal(routeLabel("/marketing/campaigns"),"Marketing · Campaigns");
 const admin={id:"admin",role:"Administrator",email:"admin@example.invalid",
   name:"Admin",firstName:"Admin",initials:"AD",title:"Owner",team:"Operations",
   accent:"#246"} as WorkspaceUser;
 assert.equal(canVisitRoute(admin,"/marketing/campaigns"),true);
 assert.equal(canVisitRoute({...admin,role:"Sales Representative"},"/marketing/campaigns"),false);
 const hub=readFileSync("components/prototype/operations-hub.tsx","utf8");
 assert.match(hub,/if\(path==="/marketing\/campaigns"\)return <MarketingWorkspaceExperience key="marketing-campaigns" initialTab="campaigns"\/>/);
});
