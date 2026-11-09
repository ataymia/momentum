import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
type VisitPolicy=typeof import("../functions/src/trusted-crm-visit-validation");
const {
  syntheticVisitLocationId,validCrmVisitRequestId,
  validateTrustedCrmVisit,
}=createRequire(import.meta.url)(
  "../functions/src/trusted-crm-visit-validation.ts") as VisitPolicy;
import {quickVisitLocationId} from "../lib/quick-visit";
import {documentWritable} from "../lib/firestore-domains";
import type {PersistenceScope} from "../lib/firebase-access";

const valid={
  businessName:"  Market ABC  ",physicallyVisited:true,
  unsuccessful:false,score:7,summary:" Spoke to the buyer ",
  nextAction:"Check shelf",nextActionDate:"2026-12-09",
  sampleProduct:"Energy can",sampleQuantity:3,
};

test("R16 server validates and sanitizes an attested visit",()=>{
  const result=validateTrustedCrmVisit(valid);
  assert.equal(result.ok,true);
  if(!result.ok)return;
  assert.equal(result.value.businessName,"Market ABC");
  assert.equal(result.value.summary,"Spoke to the buyer");
  assert.equal(result.value.sampleQuantity,3);
  assert.equal(result.value.physicallyVisited,true);
});

test("R75 client cannot smuggle actor identity, settlement or inventory into field visits",()=>{
  for(const key of ["userId","createdBy","occurredAt","createdAt",
    "id","amount","orderId","paymentStatus","sampleInventoryLinked",
    "invoiceId","caseCount","accountManagerId"]){
    assert.equal(validateTrustedCrmVisit({...valid,[key]:"forged"}).ok,false,key);
  }
});

test("R16 requires physical attestation and bounded payload",()=>{
  const invalid=[
    {...valid,physicallyVisited:false},{...valid,unsuccessful:"yes"},
    {...valid,score:0},{...valid,score:11},{...valid,score:1.2},
    {...valid,businessName:""},{...valid,summary:""},
    {...valid,summary:"x".repeat(1801)},
    {...valid,accountId:"../userDomains/foreign"},
    {...valid,nextActionDate:"2026-02-30"},
    {...valid,sampleQuantity:0},{...valid,sampleQuantity:1001},
    {...valid,sampleProduct:undefined,sampleQuantity:4},
  ];
  for(const item of invalid)assert.equal(
    validateTrustedCrmVisit(item).ok,false,JSON.stringify(item).slice(0,95));
  assert.equal(validateTrustedCrmVisit(
    {...valid,sampleProduct:undefined,sampleQuantity:undefined}).ok,true);
});

test("unlinked quick visits use the same deterministic IDs on client and server",()=>{
  for(const name of ["Phoenix Store"," Café on Main  ","BRAND    A 02"]){
    assert.equal(syntheticVisitLocationId(name),quickVisitLocationId(name));
  }
});

test("server request keys are bounded, nonempty and replayable",()=>{
  assert.equal(validCrmVisitRequestId("a".repeat(36)),true);
  assert.equal(validCrmVisitRequestId("3d44ac2e-aed4-4f64-9482-dcc42d44e52a"),true);
  assert.equal(validCrmVisitRequestId("tiny"),false);
  assert.equal(validCrmVisitRequestId("a".repeat(81)),false);
  assert.equal(validCrmVisitRequestId("../foreign"),false);
});

test("R75 Firestore denies direct browser CRM interaction edits, retaining sales reads",()=>{
  for(const role of ["Administrator","Sales Manager","Sales Representative"] as const){
    const scope:PersistenceScope={uid:"active-id",role,accountState:"Active",
      readableUserIds:new Set(["active-id"]),managedUserIds:new Set(),
      supervisedBrandAmbassadorIds:new Set()};
    assert.equal(documentWritable("domains/crm/fields/interactions",scope),false,role);
    assert.equal(documentWritable("domains/crm/fields/contacts",scope),true,role);
  }
  const rules=readFileSync("firestore.rules","utf8");
  assert.match(rules,/match \/crm\/fields\/\{field\}/);
  assert.match(rules,/field in \['interactions'\] \? \(activeEmployee\(\) && role\(\) in \[\]\)/);
  const index=readFileSync("functions/src/index.ts","utf8");
  const tx=readFileSync("functions/src/trusted-crm-field-visit.ts","utf8");
  const ui=readFileSync("components/prototype/crm-quick-visit.tsx","utf8");
  assert.match(index,/export const recordCrmFieldVisit=onRequest/);
  assert.match(index,/verifyIdToken\(token,true\)/);
  assert.match(tx,/tx\.create\(requestRef/);
  assert.match(tx,/tx\.create\(db\.doc\("crmFieldVisitProvenance\/"/);
  assert.match(tx,/tx\.set\(metaRef/);
  assert.match(ui,/recordTrustedFieldVisit\(firebase\.session,visit,requestId\)/);
  assert.match(ui,/momentumStorage\.refreshKeys\(\[CRM_STORAGE_KEY\]\)/);
});
