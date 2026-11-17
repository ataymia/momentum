import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import * as projectionExports from "../functions/src/customer-commerce-projection";
const projection=(projectionExports as unknown as {default?:typeof projectionExports}).default??projectionExports;
const access={role:"Customer",accountState:"Active",email:"shop@example.com"};
const user={role:"Customer",email:"shop@example.com",accountIds:["store-a"]};
const data={
 accounts:[{id:"store-a",name:"Visible",location:"Phoenix"},{id:"store-b",name:"Hidden",location:"Tucson"}],
 orders:[{id:"o1",accountId:"store-a",status:"Delivered",cases:10,number:"GE-101",placedAt:"2026-11-06"},{id:"o2",accountId:"store-b",status:"Delivered",cases:12,number:"GE-202",placedAt:"2026-11-06"},{id:"o3",accountId:"store-a",status:"Awaiting approval"}],
 invoices:[{id:"i1",number:"INV-1",accountId:"store-a",orderId:"o1",status:"Open",issuedAt:"2026-11-06",total:240},
  {id:"i2",number:"INV-2",accountId:"store-b",orderId:"o2",status:"Open",issuedAt:"2026-11-06",total:900},
  {id:"i3",number:"INV-3",accountId:"store-a",orderId:"o3",status:"Open",issuedAt:"2026-11-06",total:999}],
 payments:[{id:"p1",accountId:"store-a",status:"Cleared",amount:100,method:"ACH",receivedAt:"2026-11-07",settledAt:"2026-11-08"},
  {id:"p2",accountId:"store-b",status:"Cleared",amount:999,method:"Card",receivedAt:"2026-11-07"}],
 allocations:[{id:"al1",invoiceId:"i1",paymentId:"p1",amount:100},{id:"al2",invoiceId:"i1",paymentId:"p2",amount:999}],
 credits:[{id:"c1",invoiceId:"i1",status:"Applied",amount:20}],
 refunds:[{id:"r1",paymentId:"p1",status:"Settled",amount:10}],
};
test("D12 verified role, state, email and account assignment are required",()=>{
 assert.deepEqual(projection.customerAccountIds(access,user),["store-a"]);
 assert.deepEqual(projection.customerAccountIds({...access,accountState:"Suspended"},user),[]);
 assert.deepEqual(projection.customerAccountIds({...access,role:"Sales Representative"},user),[]);
 assert.deepEqual(projection.customerAccountIds(access,{...user,email:"other@example.com"}),[]);
 assert.deepEqual(projection.customerAccountIds(access,{...user,accountIds:["../../system"]}),[]);
});
test("D17 account-level server projection does not leak other orders, invoices or payments",()=>{
 const result=projection.projectCustomerFinance(["store-a"],data);
 assert.deepEqual(result.accounts.map(x=>x.id),["store-a"]);
 assert.deepEqual(result.statements.map(x=>x.id),["i1"]);
 assert.deepEqual(result.payments.map(x=>x.id),["al1"]);
 assert.equal(result.statements[0].cleared,90);
 assert.equal(result.statements[0].credits,20);
 assert.equal(result.statements[0].balance,130);
});
test("D17 refuses duplicate invoices for the same source order instead of double billing",()=>{
 const result=projection.projectCustomerFinance(["store-a"],{...data,invoices:[...data.invoices,{...data.invoices[0],id:"i4"}]});
 assert.equal(result.statements.length,0);assert.equal(result.truncated,true);
});
test("D17 endpoint enforces verified bearer identity and reads only server-owned role binding",()=>{
 const src=readFileSync("functions/src/customer-commerce-read.ts","utf8");
 assert.match(src,/verifyIdToken\(token,true\)/);
 assert.match(src,/db\.doc\("userAccess\/"\+uid\)/);
 assert.match(src,/db\.doc\("employeeDirectory\/"\+uid\)/);
 assert.match(src,/customerAccountIds\(access,directory\)/);
 assert.doesNotMatch(src,/request\.body\.accountIds/);
});

test("D17 customer order projection returns only active scoped non-QA orders",()=>{
 const result=projection.projectCustomerFinance(["store-a"],data);
 assert.deepEqual(result.orders.map(o=>o.id),["o1"]);
 assert.equal(result.orders[0].status,"Delivered");
 assert(!JSON.stringify(result).includes("Hidden"));
});

test("R23 revised invoices replace superseded receivables without hiding the current statement",()=>{
 const old={...data.invoices[0],supersededByInvoiceId:"i4"};
 const revised={...data.invoices[0],id:"i4",number:"INV-1-R2",total:230};
 const result=projection.projectCustomerFinance(["store-a"],{
   ...data,invoices:[old,revised,...data.invoices.slice(1)],
   allocations:[],credits:[],refunds:[],
 });
 assert.deepEqual(result.statements.map(row=>row.id),["i4"]);
 assert.equal(result.statements[0].amount,230);
 assert.equal(result.statements[0].balance,230);
 assert.equal(result.truncated,false);
});

