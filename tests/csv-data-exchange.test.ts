import assert from "node:assert/strict";
import test from "node:test";
import { parseAccountImport, parseAppointmentImport, parseCsv, parseInventoryImport, parseOrderImport, parseShiftImport, rowsToCsv } from "../lib/csv-data-exchange";

test("CSV parser round-trips commas, quotes, and line breaks", () => {
  const csv=rowsToCsv([{name:'Store, One',note:'Said "yes"',detail:"Line 1\nLine 2"}]);
  const parsed=parseCsv(csv);
  assert.deepEqual(parsed.errors,[]);
  assert.equal(parsed.rows[0].name,"Store, One");
  assert.equal(parsed.rows[0].note,'Said "yes"');
  assert.equal(parsed.rows[0].detail,"Line 1\nLine 2");
});

test("account import requires complete contact and location fields", () => {
  const valid=parseAccountImport([{name:"Shop",location:"Phoenix",channel:"Retail",contactName:"Buyer",contactRole:"Owner",phone:"6025550100",email:"buyer@example.test",customerName:"",locationName:"",streetAddress:""}]);
  assert.equal(valid.records.length,1);assert.deepEqual(valid.errors,[]);
  const invalid=parseAccountImport([{name:"Shop",location:"",channel:"Retail",contactName:"",contactRole:"Owner",phone:"",email:"",customerName:"",locationName:"",streetAddress:""}]);
  assert.equal(invalid.records.length,0);assert.ok(invalid.errors[0].includes("missing"));
});

test("new inventory lot import cannot fabricate reservations outside the order reservation ledger", () => {
  const valid=parseInventoryImport([{id:"",lotCode:"LOT-1",product:"Golden Eagle",receivedAt:"2026-09-01",bestBy:"2027-09-01",onHand:"100",reserved:"0",status:"Available",location:"Phoenix",holdReason:""}]);
  assert.equal(valid.records[0].available,100);assert.equal(valid.records[0].reserved,0);assert.deepEqual(valid.errors,[]);
  const fabricatedReservation=parseInventoryImport([{id:"",lotCode:"LOT-2",product:"Golden Eagle",receivedAt:"2026-09-01",bestBy:"2027-09-01",onHand:"100",reserved:"20",status:"Available",location:"Phoenix",holdReason:""}]);
  assert.equal(fabricatedReservation.records.length,0);assert.ok(fabricatedReservation.errors.some((error)=>error.includes("Reservations must be created from approved orders")));
  const invalidDate=parseInventoryImport([{id:"",lotCode:"LOT-3",product:"Golden Eagle",receivedAt:"9/1/26",bestBy:"2027-09-01",onHand:"10",reserved:"0",status:"Available",location:"Phoenix",holdReason:""}]);
  assert.equal(invalidDate.records.length,0);assert.ok(invalidDate.errors.length>=1);
});

test("appointment import enforces known enum formats and 24-hour time", () => {
  const valid=parseAppointmentImport([{accountId:"acc-1",ownerId:"rep-1",date:"2026-09-09",startTime:"14:30",duration:"30",type:"First visit",priority:"High",arrivalWindow:"",objective:"Pitch",tags:"new|priority"}]);
  assert.equal(valid.records.length,1);assert.deepEqual(valid.records[0].tags,["new","priority"]);
  const invalid=parseAppointmentImport([{accountId:"acc-1",ownerId:"",date:"2026-09-09",startTime:"2:30 PM",duration:"30",type:"Meeting",priority:"",arrivalWindow:"",objective:"Pitch",tags:""}]);
  assert.equal(invalid.records.length,0);assert.ok(invalid.errors.length>=2);
});

test("order import requires an explicit product and cannot carry paid state or override source pricing", () => {
  const result=parseOrderImport([{accountId:"acc-1",cases:"10",pricePerCase:"1",product:"Golden Eagle",paymentStatus:"Paid"}]);
  assert.equal(result.records.length,1);
  assert.equal(result.records[0].product,"Golden Eagle");
  assert.equal("paymentStatus" in result.records[0],false);
  assert.equal("pricePerCase" in result.records[0],false);
  const missingProduct=parseOrderImport([{accountId:"acc-1",cases:"10",product:""}]);
  assert.equal(missingProduct.records.length,0);
  assert.ok(missingProduct.errors.some((error)=>error.includes("product")));
});

test("shift import rejects impossible times and accepts existing shift status values", () => {
  const valid=parseShiftImport([{userId:"rep-1",date:"2026-09-09",startTime:"08:00",endTime:"17:00",role:"Sales Rep",location:"Field",status:"Published",note:""}]);
  assert.equal(valid.records.length,1);assert.deepEqual(valid.errors,[]);
  const invalid=parseShiftImport([{userId:"rep-1",date:"2026-09-09",startTime:"17:00",endTime:"08:00",role:"Sales Rep",location:"Field",status:"Published",note:""}]);
  assert.equal(invalid.records.length,0);assert.ok(invalid.errors.some((error)=>error.includes("later")));
});
