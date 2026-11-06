import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Account, WorkspaceUser } from "../lib/types";
import type { CrmContact, Opportunity } from "../lib/crm-engine";
import { contactCsvRows, dealCsvRows, visibleContacts, visibleDeals } from "../lib/crm-review-records";
import { canVisitRoute, pageForPath } from "../lib/navigation-route-registry";

const person = (role: WorkspaceUser["role"]): WorkspaceUser => ({
  id: "viewer", role, team: "Sales", email: "viewer@example.invalid", name: "Reviewer",
  firstName: "Reviewer", initials: "RR", title: "Reviewer", accent: "#000",
});
const account = (id: string, customerId: string): Account => ({
  id, customerId, name: id, location: "Phoenix", channel: "Retail", stage: "Prospect",
  ownerId: "rep-1", contactName: "Sample", contactRole: "Buyer", phone: "", email: "",
  lastActivity: "", nextAction: "", nextActionDate: "", health: "New", lifetimeCases: 0,
  reorderCount: 0, notes: "",
});
const deal = (id: string, locationId: string): Opportunity => ({
  id, customerId: locationId === "allowed" ? "parent-1" : "parent-2", locationId,
  name: "Opportunity " + id, stage: "Qualified", ownerId: "rep-1", status: "Open",
  nextAction: "Call", nextActionDate: "2026-11-09", createdAt: "2026-11-05T00:00:00Z",
  createdBy: "rep-1", updatedAt: "2026-11-05T00:00:00Z",
});
const contact = (id: string, locationId?: string): CrmContact => ({
  id, customerId: locationId === "foreign" ? "parent-2" : "parent-1",
  locationId, scope: locationId ? "Location" : "Customer", name: "Contact " + id,
  role: "Buyer", decisionRole: "Decision maker", primary: false, active: true,
  createdAt: "2026-11-05T00:00:00Z", createdBy: "rep-1",
});

test("deal and contact lists enforce visible location and parent scopes even when given wider CRM arrays", () => {
  const accounts = [account("allowed","parent-1")];
  const deals = [deal("inside","allowed"),deal("outside","foreign")];
  const contacts = [contact("inside","allowed"),contact("outside","foreign"),contact("parent"),contact("other-parent")];
  contacts[3].customerId = "parent-2";
  assert.deepEqual(visibleDeals(deals,accounts,person("Sales Representative")).map(record => record.id),["inside"]);
  assert.deepEqual(visibleContacts(contacts,accounts,person("Sales Representative")).map(record => record.id),["inside","parent"]);
  for (const role of ["Customer","Marketing","Warehouse","Driver"] as const) {
    assert.deepEqual(visibleDeals(deals,accounts,person(role)),[]);
    assert.deepEqual(visibleContacts(contacts,accounts,person(role)),[]);
  }
});

test("CRM CSV exports include only allowlisted fields for scoped records", () => {
  const accounts = [account("allowed","parent-1")];
  const users = [{id:"rep-1",name:"Sales User"}];
  const rows = dealCsvRows([deal("inside","allowed"),deal("outside","foreign")],accounts,users);
  assert.equal(rows.length,1);
  assert.equal(rows[0]["Assigned rep"],"Sales User");
  assert.equal("createdBy" in rows[0],false);
  const contactRows = contactCsvRows([contact("inside","allowed"),contact("outside","foreign")],accounts);
  assert.equal(contactRows.length,1);
  assert.equal("createdBy" in contactRows[0],false);
});

test("CRM deal and contact detail URLs retain the authorized accounts permission", () => {
  assert.equal(pageForPath("/crm/deals/opaque-deal"),"accounts");
  assert.equal(pageForPath("/crm/deals/opaque-deal/edit"),"accounts");
  assert.equal(pageForPath("/crm/contacts/opaque-contact"),"accounts");
  assert.equal(canVisitRoute(person("Sales Representative"),"/crm/deals/opaque-deal"),true);
  assert.equal(canVisitRoute(person("Customer"),"/crm/deals/opaque-deal"),false);
  assert.equal(canVisitRoute(person("Marketing"),"/crm/contacts/opaque-contact"),false);
});

test("deal and contact pages use the existing CRM engine and explicitly guarded local-demo changes", () => {
  const component = readFileSync("components/prototype/crm-pipeline-experience.tsx","utf8");
  const hub = readFileSync("components/prototype/operations-hub.tsx","utf8");
  assert.match(component,/useCrm/);
  assert.match(component,/momentumStorage\.mode\(\) === "local"/);
  assert.match(component,/updateOpportunity/);
  assert.match(component,/addOpportunity/);
  assert.match(component,/addContact/);
  assert.match(component,/downloadCsv/);
  assert.match(hub,/CrmDealsExperience/);
  assert.match(hub,/CrmContactsExperience/);
});
