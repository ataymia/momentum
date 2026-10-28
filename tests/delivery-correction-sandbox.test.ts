import assert from "node:assert/strict";
import test from "node:test";
import * as correctionImported from "../functions/src/delivery-correction-policy";
import {isolatedSkuUse,sandboxCanPostProductionSideEffects,validateCustomSku} from "../lib/custom-sku-policy";
import * as inventoryImported from "../functions/src/delivery-inventory-revision";
import * as financialImported from "../functions/src/correction-financial-plan";
import * as accountingImported from "../functions/src/correction-accounting-plan";
import {normalizeInventoryLedger,orderDeliveryQuantity} from "../lib/inventory-ledger";
import {GOLDEN_EAGLE_SKUS} from "../lib/product-catalog";
import type {WorkspaceData} from "../lib/types";

const correctionModule=correctionImported as typeof correctionImported & {default?:typeof correctionImported};
const {canonicalLines,orderLinesReconcile,correctionDiff,correctionApprovalGate,correctionCloseGate}=correctionModule.default??correctionModule;
const inventoryModule=inventoryImported as typeof inventoryImported & {default?:typeof inventoryImported};
const {planDeliveredInventoryCorrection}=inventoryModule.default??inventoryModule;

const originals=[{product:"Golden Eagle Original",cases:10,pricePerCase:24}];

test("delivered-order correction does not silently change approved prices",()=>{
  const result=correctionDiff(originals,[{product:"Golden Eagle Original",cases:8,pricePerCase:1}]);
  assert.equal(result.ok,true);
  assert.equal(result.total,192);
  assert.equal(result.lines[0].pricePerCase,24);
  assert.equal(result.quantityChanged,true);
});

test("delivered correction rejects invalid SKUs, quantities and missing inventory reconciliation",()=>{
  assert.equal(correctionDiff(originals,[{product:"Fictional",cases:8}]).ok,false);
  assert.equal(correctionDiff(originals,[{product:"Golden Eagle Original",cases:0}]).ok,false);
  const gate={requesterUid:"admin-one",approverUid:"admin-two",
    activeAdministrator:true,originalRevision:"version1",currentRevision:"version1",
    quantityChanged:true,hasFinancialActivity:false,hasInventoryReconciliation:false};
  assert.match(correctionApprovalGate(gate)??"",/inventory custody reconciliation/);
  assert.match(correctionApprovalGate({...gate,quantityChanged:false,hasFinancialActivity:true})??"",/Finance reconciliation/);
  assert.match(correctionApprovalGate({...gate,quantityChanged:false,approverUid:"admin-one"})??"",/Another Administrator/);
  assert.match(correctionApprovalGate({...gate,quantityChanged:false,currentRevision:"version2"})??"",/changed/);
  assert.equal(correctionApprovalGate({...gate,quantityChanged:false}),null);
});

test("manual testing SKUs are separate from production and cannot resemble canonical brands",()=>{
  const valid=validateCustomSku({description:"QA Widget Prototype",shortName:"QA Widget",casePack:24,environment:"sandbox"},[]);
  assert.equal(valid.ok,true);
  assert.equal(validateCustomSku({description:"Golden Eagle Original",shortName:"Test",casePack:24,environment:"sandbox"},[]).ok,false);
  assert.equal(validateCustomSku({description:"QA Widget Prototype",shortName:"QA Widget",casePack:24,environment:"production"},[]).ok,false);
  assert.equal(validateCustomSku({description:"QA Widget Prototype",shortName:"QA Widget",casePack:24,environment:"sandbox"},[{description:"qa widget prototype",environment:"sandbox"}]).ok,false);
  assert.equal(isolatedSkuUse({environment:"sandbox"},"production"),false);
  assert.equal(isolatedSkuUse({environment:"sandbox"},"sandbox"),true);
  assert.equal(sandboxCanPostProductionSideEffects("sandbox"),false);
});

