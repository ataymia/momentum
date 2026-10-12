import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import * as imported from "../functions/src/account-profile-edit";
import {ACCOUNT_PROFILE_EDITABLE_FIELDS} from "../lib/account-profile-edit-policy";

const moduleRef=imported as typeof imported & {default?:typeof imported};
const {serverMayEditAccount,validateServerProfilePatch,PROFILE_FIELDS}=
  moduleRef.default??moduleRef;
const record={
  id:"acc-1",createdByUid:"rep-created",ownerId:"rep-owner",
  originatorId:"rep-created",createdAt:"2026-10-01T00:00:00.000Z",
  name:"First Market",contactName:"First Buyer",
};
const provenance={accountId:"acc-1",creatorUid:"rep-created"};

test("server policy fields match CRM UI allowlist",()=>{
  assert.deepEqual([...PROFILE_FIELDS],[...ACCOUNT_PROFILE_EDITABLE_FIELDS]);
});

test("original creator and active Administrator are eligible",()=>{
  assert.equal(serverMayEditAccount("rep-created","Sales Representative","Active","acc-1",provenance,record),true);
  assert.equal(serverMayEditAccount("admin","Administrator","Active","acc-1",null,record),true);
});

test("manager and current owner are not automatically account editors",()=>{
  assert.equal(serverMayEditAccount("rep-owner","Sales Representative","Active","acc-1",provenance,record),false);
  assert.equal(serverMayEditAccount("manager","Sales Manager","Active","acc-1",provenance,record),false);
  assert.equal(serverMayEditAccount("ops","Operations","Active","acc-1",provenance,record),false);
});

test("forged creator attribution in shared array never grants permission",()=>{
  const spoof={...record,createdByUid:"rep-other"};
  assert.equal(serverMayEditAccount("rep-other","Sales Representative","Active","acc-1",provenance,spoof),false);
  assert.equal(serverMayEditAccount("rep-created","Sales Representative","Active","acc-1",provenance,spoof),false);
});

test("missing or inconsistent provenance cannot authorize creators",()=>{
  for(const proof of [undefined,null,{}, {accountId:"other",creatorUid:"rep-created"},{accountId:"acc-1",creatorUid:"somebody-else"}]){
    assert.equal(serverMayEditAccount("rep-created","Sales Representative","Active","acc-1",proof,record),false);
  }
});

test("inactive and unrelated roles, even Administrator, cannot edit",()=>{
  assert.equal(serverMayEditAccount("admin","Administrator","Suspended","acc-1",null,record),false);
  assert.equal(serverMayEditAccount("rep-created","Sales Representative","Disabled","acc-1",provenance,record),false);
  assert.equal(serverMayEditAccount("rep-created","Customer","Active","acc-1",provenance,record),true);
});

test("ordinary contact fields allowed; provenance/credit/ownership tampering denied",()=>{
  const allowed=validateServerProfilePatch({contactName:"New Contact",phone:"6025550101",deliveryAddressSameAsBusiness:false});
  assert.equal(allowed.ok,true);
  if(allowed.ok)assert.equal(allowed.patch.contactName,"New Contact");
  for(const forbidden of ["createdByUid","createdAt","ownerId","originatorId","reorderCount","pricingTier","id","creditStatus","madeUpField"]){
    assert.equal(validateServerProfilePatch({[forbidden]:"hacked"}).ok,false,forbidden);
  }
  assert.equal(validateServerProfilePatch({name:""}).ok,false);
  assert.equal(validateServerProfilePatch({notes:99}).ok,false);
  assert.equal(validateServerProfilePatch(null).ok,false);
});

test("backend writer stays unexported from HTTPS Functions while legacy direct write remains open",()=>{
  const index=readFileSync("functions/src/index.ts","utf8");
  const source=readFileSync("functions/src/account-profile-edit.ts","utf8");
  assert.doesNotMatch(index,/export const (?:editAccountProfile|updateAccountProfile)\s*=/);
  assert.match(source,/db\.runTransaction\(/);
  assert.match(source,/tx\.create\(eventsRef,event\)/);
  assert.match(source,/tx\.get\(creatorRef\)/);
});
