import assert from "node:assert/strict";
import test from "node:test";
import { createDemoData } from "../lib/demo-data";
import {
  contactMatchesLocation,
  normalizeOpportunityTransition,
  opportunityOwnerForLocation,
  type CrmState,
  type Opportunity,
  type OpportunityUpdate,
} from "../lib/crm-engine";
import type { WorkspaceData } from "../lib/types";

const dataWithCustomers = (): WorkspaceData => {
  const seed = createDemoData();
  return {
    ...seed,
    accounts: seed.accounts.map((account, index) => ({ ...account, customerId: index === 0 ? "cust-one" : `cust-${index + 1}` })),
  };
};

const baseOpportunity = (): Opportunity => ({
  id: "opp-1",
  customerId: "cust-one",
  locationId: "acc-101",
  name: "Opening placement",
  stage: "Qualified",
  ownerId: "usr-jordan",
  estimatedCases: 20,
  expectedCloseDate: "2026-09-30",
  nextAction: "Confirm opening order",
  nextActionDate: "2026-09-12",
  status: "Open",
  createdAt: "2026-09-01T12:00:00Z",
  createdBy: "usr-jordan",
  updatedAt: "2026-09-01T12:00:00Z",
});

test("interaction contact linkage accepts the same location or parent customer and rejects unrelated contacts", () => {
  const data = dataWithCustomers();
  const state: CrmState = {
    version: 1,
    contacts: [
      { id: "contact-location", scope: "Location", customerId: "cust-one", locationId: "acc-101", name: "Location buyer", role: "Owner", decisionRole: "Decision maker", primary: true, active: true, createdAt: "2026-09-01T00:00:00Z", createdBy: "system" },
      { id: "contact-parent", scope: "Customer", customerId: "cust-one", name: "Parent buyer", role: "Buyer", decisionRole: "Decision maker", primary: false, active: true, createdAt: "2026-09-01T00:00:00Z", createdBy: "system" },
      { id: "contact-other", scope: "Location", customerId: "cust-2", locationId: "acc-102", name: "Other buyer", role: "Owner", decisionRole: "Decision maker", primary: true, active: true, createdAt: "2026-09-01T00:00:00Z", createdBy: "system" },
      { id: "contact-inactive", scope: "Location", customerId: "cust-one", locationId: "acc-101", name: "Former buyer", role: "Former owner", decisionRole: "Other", primary: false, active: false, createdAt: "2026-09-01T00:00:00Z", createdBy: "system" },
    ],
    interactions: [],
    opportunities: [],
    responsibilityHistory: [],
  };

  assert.equal(contactMatchesLocation(state, "contact-location", "acc-101", data), true);
  assert.equal(contactMatchesLocation(state, "contact-parent", "acc-101", data), true);
  assert.equal(contactMatchesLocation(state, "contact-other", "acc-101", data), false);
  assert.equal(contactMatchesLocation(state, "contact-inactive", "acc-101", data), false);
});

test("opportunity ownership comes from the canonical account owner", () => {
  const data = dataWithCustomers();
  assert.equal(opportunityOwnerForLocation(data, "acc-101"), "usr-jordan");
  const invalidOwnerData: WorkspaceData = { ...data, accounts: data.accounts.map((account) => account.id === "acc-101" ? { ...account, ownerId: "usr-elena" } : account) };
  assert.equal(opportunityOwnerForLocation(invalidOwnerData, "acc-101"), undefined);
});

test("generic opportunity updates cannot rewrite immutable identity, linkage, ownership, or creator fields", () => {
  const original = baseOpportunity();
  const hostilePatch = {
    id: "opp-hijacked",
    customerId: "cust-hijacked",
    locationId: "acc-hijacked",
    ownerId: "usr-hijacked",
    createdAt: "1999-01-01T00:00:00Z",
    createdBy: "usr-hijacked",
    name: "Revised opportunity",
  } as unknown as OpportunityUpdate;
  const result = normalizeOpportunityTransition(original, hostilePatch, "2026-09-08T20:00:00Z");
  assert.equal(result.ok, true);
  assert.ok(result.opportunity);
  assert.equal(result.opportunity.id, original.id);
  assert.equal(result.opportunity.customerId, original.customerId);
  assert.equal(result.opportunity.locationId, original.locationId);
  assert.equal(result.opportunity.ownerId, original.ownerId);
  assert.equal(result.opportunity.createdAt, original.createdAt);
  assert.equal(result.opportunity.createdBy, original.createdBy);
  assert.equal(result.opportunity.name, "Revised opportunity");
});

test("winning an opportunity normalizes stage and status and clears loss reason", () => {
  const existing = { ...baseOpportunity(), lossReason: "Old note" };
  const result = normalizeOpportunityTransition(existing, { stage: "Won" }, "2026-09-08T20:00:00Z");
  assert.equal(result.ok, true);
  assert.equal(result.opportunity?.stage, "Won");
  assert.equal(result.opportunity?.status, "Won");
  assert.equal(result.opportunity?.lossReason, undefined);
});

test("closing an opportunity lost requires an explicit reason", () => {
  const missing = normalizeOpportunityTransition(baseOpportunity(), { stage: "Lost" }, "2026-09-08T20:00:00Z");
  assert.equal(missing.ok, false);
  assert.match(missing.message ?? "", /loss reason/i);

  const documented = normalizeOpportunityTransition(baseOpportunity(), { stage: "Lost", lossReason: "Buyer declined the launch order." }, "2026-09-08T20:00:00Z");
  assert.equal(documented.ok, true);
  assert.equal(documented.opportunity?.stage, "Lost");
  assert.equal(documented.opportunity?.status, "Lost");
  assert.equal(documented.opportunity?.lossReason, "Buyer declined the launch order.");
});

test("open opportunities require actionable follow-up and nonnegative case estimates", () => {
  const missingAction = normalizeOpportunityTransition(baseOpportunity(), { nextAction: "" }, "2026-09-08T20:00:00Z");
  assert.equal(missingAction.ok, false);
  assert.match(missingAction.message ?? "", /next action/i);

  const missingDate = normalizeOpportunityTransition(baseOpportunity(), { nextActionDate: "" }, "2026-09-08T20:00:00Z");
  assert.equal(missingDate.ok, false);
  assert.match(missingDate.message ?? "", /next-action date/i);

  const negativeCases = normalizeOpportunityTransition(baseOpportunity(), { estimatedCases: -1 }, "2026-09-08T20:00:00Z");
  assert.equal(negativeCases.ok, false);
  assert.match(negativeCases.message ?? "", /cannot be negative/i);
});
