import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAzTptLicenseNumber, validArizonaTaxCertificateType, validTaxCertificateReference } from "../lib/arizona-tax-documents";
import { normalizeCommercialState } from "../lib/commercial-state";
import type { WorkspaceData } from "../lib/types";

test("Arizona TPT is eight digits; leading zeros preserved; certificate forms are not TPT numbers",()=>{
  assert.equal(normalizeAzTptLicenseNumber("00123456"),"00123456");
  assert.equal(normalizeAzTptLicenseNumber(" 00123456 "),"00123456");
  assert.equal(normalizeAzTptLicenseNumber(""),"");
  assert.equal(normalizeAzTptLicenseNumber("1234567"),null);
  assert.equal(normalizeAzTptLicenseNumber("123456789"),null);
  assert.equal(normalizeAzTptLicenseNumber("AZ-5000"),null);
  assert.equal(normalizeAzTptLicenseNumber("1234A678"),null);
  assert.equal(validArizonaTaxCertificateType("5000A"),true);
  assert.equal(validArizonaTaxCertificateType("5000"),true);
  assert.equal(validArizonaTaxCertificateType(""),true);
  assert.equal(validArizonaTaxCertificateType("5000B"),false);
  assert.equal(validTaxCertificateReference(""),true);
  assert.equal(validTaxCertificateReference("restricted/customer-1/5000A-2026"),true);
  assert.equal(validTaxCertificateReference("x".repeat(201)),false);
});

test("customer TPT and Form 5000A metadata survive persisted commercial-state normalization",()=>{
  const data={
    users:[],
    customers:[{id:"customer-a",name:"Retailer",accountType:"Independent",createdAt:"2026-10-21T16:00:00.000Z",az5000Number:"LEGACY-UNKNOWN"}],
    accounts:[],orders:[],appointments:[],activities:[],placements:[],inventory:[],approvals:[],timeEntries:[],timecards:[],notifications:[],bulletins:[]
  } as WorkspaceData;
  const saved=normalizeCommercialState({version:1,customerPatches:{"customer-a":{
    tptLicenseNumber:"00123456",taxCertificateType:"5000A",
    taxCertificateReference:"restricted/customer-a/resale-2026",
    taxExemptionStatus:"Received"
  }}},data,"2026-10-21");
  assert.equal(saved.customerPatches["customer-a"].tptLicenseNumber,"00123456");
  assert.equal(saved.customerPatches["customer-a"].taxCertificateType,"5000A");
  assert.equal(saved.customerPatches["customer-a"].taxCertificateReference,"restricted/customer-a/resale-2026");
  assert.equal(saved.customerPatches["customer-a"].taxExemptionStatus,"Received");
  assert.equal(saved.customerPatches["customer-a"].az5000Number,undefined);
  const cleared=normalizeCommercialState({version:1,customerPatches:{"customer-a":{
    tptLicenseNumber:"",taxCertificateType:"",taxCertificateReference:""
  }}},data,"2026-10-21");
  assert.equal(cleared.customerPatches["customer-a"].tptLicenseNumber,"");
  assert.equal(cleared.customerPatches["customer-a"].taxCertificateType,"");
  assert.equal(cleared.customerPatches["customer-a"].taxCertificateReference,"");
});
