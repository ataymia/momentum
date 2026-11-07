import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {validateLeadCreateDraft, type LeadCreateDraft} from "../lib/crm-lead-create";
import type {Account} from "../lib/types";

const draft:LeadCreateDraft={
  legalBusinessName:"  Golden Corner Market  ",locationName:" Phoenix Store 1 ",
  city:"Phoenix, AZ",streetAddress:"123 West Madison Street",postalCode:"85001",
  channel:"Independent retail",contactName:"Alex Buyer",contactRole:"Owner",
  phone:"602-555-0100",email:" buyer@example.test ",territoryReason:"",
};
const existing=[{
  id:"account-old",name:"Golden Corner Market",location:"Phoenix, AZ",channel:"Independent retail",
  streetAddress:"123 West Madison Street",phone:"602-555-0100",email:"buyer@example.test",
}] as Account[];

test("new prospect validates into the canonical Account/Customer creation payload",()=>{
  const result=validateLeadCreateDraft({...draft,legalBusinessName:"Another Store",streetAddress:"456 Main Rd",phone:"",postalCode:"85001-1234"},existing);
  assert.equal(result.ok,true);
  if(!result.ok)return;
  assert.equal(result.payload.name,"Another Store");
  assert.equal(result.payload.legalBusinessName,result.payload.customerName);
  assert.equal(result.payload.postalCode,"85001");
  assert.equal(result.payload.taxDocumentType,"Undetermined");
  assert.equal(result.payload.deliveryAddressSameAsBusiness,true);
  assert.equal(result.payload.contactName,"Alex Buyer");
  assert.equal(result.payload.email,"buyer@example.test");
});

test("duplicate location identity rejects creating a parallel lead",()=>{
  const result=validateLeadCreateDraft(draft,existing);
  assert.equal(result.ok,false);
  if(result.ok)return;
  assert.equal(result.duplicateAccountId,"account-old");
});

test("invalid ZIP, missing buyer and no reachable contact fail without writing",()=>{
  for(const change of [
    {postalCode:"999"}, {contactName:" "}, {phone:" ",email:" "},
    {email:"not-an-email"}, {streetAddress:" "},
  ]){
    const result=validateLeadCreateDraft({...draft,...change,streetAddress:change.streetAddress??"100 Different Road"},[]);
    assert.equal(result.ok,false,JSON.stringify(change));
  }
});

test("lead creation uses canonical createAccount only in local demo and navigates to its record",()=>{
  const source=readFileSync(new URL("../components/prototype/crm-lead-create.tsx",import.meta.url),"utf8");
  assert.match(source,/runtime\.isDemo&&momentumStorage\.mode\(\)==="local"/);
  assert.match(source,/createAccount\(validation\.payload,validation\.territoryReason\)/);
  assert.match(source,/navigateToRoute\("\/crm\/leads\/"/);
  assert.doesNotMatch(source,/setFirestoreDocument|create.*Payment|createOrder\(/);
});

test("lead record assignment uses searchable real-user picker, not arbitrary text IDs",()=>{
  const source=readFileSync(new URL("../components/prototype/operations-hub.tsx",import.meta.url),"utf8");
  assert.match(source,/CrmLeadCreator/);
  assert.match(source,/SalesUserPicker label="New lead representative"/);
  assert.match(source,/eligibleReps\.some\(u=>u\.id===newOwner\)/);
});
