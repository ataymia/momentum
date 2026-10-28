import assert from "node:assert/strict";
import test from "node:test";
import {normalizeCommercialState} from "../lib/commercial-state";
import {createCommerceSeed} from "../lib/commerce-engine";
import {reviewSalesCommissionBacklog} from "../lib/sales-commission-backlog";
import {registerLiveTestSkus,activeProductSkus,skuForProductName} from "../lib/product-catalog";
import type {Order,WorkspaceData,WorkspaceUser} from "../lib/types";

const admin={id:"admin-qa",name:"QA Admin",role:"Administrator",team:"Leadership",
 title:"Administrator",firstName:"QA",email:"qa@example.test",initials:"QA",accent:"#000"} as WorkspaceUser;
const rep={...admin,id:"rep-qa",role:"Sales Representative",title:"Representative"} as WorkspaceUser;
const product="QA Internal Widget Only";
const account={id:"acc-qa",name:"QA Account",location:"Phoenix",stage:"Opening order",
 channel:"Retail",ownerId:admin.id,contactName:"QA",contactRole:"Owner",phone:"1",email:"a@b.com",
 lastActivity:"",nextAction:"",nextActionDate:"2026-10-01",health:"New",
 lifetimeCases:0,reorderCount:0,notes:""};
const data={users:[admin,rep],accounts:[account],customers:[],activities:[],appointments:[],orders:[],
 placements:[],inventory:[],approvals:[],timeEntries:[],timecards:[],notifications:[],
 bulletins:[],territories:[]} as unknown as WorkspaceData;
const qaOrder={id:"order-qa",number:"GE-QA-01",accountId:"acc-qa",cases:2,pricePerCase:0,
 amount:0,status:"Approved",placedAt:"2026-10-28",ownerId:admin.id,
 priceBasis:"INTERNAL QA - $0, NO REAL INVENTORY",paymentStatus:"Not invoiced",
 product,inventoryAvailableAtOrder:0,testOnly:true,testSkuId:"qa-live-widget-001",
 lines:[{id:"order-qa-line-1",product,cases:2,pricePerCase:0,amount:0}]} as Order;

test("live QA catalog is administrator orderable but never joins the sellable product list",()=>{
  registerLiveTestSkus([{id:"qa-live-widget-001",description:product,shortName:"QA Widget",
   casePack:24,active:true,testOnly:true}]);
  assert.equal(skuForProductName(product)?.testOnly,true);
  assert.equal(activeProductSkus(false).some(s=>s.description===product),false);
  assert.equal(activeProductSkus(true).some(s=>s.description===product),true);
  registerLiveTestSkus([]);
});

test("normalization retains legitimate zero-dollar QA order while rejecting free sellable and non-admin QA orders",()=>{
  const input={version:1,orders:[qaOrder]};
  const valid=normalizeCommercialState(input,data,"2026-10-28");
  assert.equal(valid.orders.length,1);
  assert.equal(valid.orders[0].testOnly,true);
  assert.equal(valid.orders[0].amount,0);
  assert.equal(normalizeCommercialState({...input,orders:[{...qaOrder,testOnly:false}]},data,"2026-10-28").orders.length,0);
  assert.equal(normalizeCommercialState({...input,orders:[{...qaOrder,ownerId:rep.id}]},data,"2026-10-28").orders.length,0);
});

test("internal QA orders never create receivables or earn commissions",()=>{
  const workspace={...data,orders:[qaOrder]} as WorkspaceData;
  const commerce=createCommerceSeed(workspace);
  assert.equal(commerce.invoices.length,0);
  assert.equal(commerce.payments.length,0);
  assert.equal(reviewSalesCommissionBacklog(workspace,commerce).length,0);
});
