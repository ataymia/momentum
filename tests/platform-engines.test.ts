import assert from "node:assert/strict";
import test from "node:test";
import { sourceEvents, createAccountingSeed, buildJournalFromEvent } from "../lib/accounting-engine";
import { evaluateSalesRepAccountBonuses } from "../lib/bonus-engine";
import { createCommerceSeed, computedInvoiceStatus, invoiceBalance, type Payment, type PaymentAllocation, type Refund } from "../lib/commerce-engine";
import { customerForLocation, locationLabel } from "../lib/crm-hierarchy";
import { createDemoData } from "../lib/demo-data";
import { createFinanceSeed } from "../lib/finance-engine";
import { createInventoryLedgerSeed, movementCanPost, nodeLotBalance, warehouseNodeId } from "../lib/inventory-ledger";
import { consumedBonuses, createPayrollSeed, earnedBonusesForMonth, invalidBonusSourcesForRun, type PayRun } from "../lib/payroll-engine";
import { canViewPerformanceRecord, periodRange, userCommercialMetrics } from "../lib/performance-engine";
import type { Order, WorkspaceData, WorkspaceUser } from "../lib/types";

const paidOrder = (id:string,accountId:string,cases:number,placedAt:string,ownerId="usr-jordan"):Order => ({
  id, number:`GE-${id}`, accountId, cases, pricePerCase:24, amount:cases*24,
  status:"Delivered", placedAt, paidAt:placedAt, ownerId, priceBasis:"Demo entered price", paymentStatus:"Paid",
});

test("customer hierarchy keeps parent customer separate from an individual location", () => {
  const data=createDemoData();
  const location={...data.accounts[0],name:"McDonald's #1234",locationName:"McDonald's #1234",customerId:undefined};
  const customer=customerForLocation({...data,accounts:[location]},location);
  assert.equal(customer.name,"McDonald's");
  assert.equal(customer.accountType,"Chain / franchise");
  assert.equal(locationLabel(location),"McDonald's #1234");
});

test("historical sales bonus attribution follows the opening order rep after responsibility changes", () => {
  const base=createDemoData();
  const secondRep:WorkspaceUser={...base.users.find((user)=>user.id==="usr-jordan")!,id:"usr-riley",name:"Riley Demo",firstName:"Riley",email:"riley@example.test",initials:"RD"};
  const account={...base.accounts.find((item)=>item.id==="acc-101")!,ownerId:"usr-riley",originatorId:"usr-jordan"};
  const data:WorkspaceData={...base,users:[...base.users,secondRep],accounts:base.accounts.map((item)=>item.id===account.id?account:item),orders:[paidOrder("opening","acc-101",10,"2026-08-01","usr-jordan")]};
  const opening=evaluateSalesRepAccountBonuses(data,new Date("2026-08-15T12:00:00")).find((signal)=>signal.accountId==="acc-101"&&signal.milestone==="Opening order");
  assert.equal(opening?.repId,"usr-jordan");
  assert.equal(opening?.status,"Earned");
});

test("inventory custody prevents transferring more than the source node holds", () => {
  const data=createDemoData();
  const ledger=createInventoryLedgerSeed(data);
  const lot=data.inventory.find((item)=>item.status==="Available")!;
  const warehouse=nodeLotBalance(ledger,warehouseNodeId,lot.id);
  assert.equal(movementCanPost(ledger,{lotId:lot.id,quantity:warehouse+1,type:"Transfer",fromNodeId:warehouseNodeId,toNodeId:`node-user-usr-jordan`}),false);
  assert.equal(movementCanPost(ledger,{lotId:lot.id,quantity:1,type:"Transfer",fromNodeId:warehouseNodeId,toNodeId:`node-user-usr-jordan`}),true);
});