test("delivered reduction moves only verified lot stock from customer custody into quarantine",()=>{
  const entry={accountId:"acc-1",original:originals,
    proposed:[{...originals[0],cases:8}],
    lots:[{id:"lot-one",product:"Golden Eagle Original"}],
    nodes:[{id:"node-account-acc-1",type:"Customer"},
      {id:"node-quality-hold",type:"Quality hold"},
      {id:"node-warehouse-main",type:"Warehouse"}],
    reservations:[],
    orderId:"order-1",
    movements:[{lotId:"lot-one",fromNodeId:"node-warehouse-main",
      toNodeId:"node-account-acc-1",quantity:10,type:"Delivery",relatedOrderId:"order-1"}],
    adjustments:[{lotId:"lot-one",product:"Golden Eagle Original",quantity:2,
      fromNodeId:"node-account-acc-1",toNodeId:"node-quality-hold",
      evidenceReference:"confirmed-physical-return"}],
  };
  const valid=planDeliveredInventoryCorrection(entry);
  assert.equal(valid.ok,true);
  if(valid.ok){
    assert.equal(valid.movements.length,1);
    assert.equal(valid.movements[0].type,"Return");
    assert.equal(valid.movements[0].toNodeId,"node-quality-hold");
  }
  assert.equal(planDeliveredInventoryCorrection({...entry,adjustments:[
    {...entry.adjustments[0],quantity:3}]}).ok,false);
  assert.equal(planDeliveredInventoryCorrection({...entry,adjustments:[
    {...entry.adjustments[0],toNodeId:"node-warehouse-main"}]}).ok,false);
  assert.equal(planDeliveredInventoryCorrection({...entry,adjustments:[
    {...entry.adjustments[0],lotId:"missing"}]}).ok,false);
  assert.equal(planDeliveredInventoryCorrection({...entry,adjustments:[
    {...entry.adjustments[0],quantity:11}]}).ok,false);
  // Customer may hold another order's cases of the same SKU/lot.
  // Existing customer custody is not automatically attributable to this order.
  const wrongOrder={...entry,movements:[
    {...entry.movements[0],relatedOrderId:"another-order"},
  ]};
  assert.equal(planDeliveredInventoryCorrection(wrongOrder).ok,false);
  const invalidHold={...entry,nodes:entry.nodes.map(n=>n.id==="node-quality-hold"?
    {...n,type:"Warehouse"}:n)};
  assert.equal(planDeliveredInventoryCorrection(invalidHold).ok,false);
});

test("delivered additions must come from verified company custody",()=>{
  const initial={accountId:"acc-1",original:originals,
    proposed:[{...originals[0],cases:12}],
    lots:[{id:"lot-one",product:"Golden Eagle Original"}],
    nodes:[{id:"node-account-acc-1",type:"Customer"},
      {id:"node-warehouse-main",type:"Warehouse"}],
    reservations:[],
    orderId:"order-1",
    movements:[{lotId:"lot-one",fromNodeId:"node-external",
      toNodeId:"node-warehouse-main",quantity:20,type:"Receipt"}],
    adjustments:[{lotId:"lot-one",product:"Golden Eagle Original",quantity:2,
      fromNodeId:"node-warehouse-main",toNodeId:"node-account-acc-1",
      evidenceReference:"verified-custody-and-delivery"}],
  };
  const valid=planDeliveredInventoryCorrection(initial);
  assert.equal(valid.ok,true);
  if(valid.ok)assert.equal(valid.movements[0].type,"Delivery");
  assert.equal(planDeliveredInventoryCorrection({...initial,adjustments:[
    {...initial.adjustments[0],fromNodeId:"node-external"}]}).ok,false);
});

test("correction deliveries cannot consume warehouse cases reserved for another order",()=>{
  const input={accountId:"acc-1",orderId:"order-1",original:originals,
    proposed:[{...originals[0],cases:12}],
    lots:[{id:"lot-one",product:"Golden Eagle Original"}],
    nodes:[{id:"node-account-acc-1",type:"Customer"},{id:"node-warehouse-main",type:"Warehouse"}],
    movements:[{lotId:"lot-one",fromNodeId:"node-external",toNodeId:"node-warehouse-main",quantity:3}],
    reservations:[{status:"Active",lotId:"lot-one",orderId:"other-order",quantity:2}],
    adjustments:[{lotId:"lot-one",product:"Golden Eagle Original",quantity:2,
      fromNodeId:"node-warehouse-main",toNodeId:"node-account-acc-1",
      evidenceReference:"verified-custody-and-delivery"}],
  };
  assert.equal(planDeliveredInventoryCorrection(input).ok,false);
  assert.equal(planDeliveredInventoryCorrection({...input,reservations:[]}).ok,true);
});

