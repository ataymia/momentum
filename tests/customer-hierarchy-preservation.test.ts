import assert from "node:assert/strict";
import test from "node:test";
import {preserveExplicitCustomerHierarchy} from "../lib/customer-hierarchy-preservation";
import {customerForLocation,customerLocations} from "../lib/crm-hierarchy";
import type {Account,WorkspaceData} from "../lib/types";

const location=(id:string,name:string,customerId?:string):Account=>({
  id,name,location:"Phoenix, AZ",channel:"Convenience",stage:"Prospect",
  ownerId:"rep-1",contactName:"",contactRole:"",phone:"",email:"",
  lastActivity:"",nextAction:"",nextActionDate:"2026-11-10",
  health:"New",lifetimeCases:0,reorderCount:0,notes:"",
  ...(customerId?{customerId}:{}),
});

test("identically named locations remain separate without approved parent linking",()=>{
  const locations=[location("store-1","Corner Market"),location("store-2","Corner Market")];
  const data={accounts:locations,customers:[],appointments:[]} as unknown as WorkspaceData;
  const next=preserveExplicitCustomerHierarchy(data);
  assert.strictEqual(next,data);
  const first=customerForLocation(next,locations[0]);
  const second=customerForLocation(next,locations[1]);
  assert.notEqual(first.id,second.id);
  assert.equal(first.createdAt,"");
  assert.equal(second.createdAt,"");
  assert.equal(customerLocations(next,first.id).length,1);
});
test("only explicitly linked customer IDs propagate to appointment records",()=>{
  const account=location("store-1","Corner Market","customer-verified");
  const data={
    customers:[{id:"customer-verified",name:"Corner Market Inc.",accountType:"Chain / franchise",createdAt:"2026-09-01T09:00:00.000Z"}],
    accounts:[account,location("store-2","Corner Market")],
    appointments:[{id:"appt-1",accountId:"store-1"},{id:"appt-2",accountId:"store-2"}],
  } as unknown as WorkspaceData;
  const next=preserveExplicitCustomerHierarchy(data);
  assert.equal(next.appointments[0].customerId,"customer-verified");
  assert.equal(next.appointments[1].customerId,undefined);
  assert.equal(next.accounts[0].responsibilityStartedAt,undefined);
  assert.equal(customerForLocation(next,account).createdAt,"2026-09-01T09:00:00.000Z");
  assert.strictEqual(preserveExplicitCustomerHierarchy(next),next);
});
