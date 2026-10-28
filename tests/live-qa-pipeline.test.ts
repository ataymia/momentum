import assert from "node:assert/strict";
import test from "node:test";
import {registerLiveTestSkus,skuForProductName,activeProductSkus} from "../lib/product-catalog";
import {normalizeCommercialState} from "../lib/commercial-state";
import {createCommerceSeed} from "../lib/commerce-engine";
import {reviewSalesCommissionBacklog} from "../lib/sales-commission-backlog";
import {notificationCandidates} from "../functions/src/notification-candidates";
import type {WorkspaceData} from "../lib/types";

const sku={id:"qa-live-widget-100",description:"QA Live Widget (test only)",
 shortName:"QA Widget",casePack:24,active:true,testOnly:true,environment:"production"};
const qaOrder={id:"qa-live-order-100",number:"GE-QA-100",
 accountId:"qa-account-1",cases:6,pricePerCase:0,amount:0,
 status:"Approved",paymentStatus:"Not invoiced",priceBasis:"INTERNAL QA - $0, NO REAL INVENTORY",
 ownerId:"admin-1",placedAt:"2026-10-28",product:sku.description,
 creditedRepId:undefined,inventoryAvailableAtOrder:0,lowStockApprovalRequired:false,
 testOnly:true,testSkuId:sku.id,
 lines:[{id:"qa-line-1",product:sku.description,cases:6,pricePerCase:0,amount:0}]};
const data={users:[{id:"admin-1",name:"QA Administrator",role:"Administrator"},
 {id:"rep-1",name:"Test Rep",role:"Sales Representative"}],
 accounts:[{id:"qa-account-1",name:"QA Account",location:"Phoenix",postalCode:"85001"}],
 customers:[],inventory:[],orders:[],appointments:[],approvals:[],activities:[],
 placements:[],territories:[]} as unknown as WorkspaceData;
const state=(order:unknown)=>({version:1,orders:[order],accountPatches:{},
 customerPatches:{},appointments:[],approvals:[],activities:[],inventoryLots:[],territories:[]});

test("live QA SKU is a selectable exact catalog product but never a canonical Golden Eagle SKU",()=>{
 registerLiveTestSkus([sku]);
 try{
  assert.equal(skuForProductName(sku.description)?.id,sku.id);
  assert.equal(skuForProductName(sku.description)?.testOnly,true);
  assert.equal(activeProductSkus(false).some(x=>x.id===sku.id),false);
  assert.equal(activeProductSkus(true).some(x=>x.id===sku.id),true);
 }finally{registerLiveTestSkus([]);}
});

test("only administrator-owned zero-dollar QA order survives normalization",()=>{
 const ok=normalizeCommercialState(state(qaOrder),data,"2026-10-28");
 assert.equal(ok.orders.length,1);
 assert.equal(ok.orders[0].testOnly,true);
 assert.equal(ok.orders[0].lines?.[0].amount,0);
 for(const invalid of [
  {...qaOrder,ownerId:"rep-1"},
  {...qaOrder,testOnly:false},
  {...qaOrder,pricePerCase:24},
  {...qaOrder,paymentStatus:"Paid"},
  {...qaOrder,creditedRepId:"rep-1"},
 ]){
  assert.equal(normalizeCommercialState(state(invalid),data,"2026-10-28").orders.length,0);
 }
});

test("zero-dollar internal QA orders never create invoices, seeded payments or commissions",()=>{
 const source={...data,orders:[qaOrder]} as WorkspaceData;
 const commerce=createCommerceSeed(source);
 assert.equal(commerce.invoices.length,0);
 assert.equal(commerce.payments.length,0);
 assert.equal(commerce.allocations.length,0);
 assert.equal(reviewSalesCommissionBacklog(source,commerce).length,0);
});

test("QA approval transition cannot create even a review-only mail candidate",()=>{
 const before={items:[{...qaOrder,status:"Awaiting approval"}]};
 const after={items:[{...qaOrder,status:"Approved"}]};
 assert.deepEqual(notificationCandidates("domains/commercial/fields/orders",
   before,after,"evt-qa-100","2026-10-28T20:00:00.000Z"),[]);
});
