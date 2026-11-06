import assert from "node:assert/strict";
import test from "node:test";
import {prepareRequest,shiftBillingMonths,previewChargeDates} from "../lib/payment-request-contract";
const c={actorAuthorized:true,invoiceAccountId:"acc",unpaidBalance:240,invoiceState:"Open",today:"2026-11-06"};
const i={invoiceId:"invoice",accountId:"acc",amount:240,rail:"ACH" as const,cadence:"once" as const,firstDate:"2026-11-07"};
test("D14 one-time draft never charges and cannot exceed open invoice",()=>{const r=prepareRequest(i,c);assert(r.ok);if(r.ok)assert.equal(r.value.status,"Draft - never sent");assert.equal(prepareRequest({...i,amount:241},c).ok,false);});
test("D15 requires invoice account authorization",()=>{assert.equal(prepareRequest(i,{...c,actorAuthorized:false}).ok,false);assert.equal(prepareRequest({...i,accountId:"other"},c).ok,false);});
test("D14 monthly/quarterly future invoice schedules and leap years",()=>{const r=prepareRequest({...i,cadence:"quarterly"},c);assert(r.ok);if(r.ok)assert.equal(r.value.appliesTo,"future_invoices");assert.deepEqual(previewChargeDates("2026-11-15","quarterly",3),["2026-11-15","2027-02-15","2027-05-15"]);assert.equal(shiftBillingMonths("2027-01-31",1),"2027-02-28");assert.equal(shiftBillingMonths("2028-01-31",1),"2028-02-29");});
test("D14 fail closed for invalid amount, dates and unpaid balance",()=>{for(const amount of [NaN,Infinity,0,-1])assert.equal(prepareRequest({...i,amount},c).ok,false);assert.equal(prepareRequest({...i,firstDate:"2026-11-01"},c).ok,false);assert.equal(prepareRequest(i,{...c,unpaidBalance:0}).ok,false);});