test("commerce distinguishes partial settlement from full settlement", () => {
  const data=createDemoData();
  const order={...data.orders.find((item)=>item.id==="ord-1049")!,status:"Approved" as const,paymentStatus:"Open" as const};
  const workspace={...data,orders:data.orders.map((item)=>item.id===order.id?order:item)};
  const state=createCommerceSeed(workspace);
  const invoice=state.invoices.find((item)=>item.orderId===order.id)!;
  const payment:Payment={id:"p-half",accountId:invoice.accountId,receivedAt:"2026-08-28T12:00:00Z",amount:invoice.total/2,method:"ACH",status:"Cleared",createdBy:"test",createdAt:"2026-08-28T12:00:00Z"};
  const allocation:PaymentAllocation={id:"a-half",paymentId:payment.id,invoiceId:invoice.id,amount:payment.amount,createdAt:payment.createdAt,createdBy:"test"};
  const partial={...state,payments:[payment],allocations:[allocation]};
  assert.equal(computedInvoiceStatus(partial,invoice),"Partially paid");
  assert.equal(invoiceBalance(partial,invoice),invoice.total/2);
  const second:Payment={...payment,id:"p-final",amount:invoice.total/2};
  const secondAllocation:PaymentAllocation={...allocation,id:"a-final",paymentId:second.id,amount:second.amount};
  const paid={...partial,payments:[payment,second],allocations:[allocation,secondAllocation]};
  assert.equal(computedInvoiceStatus(paid,invoice),"Paid");
  assert.equal(invoiceBalance(paid,invoice),0);
});

test("a settled customer refund reopens the receivable instead of leaving the invoice falsely paid", () => {
  const data=createDemoData();
  const order={...data.orders.find((item)=>item.id==="ord-1049")!,status:"Approved" as const,paymentStatus:"Open" as const};
  const workspace={...data,orders:data.orders.map((item)=>item.id===order.id?order:item)};
  const state=createCommerceSeed(workspace);
  const invoice=state.invoices.find((item)=>item.orderId===order.id)!;
  const payment:Payment={id:"p-full",accountId:invoice.accountId,receivedAt:"2026-08-28T12:00:00Z",amount:invoice.total,method:"ACH",status:"Cleared",createdBy:"test",createdAt:"2026-08-28T12:00:00Z"};
  const allocation:PaymentAllocation={id:"a-full",paymentId:payment.id,invoiceId:invoice.id,amount:payment.amount,createdAt:payment.createdAt,createdBy:"test"};
  const settled:Refund={id:"refund-partial",paymentId:payment.id,amount:24,reason:"One-case customer adjustment",status:"Settled",createdAt:"2026-08-29T12:00:00Z",createdBy:"test",settledAt:"2026-08-30T12:00:00Z"};
  const refunded={...state,payments:[payment],allocations:[allocation],refunds:[settled]};
  assert.equal(computedInvoiceStatus(refunded,invoice),"Partially paid");
  assert.equal(invoiceBalance(refunded,invoice),24);
});

test("accounting inbox connects cleared payments and blocks inventory values until cost policy exists", () => {
  const data=createDemoData();
  const commerce=createCommerceSeed(data);
  const inventory=createInventoryLedgerSeed(data);
  const events=sourceEvents(commerce,inventory,createPayrollSeed(),createFinanceSeed());
  assert.ok(events.some((event)=>event.type==="Payment cleared"&&event.amount));
  assert.ok(events.some((event)=>event.type==="Inventory receipt"&&event.blockedReason));
  const paymentEvent=events.find((event)=>event.type==="Payment cleared")!;
  const accounting=createAccountingSeed();
  const configured={...accounting,rules:[{id:"r",eventType:"Payment cleared" as const,debitAccountId:"acct-cash",creditAccountId:"acct-ar",effectiveDate:"2020-01-01",active:true,memoTemplate:"{description}"}]};
  const journal=buildJournalFromEvent(configured,paymentEvent,"test");
  assert.ok(journal);
  assert.equal(journal?.lines.reduce((sum,line)=>sum+line.debit,0),journal?.lines.reduce((sum,line)=>sum+line.credit,0));
});

