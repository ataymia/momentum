import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {marketingSpendReadyForReconciliation} from "../lib/marketing-engine";
import type {MarketingSpend} from "../lib/marketing-engine";
test("F11: administration must not falsely mark payment processor, payroll, hosting or storage production-ready",()=>{
 const page=readFileSync("components/pages/settings-v3.tsx","utf8");
 for(const unsupported of [
   "Helcim is the selected tokenized processor",
   'status:"Product layer built", tone:"success"','"Product-complete demo layer"'
 ]) assert(!page.includes(unsupported),"unsupported readiness claim: "+unsupported);
 for(const required of ["Production release blocked","Processor selected; live rail integration pending","Connected-mode preview, release not accepted",'provider:"Cloudflare"','provider:"Helcim"',"live integration deferred"])
   assert(page.includes(required),"missing differentiated readiness disclosure: "+required);
});
test("F03: attendance table sorting never mutates the scoped timecards",()=>{
 const source=readFileSync("components/prototype/hr-attendance-experience.tsx","utf8");
 assert(source.includes("[...visibleTimecards].sort("));
 assert(!source.includes("{visibleTimecards.sort("));
});

// F10 data minimization: marketers see only approved asset metadata.
test("F10: document index excludes marketing drafts and retired assets for non-admin users",()=>{
 const source=readFileSync("components/prototype/documents-experience.tsx","utf8");
 assert(source.includes('marketing.assets.filter(m=>admin||m.status==="Approved")'));
});

// Clean initial marketing state is essential: nothing should look approved or budgeted without evidence.
test("F07: new marketing workspaces never invent a campaign, collateral approval or inventory",async()=>{
 const {createMarketingSeed}=await import("../lib/marketing-engine");
 const seed=createMarketingSeed();
 assert.equal(seed.campaigns.length,0);
 assert.equal(seed.assets.length,0);
 assert.equal(seed.materials.length,0);
 assert.equal(seed.spend.length,0);
});
test("F07: test orders and unsupported paid labels cannot inflate campaign revenue",async()=>{
 const {createMarketingSeed,campaignCommercialActivity}=await import("../lib/marketing-engine");
 const campaignId="camp-f07", accountId="location-one";
 const state=createMarketingSeed();
 state.campaigns.push({id:campaignId,name:"Test outreach",objective:"Retail demand",audience:"Retail",
   startDate:"2026-11-01",endDate:"2026-11-30",requestedBudget:0,ownerId:"marketer",
   status:"Approved",successMeasure:"Verified paid cases",createdAt:"2026-11-01T09:00:00Z"});
 state.touches.push({id:"touch-1",campaignId,accountId,type:"Retail activation",
   occurredAt:"2026-11-05T09:00:00Z",summary:"Sample outreach",createdBy:"marketer"});
 const realOrder={id:"order-verified",number:"GE-verified",accountId,ownerId:"rep",creditedRepId:"rep",
   status:"Paid",paymentStatus:"Paid",placedAt:"2026-11-05T09:00:00Z",
   paidAt:"2026-11-07T10:00:00Z",amount:240,cases:10,pricePerCase:24,priceBasis:"Customer rate"};
 const demoOrder={...realOrder,id:"order-demo",number:"GE-demo",amount:24000,cases:1000,testOnly:true};
 const data={accounts:[],orders:[realOrder,demoOrder]} as unknown as import("../lib/types").WorkspaceData;
 // Legacy/demo view can show real legacy Paid labels but never QA test orders.
 assert.equal(campaignCommercialActivity(state,data,campaignId).paidRevenue,240);
 // Connected-mode preview without source Commerce evidence cannot treat the
 // label on either order as an actual cleared payment.
 const unverified={version:1 as const,invoices:[],payments:[],allocations:[],credits:[],refunds:[],notes:[]} as import("../lib/commerce-engine").CommerceState;
 assert.equal(campaignCommercialActivity(state,data,campaignId,unverified).paidRevenue,0);
 // Now prove a server-sourced linked payment, not merely a label.
 const at="2026-11-07T10:00:00Z";
 const verified={...unverified,
   invoices:[{id:"invoice-1",number:"INV-1",orderId:"order-verified",accountId,
      status:"Paid" as const,issuedAt:at,terms:"COD" as const,total:240,createdAt:at}],
   payments:[{id:"payment-1",accountId,receivedAt:at,amount:240,
     method:"ACH" as const,status:"Cleared" as const,settledAt:at,
     settledBy:"finance",createdAt:at,createdBy:"finance"}],
   allocations:[{id:"allocation-1",paymentId:"payment-1",invoiceId:"invoice-1",
     amount:240,createdAt:at,createdBy:"finance"}],
 } as import("../lib/commerce-engine").CommerceState;
 assert.equal(campaignCommercialActivity(state,data,campaignId,verified).paidRevenue,240);
});

test("F07: campaign expense cannot be marked reconciled without receipt reference and approved evidence",()=>{
 const base={id:"s",campaignId:"campaign",date:"2026-11-06",vendor:"Print shop",category:"Collateral",
  amount:35,businessPurpose:"Print approved one-pagers",status:"Approved",
  submittedBy:"marketer",submittedAt:"2026-11-06T10:00:00Z"} as MarketingSpend;
 assert.equal(marketingSpendReadyForReconciliation(base),false);
 assert.equal(marketingSpendReadyForReconciliation({...base,receiptName:"receipt.pdf"}),false);
 assert.equal(marketingSpendReadyForReconciliation({...base,receiptName:"receipt.pdf",approvedAt:"2026-11-06T11:00:00Z",approvedBy:"admin"}),true);
 assert.equal(marketingSpendReadyForReconciliation({...base,receiptName:"   ",approvedAt:"2026-11-06T11:00:00Z",approvedBy:"admin"}),false);
});