test("inventory normalization preserves fulfilled 10-case reservation after a 10-to-8 correction",()=>{
  const product=GOLDEN_EAGLE_SKUS[0].description;
  const date="2026-10-20T14:00:00.000Z";
  const data={
    users:[],accounts:[{id:"acc-1",name:"Licensed Market LLC"}],
    inventory:[{id:"lot-one",lotCode:"LOT-ONE",product,receivedAt:date,bestBy:"2027-01-01",
      onHand:10,reserved:0,available:10,status:"Available",location:"Warehouse"}],
    orders:[{id:"order-1",number:"GE-1",accountId:"acc-1",cases:8,amount:192,
      pricePerCase:24,product,status:"Delivered",placedAt:date,ownerId:"admin-1",
      priceBasis:"Approved",paymentStatus:"Open",
      lines:[{id:"order-1-line-1",product,cases:8,amount:192,pricePerCase:24}]}],
  } as unknown as WorkspaceData;
  const result=normalizeInventoryLedger({version:1,nodes:[],movements:[
    {id:"delivery-1",lotId:"lot-one",product,quantity:10,type:"Delivery",
      fromNodeId:"node-warehouse-main",toNodeId:"node-account-acc-1",
      relatedOrderId:"order-1",reason:"Original fulfilled delivery",at:date,actorId:"admin-1"},
    {id:"return-1",lotId:"lot-one",product,quantity:2,type:"Return",
      fromNodeId:"node-account-acc-1",toNodeId:"node-quality-hold",
      relatedOrderId:"order-1",reason:"Approved correction",at:date,
      actorId:"admin-2",correctionRequestId:"correction-123"},
  ],reservations:[{id:"res-one",orderId:"order-1",lotId:"lot-one",quantity:10,
    status:"Fulfilled",createdAt:date,createdBy:"admin-1",fulfilledAt:date}],
    counts:[]},data);
  assert.equal(result.reservations.length,1);
  assert.equal(result.reservations[0].status,"Fulfilled");
  assert.equal(orderDeliveryQuantity(result,"order-1"),8);
});


test("duplicate order lines with the same SKU aggregate before inventory correction",()=>{
  const product="Golden Eagle Original";
  const original=[{product,cases:4,pricePerCase:24},{product,cases:6,pricePerCase:24}];
  const proposed=[{product,cases:3,pricePerCase:24},{product,cases:5,pricePerCase:24}];
  const input={accountId:"acc-1",orderId:"order-1",original,proposed,
    lots:[{id:"lot-one",product,status:"Available"}],
    nodes:[{id:"node-account-acc-1",type:"Customer"},{id:"node-quality-hold",type:"Quality hold"}],
    movements:[{lotId:"lot-one",fromNodeId:"node-warehouse-main",
      toNodeId:"node-account-acc-1",quantity:10,type:"Delivery",relatedOrderId:"order-1"}],
    reservations:[],
    adjustments:[{lotId:"lot-one",product,quantity:2,
      fromNodeId:"node-account-acc-1",toNodeId:"node-quality-hold",
      evidenceReference:"signed-return-physical-proof"}],
  };
  const result=planDeliveredInventoryCorrection(input);
  assert.equal(result.ok,true);
  if(result.ok)assert.equal(result.movements.reduce((sum,r)=>sum+r.quantity,0),2);
});


test("historic correction refuses malformed or inconsistent original order lines",()=>{
  const valid={id:"order-one",cases:10,amount:240,
    lines:[{product:"Golden Eagle Original",cases:10,pricePerCase:24}]};
  assert.equal(orderLinesReconcile(valid,canonicalLines(valid)),true);
  assert.equal(orderLinesReconcile({...valid,amount:239},canonicalLines(valid)),false);
  assert.equal(orderLinesReconcile({...valid,cases:9},canonicalLines(valid)),false);
  const malformed={...valid,lines:[...valid.lines,{product:"Golden Eagle Red",cases:-1,pricePerCase:24}]};
  assert.equal(canonicalLines(malformed).length,0);
});


test("correction withdrawal and rejection are separate authorized, non-inventory decisions",()=>{
  const original={actorUid:"admin-one",requesterUid:"admin-one",activeAdministrator:true,decision:"Withdraw" as const};
  assert.equal(correctionCloseGate(original),null);
  assert.match(correctionCloseGate({...original,actorUid:"admin-two"})??"",/requester/);
  assert.match(correctionCloseGate({...original,activeAdministrator:false})??"",/active Administrator/);
  assert.match(correctionCloseGate({...original,decision:"Reject"})??"",/Another Administrator/);
  assert.equal(correctionCloseGate({...original,actorUid:"admin-two",decision:"Reject"}),null);
});


const financeModule=financialImported as typeof financialImported & {default?:typeof financialImported};
const {planFinancialCarry}=financeModule.default??financeModule;