test("R30 pending and cleared funds cannot overlap invoice capacity",()=>{
 const pending={id:"p3",accountId:"store-a",status:"Pending",amount:200,
   method:"ACH",receivedAt:"2026-11-08"};
 const allocation={id:"al3",invoiceId:"i1",paymentId:"p3",amount:200};
 const result=projection.projectCustomerFinance(["store-a"],{
   ...data,payments:[...data.payments,pending],allocations:[...data.allocations,allocation],
 });
 assert.deepEqual(result.statements,[]);
 assert.deepEqual(result.payments,[]);
 assert.equal(result.truncated,true);
});

test("R23 unrecognized invoice states never become customer receivables",()=>{
 const forged={...data.invoices[0],status:"Settled"};
 const result=projection.projectCustomerFinance(["store-a"],{
   ...data,invoices:[forged,...data.invoices.slice(1)],
 });
 assert.deepEqual(result.statements,[]);
});

test("R23 prior payments or applied credits block a replacement balance until reconciled",()=>{
 const old={...data.invoices[0],supersededByInvoiceId:"i4"};
 const revised={...data.invoices[0],id:"i4",number:"INV-1-R2",total:230};
 const result=projection.projectCustomerFinance(["store-a"],{
   ...data,invoices:[old,revised,...data.invoices.slice(1)],
 });
 assert.deepEqual(result.statements,[]);
 assert.deepEqual(result.payments,[]);
 assert.equal(result.truncated,true);
});


test("customer product-request detail projection isolates customer identity and source location",()=>{
 const good={
  id:"intake-11111111-1111-4111-8111-111111111111",accountId:"store-a",
  requestedByUid:"buyer-a",customerId:"customer-a",createdAt:"2026-11-16T18:00:00.000Z",
  status:"Needs commercial review",totalCases:14,
  lines:[
   {skuId:"ge-original-250ml-24",description:"Golden Eagle Original 24-pack",cases:10},
   {skuId:"ge-tropical-250ml-24",description:"Golden Eagle Tropical 24-pack",cases:4},
  ],note:"Private buyer narrative must not leak",ownerAtSubmission:"private-rep",
 };
 const locations=[{id:"store-a",customerId:"customer-a"},{id:"store-b",customerId:"customer-b"}];
 const records=[good,
  {...good,id:"intake-22222222-2222-4222-8222-222222222222",accountId:"store-b"},
  {...good,id:"intake-33333333-3333-4333-8333-333333333333",requestedByUid:"buyer-b"},
 ];
 const visible=projection.projectCustomerOrderRequests("buyer-a",["store-a"],records,locations);
 assert.equal(visible.length,1);
 assert.deepEqual(visible[0].lines.map(line=>line.cases),[10,4]);
 assert.equal(visible[0].cases,14);
 assert(!JSON.stringify(visible).includes("Private buyer narrative"));
 assert(!JSON.stringify(visible).includes("private-rep"));
 assert.deepEqual(projection.projectCustomerOrderRequests("buyer-a",[],records,locations),[]);
 assert.deepEqual(projection.projectCustomerOrderRequests("buyer-b",["store-a"],records,locations),[
  {...visible[0],id:"intake-33333333-3333-4333-8333-333333333333"},
 ]);
 const corrupt={...good,lines:[{skuId:"ge-original-250ml-24",description:"Original",cases:10}]};
 const hidden=projection.projectCustomerOrderRequests("buyer-a",["store-a"],[corrupt],locations);
 assert.equal(hidden[0].cases,14);
 assert.deepEqual(hidden[0].lines,[],"Inconsistent source details are not presented as verified");
});


test("customer history denies stale reassociated, deleted and ambiguous location bindings",()=>{
 const good={id:"intake-11111111-1111-4111-8111-111111111111",
  requestedByUid:"buyer-a",accountId:"store-a",customerId:"customer-a",
  createdAt:"2026-11-16T18:00:00.000Z",status:"Needs commercial review",totalCases:2,
  lines:[{skuId:"ge-original-250ml-24",description:"Original",cases:2}]};
 const scope=["store-a"];
 assert.equal(projection.projectCustomerOrderRequests("buyer-a",scope,[good],[{id:"store-a",customerId:"customer-a"}]).length,1);
 assert.deepEqual(projection.projectCustomerOrderRequests("buyer-a",scope,[good],[{id:"store-a",customerId:"customer-new"}]),[]);
 assert.deepEqual(projection.projectCustomerOrderRequests("buyer-a",scope,[good],[]),[]);
 assert.deepEqual(projection.projectCustomerOrderRequests("buyer-a",scope,[good],[{id:"store-a",customerId:"customer-a"},{id:"store-a",customerId:"customer-other"}]),[]);
});

test("recent history is ordered before the database limit and missing index is not a finance outage",()=>{
 const server=readFileSync("functions/src/customer-commerce-read.ts","utf8");
 assert.match(server,/where\("requestedByUid","==",uid\)\.orderBy\("createdAt","desc"\)\.limit\(101\)/);
 assert.match(server,/requestHistoryAvailable=false/);
 assert.match(server,/requestHistoryAvailable=true/);
 const indexes=JSON.parse(readFileSync("firestore.indexes.json","utf8"));
 assert.deepEqual(indexes.indexes.find((i:{collectionGroup:string})=>i.collectionGroup==="commerceOrderIntakes")?.fields,[
  {fieldPath:"requestedByUid",order:"ASCENDING"},{fieldPath:"createdAt",order:"DESCENDING"},
 ]);
});
