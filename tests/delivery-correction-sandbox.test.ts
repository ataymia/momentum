import assert from "node:assert/strict";
import test from "node:test";
import {correctionDiff,correctionApprovalGate} from "../functions/src/delivery-correction-policy";
import {isolatedSkuUse,sandboxCanPostProductionSideEffects,validateCustomSku} from "../lib/custom-sku-policy";

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
