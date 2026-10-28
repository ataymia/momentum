import assert from "node:assert/strict";
import test from "node:test";
import {correctionDiff,correctionApprovalGate} from "../functions/src/delivery-correction-policy";
import {isolatedSkuUse,sandboxCanPostProductionSideEffects,validateCustomSku} from "../lib/custom-sku-policy";
import {planDeliveredInventoryCorrection} from "../functions/src/delivery-inventory-revision";

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
      toNodeId:"node-account-acc-1",quantity:10,type:"Delivery"}],
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
