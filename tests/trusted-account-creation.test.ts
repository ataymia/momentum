import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import * as imported from "../functions/src/trusted-account-validation";
const moduleRef=imported as typeof imported & {default?:typeof imported};
const {validateTrustedAccountCreation,potentialDuplicateAccount}=moduleRef.default??moduleRef;

const valid={
  name:"ABC Market",location:"Phoenix, AZ",channel:"Independent retail",
  contactName:"Main Buyer",contactRole:"Owner",phone:"6025550101",
  postalCode:"85001",streetAddress:"123 Example Street",
  deliveryAddressSameAsBusiness:true,
};

test("normal account request accepts validated contact and address data",()=>{
 const check=validateTrustedAccountCreation(valid);
 assert.equal(check.ok,true);
 if(!check.ok)return;
 assert.equal(check.customerName,"ABC Market");
 assert.equal(check.record.phone,"6025550101");
 assert.equal(check.record.postalCode,"85001");
});

test("server never accepts claimed creator, owner, revenue or stage",()=>{
 for(const key of [
  "id","ownerId","originatorId","createdAt","createdByUid",
  "accountManagerId","lifetimeCases","reorderCount","stage",
  "health","pricingTier","programPricePerCase","balance",
 ]){
  const r=validateTrustedAccountCreation({...valid,[key]:"arbitrary"});
  assert.equal(r.ok,false,key);
 }
});

test("creation requires valid ZIP, contact information and complete separate delivery address",()=>{
 assert.equal(validateTrustedAccountCreation({...valid,postalCode:"nope"}).ok,false);
 assert.equal(validateTrustedAccountCreation({...valid,phone:""}).ok,false);
 assert.equal(validateTrustedAccountCreation({...valid,contactName:""}).ok,false);
 assert.equal(validateTrustedAccountCreation({...valid,deliveryAddressSameAsBusiness:false}).ok,false);
 assert.equal(validateTrustedAccountCreation({...valid,email:"broken@"}).ok,false);
});

test("known name+address or telephone duplicates are rejected, legitimate different stores allowed",()=>{
 const accounts=[
  {id:"acc-1",name:valid.name,postalCode:valid.postalCode,
    streetAddress:valid.streetAddress,phone:valid.phone},
 ];
 assert.equal(potentialDuplicateAccount(accounts,valid),true);
 assert.equal(potentialDuplicateAccount(accounts,{...valid,streetAddress:"different",phone:"6025559999"}),false);
});

test("trusted creation is atomic with provenance/idempotency and currently unexposed to clients",()=>{
 const source=readFileSync("functions/src/trusted-account-creation.ts","utf8");
 const index=readFileSync("functions/src/index.ts","utf8");
 assert.match(source,/db\.runTransaction\(/);
 assert.match(source,/tx\.create\(creatorRef/);
 assert.match(source,/tx\.create\(requestRef/);
 assert.match(source,/tx\.set\(accountRef/);
 assert.match(source,/tx\.set\(activitiesRef/);
 assert.match(source,/accountCreatorProvenance/);
 assert.match(source,/accountCreationRequests/);
 assert.doesNotMatch(index,/export const createCrmAccount\s*=/);
});