test("paid historical corrections automatically carry money and record account credit due",()=>{
  const input={oldInvoiceId:"invoice-old",newInvoiceId:"invoice-amended",accountId:"account-1",newTotal:192,
    allocations:[{id:"allocation-1",invoiceId:"invoice-old",paymentId:"payment-1",amount:240}],
    payments:[{id:"payment-1",accountId:"account-1",status:"Cleared",amount:240}],
    credits:[],refunds:[]};
  const plan=planFinancialCarry(input);
  assert.equal(plan.ok,true);
  if(!plan.ok)return;
  assert.equal(plan.status,"Paid");
  assert.equal(plan.paidNet,192);
  assert.equal(plan.creditDue,48);
  assert.deepEqual(plan.allocations.map(x=>[x.paymentId,x.invoiceId,x.amount]),
    [["payment-1","invoice-amended",192]]);
  const increase=planFinancialCarry({...input,newTotal:300});
  assert.equal(increase.ok,true);
  if(increase.ok){assert.equal(increase.status,"Partially paid");assert.equal(increase.paidNet,240);assert.equal(increase.creditDue,0);}
});

test("automatic financial correction preserves applied credit and refunds safely",()=>{
  const basic={oldInvoiceId:"invoice-old",newInvoiceId:"invoice-amended",accountId:"account-1",newTotal:110,
    allocations:[{id:"allocation-1",invoiceId:"invoice-old",paymentId:"payment-1",amount:100}],
    payments:[{id:"payment-1",accountId:"account-1",status:"Cleared",amount:100}],
    credits:[{id:"credit-1",invoiceId:"invoice-old",amount:20,status:"Applied"}],refunds:[]};
  const credit=planFinancialCarry(basic);
  assert.equal(credit.ok,true);
  if(credit.ok){assert.equal(credit.creditDue,10);assert.equal(credit.paidNet,90);
    assert.equal(credit.credits[0].invoiceId,"invoice-amended");}
  assert.equal(planFinancialCarry({...basic,newTotal:10}).ok,false);
  const refund=planFinancialCarry({...basic,newTotal:80,credits:[],
    refunds:[{id:"refund-1",paymentId:"payment-1",amount:30,status:"Settled"}]});
  assert.equal(refund.ok,true);
  if(refund.ok){assert.equal(refund.paidNet,70);assert.equal(refund.creditDue,0);
    assert.equal(refund.allocations[0].amount,100);}
});


test("posted invoice amendment generates only its delta and an unapplied-credit liability",()=>{
  const accountingModule=accountingImported as typeof accountingImported & {default?:typeof accountingImported};
  const {planCorrectionJournal}=accountingModule.default??accountingModule;
  const input={invoices:[{id:"invoice-original",total:240}],oldInvoiceId:"invoice-original",
    newInvoiceId:"invoice-original-r1",originalTotal:240,revisedTotal:192,
    customerCreditDue:48,requestId:"request-1",actorUid:"admin-two",
    at:"2026-10-28T17:00:00.000Z",date:"2026-10-28",
    accounts:[{id:"acct-ar",type:"Asset",systemRole:"Accounts receivable"},
      {id:"acct-sales",type:"Revenue"},
      {id:"acct-customer-credits",type:"Liability"}],
    journals:[{id:"original-journal",status:"Posted",sourceType:"Invoice issued",sourceId:"invoice-original",
      lines:[{id:"old-debit",accountId:"acct-ar",debit:240,credit:0},
        {id:"old-credit",accountId:"acct-sales",debit:0,credit:240}]}],
  };
  const journal=planCorrectionJournal(input);
  assert.equal(journal.ok,true);
  if(!journal.ok)return;
  assert.equal(journal.alreadyPosted,true);
  assert.equal(journal.newJournals.length,2);
  const delta=journal.newJournals[0].lines as Array<{accountId:string;debit:number;credit:number}>;
  assert.equal(delta[0].accountId,"acct-sales");
  assert.equal(delta[0].debit,48);
  assert.equal(delta[1].accountId,"acct-ar");
  const liability=journal.newJournals[1].lines as Array<{accountId:string;debit:number;credit:number}>;
  assert.equal(liability[0].accountId,"acct-ar");
  assert.equal(liability[1].accountId,"acct-customer-credits");
  assert.equal(liability[1].credit,48);
  const noJournal=planCorrectionJournal({...input,journals:[]});
  assert.equal(noJournal.ok,true);
  if(noJournal.ok)assert.equal(noJournal.alreadyPosted,false);
  const unsafe=planCorrectionJournal({...input,journals:[{...input.journals[0],lines:[{id:"one",accountId:"acct-ar",debit:240,credit:0}]}]});
  assert.equal(unsafe.ok,false);
});
