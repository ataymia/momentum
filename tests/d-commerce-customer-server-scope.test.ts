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
