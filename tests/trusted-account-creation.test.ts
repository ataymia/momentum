import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import * as imported from "../functions/src/trusted-account-validation";
const moduleRef=imported as typeof imported & {default?:typeof imported};
const {validateTrustedAccountCreation,potentialDuplicateAccount}=moduleRef.default??moduleRef;

const valid={
  name:"ABC Market LLC",legalBusinessName:"ABC Market LLC",ein:"12-3456789",azTptLicenseNumber:"12345678",taxDocumentType:"Resale 5000A",location:"Phoenix, AZ",channel:"Independent retail",
  contactName:"Main Buyer",contactRole:"Owner",phone:"6025550101",
  postalCode:"85001",streetAddress:"123 Example Street",
  deliveryAddressSameAsBusiness:true,
};

test("normal account request accepts validated contact and address data",()=>{
 const check=validateTrustedAccountCreation(valid);
 assert.equal(check.ok,true);
 if(!check.ok)return;
 assert.equal(check.customerName,"ABC Market LLC");
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

test("trusted creation is atomic and exposed through verified HTTP authentication",()=>{
 const source=readFileSync("functions/src/trusted-account-creation.ts","utf8");
 const index=readFileSync("functions/src/index.ts","utf8");
 assert.match(source,/db\.runTransaction\(/);
 assert.match(source,/tx\.create\(creatorRef/);
 assert.match(source,/tx\.create\(requestRef/);
 assert.match(source,/tx\.set\(accountRef/);
 assert.match(source,/tx\.set\(activitiesRef/);
 assert.match(source,/accountCreatorProvenance/);
 assert.match(source,/accountCreationRequests/);
 assert.match(index,/export const createCrmAccount\s*=/);
 assert.match(index,/verifyIdToken\(token,true\)/);
 assert.match(source,/fingerprint/);
});

test("trusted account creation rejects trading names and missing licensed identity",()=>{
  assert.equal(validateTrustedAccountCreation({...valid,legalBusinessName:""}).ok,false);
  assert.equal(validateTrustedAccountCreation({...valid,name:"My Corner Shop"}).ok,false);
  assert.equal(validateTrustedAccountCreation({...valid,ein:"bad"}).ok,false);
  assert.equal(validateTrustedAccountCreation({...valid,azTptLicenseNumber:"abc"}).ok,false);
  const accepted=validateTrustedAccountCreation({...valid,customerName:"Something different"});
  assert.equal(accepted.ok,true);
  if(accepted.ok){
    assert.equal(accepted.customerName,valid.legalBusinessName);
    assert.equal(accepted.record.name,valid.legalBusinessName);
    assert.equal(accepted.record.legalBusinessName,undefined);
    assert.equal(accepted.legalBusinessName,valid.legalBusinessName);
  }
});

test("connected creation checks authenticated source readback",()=>{
 const helper=readFileSync("lib/firebase-crm-account-creation.ts","utf8");
 const screen=readFileSync("components/prototype/crm-account-setup.tsx","utf8");
 assert.match(helper,/firebaseFunctionUrl\("createCrmAccount"\)/);
 assert.match(helper,/getFirestoreSnapshot/);
 assert.match(helper,/readbackVerified/);
 assert.match(screen,/createConnectedCrmAccount\(firebase.session,result.payload/);
 assert.match(screen,/pendingRequest\.current/);
});

test("connected accounts, ownership, tax, paid revenue and stock cannot use legacy client writes",()=>{
 const source=readFileSync("lib/workspace-context.tsx","utf8");
 for(const action of [
  "const createAccount =", "const updateAccountCommercial =",
  "const updateCustomerCommercial=", "const transferAccountResponsibility =",
  "const reconcileOrderPayment =", "const importInventoryLots =",
 ]){
  const at=source.indexOf(action);
  assert.notEqual(at,-1,action);
  assert.match(source.slice(at,at+400),
    /!demoMode\|\|momentumStorage\.mode\(\)!=="local"/,action);
 }
});
