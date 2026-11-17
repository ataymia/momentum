import assert from "node:assert/strict";
import test from "node:test";
import {breadcrumbsForRoute} from "../lib/navigation-breadcrumbs";

test("breadcrumbs show real group, parent and leaf for personal account",()=>{
 assert.deepEqual(breadcrumbsForRoute("/my-account"),[{label:"Account"},{label:"My Account",path:"/my-account"}]);
 assert.deepEqual(breadcrumbsForRoute("/my-account/time-off"),[{label:"Account"},{label:"My Account",path:"/my-account"},{label:"My Time Off",path:"/my-account/time-off"}]);
});
test("CRM customer transactions retain linked account hierarchy",()=>{
 assert.deepEqual(breadcrumbsForRoute("/sales/customers/store-1/transactions"),[
  {label:"Sales & CRM"},{label:"Accounts / Customers",path:"/sales/customers"},
  {label:"Customer details",path:"/sales/customers/store-1"},{label:"Transactions"},
 ]);
});
test("nested record screens keep department and leaf",()=>{
 const meeting=breadcrumbsForRoute("/calendar/meetings/meeting-1");
 assert.equal(meeting[0].label,"Workspace");
 assert.equal(meeting[1].label,"Meetings");
 assert.equal(meeting.at(-1)?.label,"Meeting details");
 const invoice=breadcrumbsForRoute("/sales/invoices/invoice-1");
 assert.equal(invoice[0].label,"Commerce");
 assert.equal(invoice[1].label,"Invoices");
 assert.equal(invoice.at(-1)?.label,"Invoice details");
});
test("customer portal is independent of employee Account and CRM",()=>{
 assert.deepEqual(breadcrumbsForRoute("/portal/account",true),[{label:"Customer Portal"},{label:"My Account",path:"/portal/account"}]);
});
