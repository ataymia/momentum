import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { businessAddressLabel, deliveryAddressForAccount, deliveryAddressLabel } from "../lib/account-address";
import type { Account } from "../lib/types";

const baseAccount: Account = {
  id:"acct-address",
  name:"Example Market",
  location:"Phoenix, AZ",
  channel:"Independent retail",
  stage:"Prospect",
  ownerId:"usr-admin",
  contactName:"Buyer",
  contactRole:"Owner",
  phone:"6025550100",
  email:"buyer@example.com",
  lastActivity:"Created",
  nextAction:"Follow up",
  nextActionDate:"2026-10-08",
  health:"New",
  lifetimeCases:0,
  reorderCount:0,
  notes:"",
  streetAddress:"100 Business Ave",
  postalCode:"85016",
};

test("legacy accounts default delivery routing to the business address",()=>{
  assert.equal(businessAddressLabel(baseAccount),"100 Business Ave, Phoenix, AZ, 85016");
  assert.equal(deliveryAddressLabel(baseAccount),"100 Business Ave, Phoenix, AZ, 85016");
});

test("a separate delivery destination overrides only the delivery-facing address",()=>{
  const account:Account={
    ...baseAccount,
    deliveryAddressSameAsBusiness:false,
    deliveryStreetAddress:"900 Warehouse Rd",
    deliveryLocation:"Tempe, AZ",
    deliveryPostalCode:"85281",
  };
  assert.equal(businessAddressLabel(account),"100 Business Ave, Phoenix, AZ, 85016");
  assert.deepEqual(deliveryAddressForAccount(account),{
    streetAddress:"900 Warehouse Rd",
    location:"Tempe, AZ",
    postalCode:"85281",
  });
  assert.equal(deliveryAddressLabel(account),"900 Warehouse Rd, Tempe, AZ, 85281");
});

test("account creation exposes same-as-business shortcut and separate delivery fields",()=>{
  const source=readFileSync("components/pages/accounts.tsx","utf8");
  assert.match(source,/Delivery address is the same as business address/);
  assert.match(source,/Delivery street address/);
  assert.match(source,/Delivery city \/ market/);
  assert.match(source,/Delivery ZIP code/);
  assert.match(source,/businessAddressLabel\(selected\)/);
  assert.match(source,/deliveryAddressLabel\(selected\)/);
});

test("delivery workflow and invoice ship-to consume the delivery address helper",()=>{
  const deliveries=readFileSync("components/pages/deliveries.tsx","utf8");
  const invoices=readFileSync("components/finance/invoice-print-center.tsx","utf8");
  const orders=readFileSync("components/pages/orders-v3.tsx","utf8");
  assert.match(deliveries,/deliveryAddressLabel\(account\)/);
  assert.match(deliveries,/deliveryAddressLabel\(detailAccount\)/);
  assert.match(invoices,/const billToAddress = location \? businessAddressLabel\(location\)/);
  assert.match(invoices,/const shipToAddress = location \? deliveryAddressLabel\(location\)/);
  assert.match(orders,/deliveryAddressLabel\(selectedAccount\)/);
});

test("workspace and commercial normalizers retain delivery address fields",()=>{
  const workspace=readFileSync("lib/workspace-normalization.ts","utf8");
  const commercial=readFileSync("lib/commercial-state.ts","utf8");
  assert.match(workspace,/deliveryAddressSameAsBusiness/);
  assert.match(workspace,/deliveryStreetAddress/);
  assert.match(workspace,/deliveryLocation/);
  assert.match(workspace,/deliveryPostalCode/);
  assert.match(commercial,/deliveryAddressSameAsBusiness/);
  assert.match(commercial,/deliveryPostalCode/);
});
