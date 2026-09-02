import assert from "node:assert/strict";
import test from "node:test";
import { ACCOUNT_PRICING_TIERS, accountHealthSnapshot, pricingTierPrice } from "../lib/account-health";
import { canAccessPage, getWorkspaceScope } from "../lib/access";
import { createDemoData } from "../lib/demo-data";
import { createInventoryLedgerSeed, productInventoryStatus } from "../lib/inventory-ledger";
import type { Order, WorkspaceData, WorkspaceUser } from "../lib/types";

const paid=(id:string,accountId:string,cases:number,placedAt:string,ownerId="usr-jordan"):Order=>({id,number:`GE-${id}`,accountId,cases,pricePerCase:24,amount:cases*24,status:"Delivered",placedAt,paidAt:placedAt,ownerId,creditedRepId:ownerId,product:"Golden Eagle · tour SKU",priceBasis:"Account pricing tier",paymentStatus:"Paid"});

test("ABC pricing is explicit and does not need a volume calculation",()=>{
  assert.equal(pricingTierPrice("A"),24);
  assert.equal(pricingTierPrice("B"),27);
  assert.equal(pricingTierPrice("C"),30);
  assert.equal(ACCOUNT_PRICING_TIERS.A.pricePerCase,24);
});

test("account health tracks last order and rolling three-month paid average",()=>{
  const base=createDemoData();
  const account={...base.accounts[0],pricingTier:"B" as const,categoryReviewDate:"2026-09-30"};
  const data:WorkspaceData={...base,accounts:base.accounts.map((item)=>item.id===account.id?account:item),orders:[paid("one",account.id,30,"2026-06-15"),paid("two",account.id,30,"2026-08-15")]};
  const snapshot=accountHealthSnapshot(data,account,new Date("2026-09-01T12:00:00"));
  assert.equal(snapshot.lastOrderDate,"2026-08-15");
  assert.equal(snapshot.daysSinceLastOrder,17);
  assert.equal(snapshot.rolling90PaidCases,60);
  assert.equal(snapshot.rolling3MonthMonthlyAverage,20);
  assert.equal(snapshot.pricePerCase,27);
});

test("inventory thresholds use available sellable cases",()=>{
  const base=createDemoData();
  const lowLot={id:"lot-low",lotCode:"LOW",product:"Golden Eagle Tropical · demo SKU",receivedAt:"2026-08-01",bestBy:"2027-08-01",onHand:44,reserved:0,available:44,status:"Low stock" as const,location:"Warehouse"};
  const data={...base,inventory:[...base.inventory,lowLot]};
  const ledger=createInventoryLedgerSeed(data);
  const low=productInventoryStatus(ledger,data,lowLot.product);
  assert.equal(low.available,44);
  assert.equal(low.requiresManagerApproval,true);
  assert.equal(low.reorderNeeded,true);
  const standard=productInventoryStatus(ledger,data,base.inventory.find((lot)=>lot.status==="Available")!.product);
  assert.equal(standard.available,base.inventory.find((lot)=>lot.status==="Available")!.onHand);
  assert.equal(standard.reorderNeeded,standard.available<500);
});

test("warehouse role sees warehouse work but not sales, finance, or administration",()=>{
  const base=createDemoData();
  const warehouse:WorkspaceUser={id:"usr-warehouse",name:"Warehouse Demo",firstName:"Warehouse",email:"warehouse@momentum.demo",initials:"WH",title:"Warehouse Coordinator",role:"Warehouse",team:"Operations",managerId:"usr-mia",accent:"#53657d"};
  const data={...base,users:[...base.users,warehouse]};
  const scope=getWorkspaceScope(data,warehouse);
  assert.equal(scope.orders.length,data.orders.length);
  assert.equal(scope.inventory.length,data.inventory.length);
  assert.equal(canAccessPage(warehouse,"inventory"),true);
  assert.equal(canAccessPage(warehouse,"orders"),true);
  assert.equal(canAccessPage(warehouse,"accounts"),false);
  assert.equal(canAccessPage(warehouse,"finance"),false);
  assert.equal(canAccessPage(warehouse,"settings"),false);
});

test("order sales credit remains with the creating rep after account responsibility changes",()=>{
  const base=createDemoData();
  const secondRep:WorkspaceUser={...base.users.find((user)=>user.id==="usr-jordan")!,id:"usr-riley",name:"Riley Demo",firstName:"Riley",email:"riley@example.test",initials:"RD"};
  const order=paid("credited","acc-101",10,"2026-08-15","usr-jordan");
  const transferredAccount={...base.accounts.find((account)=>account.id==="acc-101")!,ownerId:secondRep.id,accountManagerId:secondRep.id};
  const data:WorkspaceData={...base,users:[...base.users,secondRep],accounts:base.accounts.map((account)=>account.id===transferredAccount.id?transferredAccount:account),orders:[order]};
  assert.equal(data.accounts.find((account)=>account.id==="acc-101")?.ownerId,"usr-riley");
  assert.equal(data.orders[0].creditedRepId,"usr-jordan");
});
