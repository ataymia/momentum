import test from "node:test";
import assert from "node:assert/strict";
import { weeklyPhysicalVisits, weeklySubmissionStatus, weeklyReporterEligible } from "../lib/weekly-compliance";
import { createPerformanceSeed } from "../lib/performance-engine";
import type { CrmState } from "../lib/crm-engine";
import { canAccessPage } from "../lib/access";
import type { WorkspaceUser } from "../lib/types";
import { validExternalVerification } from "../lib/hr-document-controls";
import { canManageMarketingLibrary } from "../lib/marketing-library";

test("Marketing can use its assets, own profile and training without business administration access", () => {
  const user = { role: "Marketing" } as WorkspaceUser;
  for (const page of ["marketing", "timekeeping", "people", "materials"] as const) assert.equal(canAccessPage(user, page), true);
  for (const page of ["accounts", "orders", "payroll", "finance", "newHire", "settings", "inventory"] as const) assert.equal(canAccessPage(user, page), false);
  assert.equal(canManageMarketingLibrary("Marketing"), true);
  assert.equal(canManageMarketingLibrary("Sales Manager"), false);
});

test("weekly compliance separates future, due, and overdue reports", () => {
  const state = createPerformanceSeed();
  assert.equal(weeklySubmissionStatus(state, "rep", "2026-10-05", "2026-10-11").status, "Not submitted");
  assert.equal(weeklySubmissionStatus(state, "rep", "2026-10-05", "2026-10-12").status, "Due");
  assert.equal(weeklySubmissionStatus(state, "rep", "2026-10-05", "2026-10-13").status, "Overdue");
});

test("physical visit counts respect Arizona boundaries, legacy date-only values and invalid records", () => {
  const interactions = [
    {userId:"rep",type:"Visit",physicalVisit:true,occurredAt:"2026-10-05"},
    {userId:"rep",type:"Visit",physicalVisit:true,occurredAt:"2026-10-12T06:59:00Z"},
    {userId:"rep",type:"Visit",physicalVisit:true,occurredAt:"2026-10-12T07:00:00Z"},
    {userId:"rep",type:"Visit",physicalVisit:true,occurredAt:"invalid"},
    {userId:"other",type:"Visit",physicalVisit:true,occurredAt:"2026-10-06"},
    {userId:"rep",type:"Call",physicalVisit:false,occurredAt:"2026-10-06"},
  ];
  assert.equal(weeklyPhysicalVisits({interactions} as CrmState,"rep","2026-10-05","2026-10-11"),2);
});

test("HR evidence must identify a signed original, reviewer, time, and matching document version", () => {
  const evidence = {method:"External signed original" as const,recordReference:"HR-2026-42",verifiedAt:"2026-10-14T19:00:00Z",verifiedBy:"admin",documentVersion:2};
  assert.equal(validExternalVerification(evidence,2),true);
  assert.equal(validExternalVerification(evidence,3),false);
  assert.equal(validExternalVerification({...evidence,recordReference:""},2),false);
  assert.equal(validExternalVerification({...evidence,verifiedBy:""},2),false);
  assert.equal(validExternalVerification(undefined,2),false);
});

test("weekly compliance does not flag roles without reporting access or prehires", () => {
 assert.equal(weeklyReporterEligible({role:"Marketing"} as WorkspaceUser),false);
 assert.equal(weeklyReporterEligible({role:"Customer"} as WorkspaceUser),false);
 assert.equal(weeklyReporterEligible({role:"Sales Representative"} as WorkspaceUser,"Prehire"),false);
 assert.equal(weeklyReporterEligible({role:"Sales Representative",employmentStatus:"Active"} as WorkspaceUser),true);
});
