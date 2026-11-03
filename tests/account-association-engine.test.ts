import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {applyAccountAssociation,type AccountAssociationRequest} from "../lib/account-association-engine";
import type {Account,WorkspaceData} from "../lib/types";

const loc=(id:string,name:string,address:string,parent?:string):Account=>({
  id,name,location:"Phoenix, AZ",streetAddress:address,postalCode:"85018",
  channel:"Gym",stage:"Prospect",ownerId:"rep-1",contactName:"",
  contactRole:"",phone:"",email:"",lastActivity:"",
  nextAction:"",nextActionDate:"2026-11-05",health:"New",lifetimeCases:0,
  reorderCount:0,notes:"",customerId:parent,
});
const fixtures=():WorkspaceData=>{
  const accounts=[
    loc("a","Two Knuckle Sports and Fitness","101 West Example"),
    loc("b","Two Knuckles Sports MMA and Fitness","200 West Example"),
    loc("c","Third Party Market","300 West Example"),
  ];
  return {
    users:[],accounts,customers:[],activities:[],appointments:[],orders:[{
      id:"ord-a",number:"ORDER-A",accountId:"a",cases:12,pricePerCase:24,amount:288,
      ownerId:"rep-1",creditedRepId:"rep-1",status:"Delivered",
      paymentStatus:"Paid",placedAt:"2026-09-10",
    }],placements:[],inventory:[],approvals:[],timeEntries:[],timecards:[],
    notifications:[],bulletins:[],
  } as WorkspaceData;
};
const request=():AccountAssociationRequest=>({
  accountIds:["a","b"],parent:{kind:"new",id:"cust-unique-demo",name:"Verified Two Knuckles Billing Group"},
  operatorId:"admin-1",recordedAt:"2026-11-03T20:00:00Z",operationId:"test-123",
  reason:"Verified by business registration record",verifiedCommonBillingOwner:true,
});
test("explicitly selected different names associate without changing original historical orders or rep credit",()=>{
  const data=fixtures();
  const outcome=applyAccountAssociation(data,request());
  assert.equal(outcome.ok,true);
  if(!outcome.ok)return;
  assert.equal(outcome.parentId,"cust-unique-demo");
  assert.equal(outcome.data.customers?.length,1);
  assert.equal(outcome.data.accounts.find(a=>a.id==="a")?.customerId,outcome.parentId);
  assert.equal(outcome.data.accounts.find(a=>a.id==="b")?.customerId,outcome.parentId);
  assert.equal(outcome.data.accounts.find(a=>a.id==="c")?.customerId,undefined);
  assert.deepEqual(outcome.updatedAccountIds,["a","b"]);
  assert.strictEqual(outcome.data.orders,data.orders);
  assert.strictEqual(outcome.data.approvals,data.approvals);
  assert.strictEqual(outcome.data.accounts[2],data.accounts[2]);
  assert.equal(data.accounts[0].customerId,undefined);
  assert.equal(data.customers?.length,0);
  assert.equal(outcome.data.orders[0].creditedRepId,"rep-1");
  assert.equal(outcome.data.activities.length,2);
  assert(outcome.data.activities.every(a=>a.userId==="admin-1"&&a.detail.includes("Previous parent: unlinked")));
});
test("requires verified billing identity, reason and stable operator provenance",()=>{
  const data=fixtures();
  for(const patch of [
    {verifiedCommonBillingOwner:false},
    {reason:"short"},
    {operatorId:""},
    {recordedAt:"not-a-date"},
    {accountIds:["a","not-present"]},
    {accountIds:["a"]},
  ]){
    assert.equal(applyAccountAssociation(data,{...request(),...patch}).ok,false,JSON.stringify(patch));
  }
});
test("existing customers can be reused but two distinct parents cannot be silently merged",()=>{
  const data=fixtures();
  data.customers=[{id:"parent-one",name:"Verified Group",accountType:"Other",createdAt:"2026-09-10T12:00:00Z"}];
  data.accounts[0]={...data.accounts[0],customerId:"parent-one"};
  const okay=applyAccountAssociation(data,{...request(),parent:{kind:"existing",id:"parent-one"}});
  assert.equal(okay.ok,true);
  if(okay.ok){
    assert.equal(okay.data.customers?.length,1);
    assert.strictEqual(okay.data.customers?.[0],data.customers[0]);
  }
  assert.equal(applyAccountAssociation(data,request()).ok,false);
  data.customers.push({id:"parent-two",name:"Other",accountType:"Other",createdAt:"2026-10-10T12:00:00Z"});
  data.accounts[1]={...data.accounts[1],customerId:"parent-two"};
  assert.equal(applyAccountAssociation(data,{...request(),parent:{kind:"existing",id:"parent-one"}}).ok,false);
});
test("identical physical locations block parent association until duplicate-store identity is resolved",()=>{
  const data=fixtures();
  data.accounts[1]={...data.accounts[1],streetAddress:data.accounts[0].streetAddress};
  assert.equal(applyAccountAssociation(data,request()).ok,false);
});
test("demo association requires administrator and absence of connected backend",()=>{
  const base=readFileSync("lib/workspace-context-v5.tsx","utf8");
  const ui=readFileSync("components/prototype/account-consolidation-review.tsx","utf8");
  assert.match(base,/currentUser\?\.role!=="Administrator"\|\|production\|\|currentRuntimeMode\(\)!=="demo"\|\|momentumStorage\.mode\(\)!=="local"/);
  assert.match(ui,/demoAssociationEnabled=runtime\.isDemo&&momentumStorage\.mode\(\)==="local"&&!firebase/);
  assert.match(ui,/typedConfirmation!=="ASSOCIATE"/);
  assert.match(ui,/verifiedOwner/);
});
