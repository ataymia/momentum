import assert from "node:assert/strict";
import test from "node:test";
import {ACCOUNT_PROFILE_EDITABLE_FIELDS,validateAccountProfileEdit,type VerifiedAccountEditor} from "../lib/account-profile-edit-policy";
import type {Account} from "../lib/types";
import {readFileSync} from "node:fs";

const original={
  id:"acc-1",name:"ABC Market",location:"Phoenix, AZ",channel:"Independent retail",
  ownerId:"rep-current",originatorId:"rep-original",createdByUid:"rep-original",
  createdAt:"2026-09-30T16:12:00.000Z",accountManagerId:"manager-1",
  lifetimeCases:72,reorderCount:3,contactName:"Buyer",contactRole:"Owner",phone:"6025550100",
  email:"buyer@example.com",notes:"",lastActivity:"Visit",stage:"Placed",
  health:"Active",nextAction:"Follow up",nextActionDate:"2026-10-15",
  responsibilityStartedAt:"2026-10-09T08:00:00.000Z",
} as Account;
const actor=(uid:string,role:VerifiedAccountEditor["role"],accountState:"Active"|"Suspended"="Active"):VerifiedAccountEditor=>({uid,role,accountState});

test("original creator can edit profile even after ownership transfer",()=>{
 const r=validateAccountProfileEdit(actor("rep-original","Sales Representative"),original,{contactName:"New buyer",notes:"Follow up"});
 assert.equal(r.ok,true);
 if(!r.ok)return;
 assert.equal(r.updated.contactName,"New buyer");
 assert.equal(r.updated.ownerId,"rep-current");
 assert.equal(r.updated.originatorId,"rep-original");
 assert.equal(r.updated.createdAt,original.createdAt);
 assert.equal(r.updated.createdByUid,"rep-original");
});

test("full active Administrator can edit verified legacy accounts",()=>{
 const r=validateAccountProfileEdit(actor("admin","Administrator"),{...original,createdByUid:undefined},{name:"Renamed Market"});
 assert.equal(r.ok,true);
 if(r.ok)assert.equal(r.updated.name,"Renamed Market");
});

test("unrelated rep, owner and unrelated manager cannot edit",()=>{
 for(const editor of [
  actor("rep-other","Sales Representative"),
  actor("rep-current","Sales Representative"),
  actor("manager-1","Sales Manager"),
  actor("operations","Operations"),
 ]){
  assert.equal(validateAccountProfileEdit(editor,original,{phone:"6025550200"}).ok,false);
 }
});

test("a Sales Manager who really created the account retains creator authority",()=>{
 const r=validateAccountProfileEdit(actor("manager-1","Sales Manager"),{...original,createdByUid:"manager-1"},{email:"buyer2@example.com"});
 assert.equal(r.ok,true);
});

test("legacy account without creator proof is Administrator-only",()=>{
 const old={...original,createdByUid:undefined};
 assert.equal(validateAccountProfileEdit(actor("rep-original","Sales Representative"),old,{name:"Incorrect assumption"}).ok,false);
 assert.equal(validateAccountProfileEdit(actor("admin","Administrator"),old,{name:"Corrected"}).ok,true);
});

test("inactive and suspended identities are blocked even if original creator or admin",()=>{
 assert.equal(validateAccountProfileEdit(actor("rep-original","Sales Representative","Suspended"),original,{notes:"change"}).ok,false);
 assert.equal(validateAccountProfileEdit(actor("admin","Administrator","Suspended"),original,{notes:"change"}).ok,false);
});

test("attempts to overwrite immutable ownership, originator, ID, creation metadata, prices or unknowns are denied",()=>{
 for(const patch of [
  {createdByUid:"rep-other"}, {createdAt:"2026-10-12T00:00:00Z"},
  {id:"acc-other"}, {ownerId:"rep-other"}, {originatorId:"rep-other"},
  {accountManagerId:"rep-other"}, {lifetimeCases:0}, {reorderCount:0},
  {pricingTier:"Premium"}, {programPricePerCase:1}, {madeUpProperty:"yes"},
 ]){
  assert.equal(validateAccountProfileEdit(actor("admin","Administrator"),original,patch).ok,false);
 }
});

test("unexpected nested payloads, invalid field types and missing names fail closed",()=>{
 for(const patch of [{},null,[],{notes:{nested:"bad"}},{name:"   "},{deliveryAddressSameAsBusiness:"yes"},{notes:"x".repeat(2001)}]){
  assert.equal(validateAccountProfileEdit(actor("admin","Administrator"),original,patch).ok,false);
 }
 assert.ok(ACCOUNT_PROFILE_EDITABLE_FIELDS.includes("deliveryStreetAddress"));
});

test("policy is not mistaken for an exposed client account editor or unsecured endpoint",()=>{
 const ui=readFileSync("components/pages/accounts.tsx","utf8");
 const functions=readFileSync("functions/src/index.ts","utf8");
 assert.doesNotMatch(ui,/updateAccountProfile\(/);
 assert.doesNotMatch(functions,/export const editAccountProfile\s*=/);
});