test("monthly bonus payroll consumption prevents the same earned bonus from entering a second active run", () => {
  const base=createDemoData();
  const data={...base,orders:[...base.orders.filter((item)=>item.accountId!=="acc-101"),paidOrder("opening","acc-101",10,"2026-08-01")]};
  const state=createPayrollSeed();
  const available=earnedBonusesForMonth(state,data,"2026-08");
  const opening=available.find((item)=>item.signal.id==="bonus-acc-101-opening");
  assert.ok(opening);
  const run:PayRun={id:"run-1",kind:"Monthly bonus",createdAt:"2026-08-31T12:00:00Z",periodStart:"2026-08-01",periodEnd:"2026-08-31",payDate:"2026-09-01",status:"Draft",lines:[{employeeId:"usr-jordan",regularHours:0,overtimeHours:0,regularPay:0,overtimePay:0,bonusPay:25,grossPay:25,benefitDeduction:0,taxableWages:25,federalTax:0,stateTax:0,localTax:0,additionalWithholding:0,postTaxDeduction:0,employeeTaxes:0,employerTaxes:0,netPay:25,sourceTimecardIds:[],sourceBonusIds:[opening!.signal.id]}]};
  const consumed={...state,runs:[run]};
  assert.equal(consumedBonuses(consumed).has(opening!.signal.id),true);
  assert.equal(earnedBonusesForMonth(consumed,data,"2026-08").some((item)=>item.signal.id===opening!.signal.id),false);
});

test("payroll detects a bonus source that stopped being earned after customer payment reversal", () => {
  const base=createDemoData();
  const earnedData={...base,orders:[...base.orders.filter((item)=>item.accountId!=="acc-101"),paidOrder("opening","acc-101",10,"2026-08-01")]};
  const bonusId="bonus-acc-101-opening";
  const run:PayRun={id:"run-stale",kind:"Monthly bonus",createdAt:"2026-08-31T12:00:00Z",periodStart:"2026-08-01",periodEnd:"2026-08-31",payDate:"2026-09-01",status:"Approved",lines:[{employeeId:"usr-jordan",regularHours:0,overtimeHours:0,regularPay:0,overtimePay:0,bonusPay:25,grossPay:25,benefitDeduction:0,taxableWages:25,federalTax:0,stateTax:0,localTax:0,additionalWithholding:0,postTaxDeduction:0,employeeTaxes:0,employerTaxes:0,netPay:25,sourceTimecardIds:[],sourceBonusIds:[bonusId]}]};
  assert.deepEqual(invalidBonusSourcesForRun(run,earnedData),[]);
  const reversedData={...earnedData,orders:earnedData.orders.map((order)=>order.id==="opening"?{...order,paymentStatus:"Open" as const,paidAt:undefined}:order)};
  assert.deepEqual(invalidBonusSourcesForRun(run,reversedData),[bonusId]);
});

test("performance metrics count cleared orders and manager visibility follows reporting hierarchy", () => {
  const base=createDemoData();
  const data={...base,orders:[...base.orders.filter((item)=>item.accountId!=="acc-101"),paidOrder("metric","acc-101",12,"2026-08-05")]};
  const metrics=userCommercialMetrics(data,"usr-jordan","2026-08-01","2026-08-31");
  assert.equal(metrics.paidCases,12);
  assert.equal(metrics.paidOrders,1);
  const manager=base.users.find((user)=>user.id==="usr-avery")!;
  const rep=base.users.find((user)=>user.id==="usr-jordan")!;
  assert.equal(canViewPerformanceRecord(manager,rep.id,data),true);
  assert.equal(canViewPerformanceRecord(rep,manager.id,data),false);
  assert.deepEqual(periodRange("Weekly","2026-08-28"),{start:"2026-08-24",end:"2026-08-30"});
});
