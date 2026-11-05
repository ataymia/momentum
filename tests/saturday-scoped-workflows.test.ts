import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import type {Account,Order,WorkspaceUser} from "../lib/types";
import {canVisitRoute,pageForPath,requiresPrototypePage} from "../lib/navigation-route-registry";
import {accountExportRows,contactExportRows,inventoryExportRows,authorizedCustomerOrders,authorizedCustomerOrder,customerDeliveryExportRows} from "../lib/saturday-scoped-workflows";

const account=(id:string,overrides:Partial<Account>={}):Account=>({
  id,name:"Business "+id,location:"Phoenix",channel:"Retail",stage:"Qualified",
  ownerId:"rep-1",contactName:"Contact "+id,contactRole:"Buyer",
  phone:"555-0100",email:"buyer@example.invalid",lastActivity:"",nextAction:"",
  nextActionDate:"2026-11-07",health:"New",lifetimeCases:0,reorderCount:0,notes:"PRIVATE",
  ...overrides,
});
const order=(id:string,accountId:string,overrides:Partial<Order>={}):Order=>({
  id,accountId,number:"GE-"+id,cases:3,pricePerCase:24,amount:72,
  status:"Approved",placedAt:"2026-11-05T10:00:00Z",ownerId:"rep-1",
  priceBasis:"Approved price",paymentStatus:"Open",...overrides,
});
const role=(name:WorkspaceUser["role"]):WorkspaceUser=>({
  id:"test-"+name,email:"test@example.invalid",role:name,team:"Marketing",
  name:"Tester",firstName:"Test",initials:"TT",title:"Tester",accent:"#111",
});

test("customer order and delivery history never crosses explicit account ID boundary",()=>{
  const all=[
    order("owned","account-a"),
    order("foreign","account-b",{placedAt:"2026-11-06T10:00:00Z"}),
    order("qa","account-a",{testOnly:true}),
    order("second","account-a",{placedAt:"2026-11-04T10:00:00Z"}),
  ];
  const ids=new Set(["account-a"]);
  assert.deepEqual(authorizedCustomerOrders(all,ids).map(o=>o.id),["owned","second"]);
  assert.equal(authorizedCustomerOrder(all,ids,"foreign"),undefined);
  assert.equal(authorizedCustomerOrder(all,ids,"qa"),undefined);
  assert.equal(authorizedCustomerOrder(all,ids,"owned")?.accountId,"account-a");
  assert.deepEqual(authorizedCustomerOrders(all,new Set()),[]);
  assert.equal(all.length,4,"read-only selector does not mutate input");
});
test("customer delivery CSV has only order-status fields, not private approval, staff or payment details",()=>{
  const row=customerDeliveryExportRows([order("a","account-a",{paymentStatus:"Partially paid"})])[0];
  assert.deepEqual(row,{order:"GE-a",placed:"2026-11-05",status:"Approved",cases:3,payment:"Partially paid"});
  assert.equal("ownerId" in row,false);
  assert.equal("amount" in row,false);
  assert.equal("accountId" in row,false);
});
test("CRM exports follow filtered caller-owned lists and exclude notes and financial fields",()=>{
  const a=account("a",{postalCode:"85001"}),b=account("b");
  const visible=[a];
  assert.deepEqual(accountExportRows(visible,new Map([["rep-1","Assigned rep"]]))[0],{
    business:"Business a",location:"Phoenix",contact:"Contact a",stage:"Qualified",
    zip:"85001",assignedRep:"Assigned rep",nextAction:"2026-11-07",
  });
  const contacts=contactExportRows(visible);
  assert.equal(contacts.length,1);
  assert.equal(contacts[0].contact,"Contact a");
  assert.equal("notes" in contacts[0],false);
  assert.equal("lifetimeCases" in contacts[0],false);
  assert.equal(contactExportRows([b]).length,1);
});
test("inventory export contains only displayed custody-derived fields",()=>{
  const rows=inventoryExportRows([{
    lot:{id:"lot-a",lotCode:"LOT-A",product:"Golden Eagle",location:"Warehouse",bestBy:"2027-01-01",status:"Quality hold"},
    warehouseOnHand:10,reserved:3,sellable:0,
  }]);
  assert.deepEqual(rows,[{lot:"LOT-A",product:"Golden Eagle",storage:"Warehouse",bestBy:"2027-01-01",onHand:10,reserved:3,available:0,status:"Quality hold"}]);
  assert.equal("id" in rows[0],false);
});
test("customer detail URLs are customer-only, direct-loadable prototype paths",()=>{
  for(const url of ["/portal/deliveries/owned","/portal/orders/owned"]){
    assert.equal(pageForPath(url),"orders");
    assert.equal(requiresPrototypePage(url),true);
    assert.equal(canVisitRoute(role("Customer"),url),true);
    assert.equal(canVisitRoute(role("Administrator"),url),false);
    assert.equal(canVisitRoute(role("Sales Representative"),url),false);
  }
  assert.equal(canVisitRoute(role("Customer"),"/portal/deliveries/owned/edit"),false);
  assert.equal(canVisitRoute(role("Customer"),"/portal/deliveries/"),true);
});
test("visible workflow wiring preserves scoped selection, explicit downloads and no staff-only portal links",()=>{
  const hub=readFileSync("components/prototype/operations-hub.tsx","utf8");
  const inventory=readFileSync("components/prototype/inventory-experience.tsx","utf8");
  assert.match(hub,/authorizedCustomerOrders\(scope\.orders,accountIds\)/);
  assert.match(hub,/authorizedCustomerOrder\(scope\.orders,accountIds,id\)/);
  assert.match(hub,/Download filtered deliveries CSV/);
  assert.match(hub,/Download filtered contacts CSV/);
  assert.match(hub,/Download filtered \{leadMode\?"leads":"accounts"\} CSV/);
  assert.match(hub,/portal\/deliveries\/"/);
  assert.match(inventory,/Download filtered lot register CSV/);
  assert.match(inventory,/inventoryExportRows\(rows\)/);
});
