import assert from "node:assert/strict";
import test from "node:test";
import * as imported from "../functions/src/customer-commerce-projection";
const fn=(imported as unknown as {default?:typeof imported}).default??imported;
const base={
 accounts:[{id:"store",name:"Retailer",location:"Phoenix"}],
 orders:[{id:"o1",accountId:"store",status:"Delivered"},{id:"o2",accountId:"store",status:"Delivered"}],
 invoices:[{id:"i1",number:"INV-1",accountId:"store",orderId:"o1",status:"Open",total:100,issuedAt:"2026-11-07"},
  {id:"i2",number:"INV-2",accountId:"store",orderId:"o2",status:"Open",total:100,issuedAt:"2026-11-07"}],
 payments:[{id:"p1",accountId:"store",status:"Cleared",amount:100,receivedAt:"2026-11-07"}],
 allocations:[{id:"a1",paymentId:"p1",invoiceId:"i1",amount:50},{id:"a2",paymentId:"p1",invoiceId:"i2",amount:50}],
 credits:[],
 refunds:[{id:"r1",paymentId:"p1",status:"Settled",amount:40}],
};
test("D16/D17 shared refunded payments do not subtract a full refund from every invoice",()=>{
 const result=fn.projectCustomerFinance(["store"],base);
 assert.equal(result.statements.length,0);
 assert.equal(result.payments.length,0);
 assert.equal(result.truncated,true);
});
test("D16/D17 over-allocated payment is not presented as collected cash",()=>{
 const data={...base,allocations:[{id:"a1",paymentId:"p1",invoiceId:"i1",amount:70},{id:"a2",paymentId:"p1",invoiceId:"i2",amount:70}],refunds:[]};
 const result=fn.projectCustomerFinance(["store"],data);
 assert.equal(result.statements.length,0);
 assert.equal(result.truncated,true);
});
test("D17 isolated fully allocated payment and balanced credit produce only linked statement",()=>{
 const data={...base,allocations:[{id:"a1",paymentId:"p1",invoiceId:"i1",amount:100}],refunds:[],credits:[{id:"c1",invoiceId:"i2",status:"Applied",amount:20}]};
 const result=fn.projectCustomerFinance(["store"],data);
 assert.equal(result.statements.length,2);
 const one=result.statements.find(r=>r.id==="i1");
 const two=result.statements.find(r=>r.id==="i2");
 assert.equal(one?.balance,0);assert.equal(two?.balance,80);
 assert.equal(one?.status,"Zero balance recorded (not bank verified)");
});
