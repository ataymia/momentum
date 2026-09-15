import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { canReviewApproval } from "../lib/access";
import type { AuditEvent } from "../lib/audit-engine";
import { normalizeCommercialState } from "../lib/commercial-state";
import { notificationCopy } from "../lib/notification-engine";
import type { Approval, WorkspaceData, WorkspaceUser } from "../lib/types";

const ADMIN = "uid-admin";
const MANAGER = "uid-manager";
const REP = "uid-rep";
const ACCOUNT = "account-1";

const user = (id: string, role: WorkspaceUser["role"], managerId?: string): WorkspaceUser => ({
  id,
  name: id,
  firstName: id,
  email: `${id}@momentum.test`,
  initials: "MU",
  title: role,
  role,
  team: role === "Administrator" ? "Leadership" : "Sales",
  managerId,
  managedTeams: role === "Sales Manager" ? ["Sales"] : undefined,
  accent: "#53657d",
});

const data: WorkspaceData = {
  users: [user(ADMIN, "Administrator"), user(MANAGER, "Sales Manager", ADMIN), user(REP, "Sales Representative", MANAGER)],
  accounts: [{
    id: ACCOUNT,
    name: "Test Market",
    location: "Phoenix, AZ",
    channel: "Independent retail",
    stage: "Prospect",
    ownerId: REP,
    contactName: "Buyer",
    contactRole: "Owner",
    phone: "6025550100",
    email: "buyer@example.test",
    lastActivity: "Created",
    nextAction: "Follow up",
    nextActionDate: "2026-09-16",
    health: "New",
    lifetimeCases: 0,
    reorderCount: 0,
    notes: "",
    postalCode: "85016",
  }],
  activities: [], appointments: [], orders: [], placements: [], inventory: [], approvals: [], timeEntries: [], timecards: [], notifications: [], bulletins: [], territories: [],
};

const territoryApproval: Approval = {
  id: "territory-exception-1",
  type: "Territory exception",
  title: "Territory exception · Test Market",
  detail: "Rep is working outside the geographic suggestion. Reason: Existing buyer relationship.",
  requestedBy: REP,
  requesterId: REP,
  recordId: ACCOUNT,
  team: "Sales",
  submittedAt: "2026-09-15T08:00:00.000Z",
  dueAt: "2026-09-16T08:00:00.000Z",
  priority: "High",
  status: "Pending",
};

describe("territory exception workflow", () => {
  test("commercial-state normalization preserves an account-linked exception", () => {
    const state = normalizeCommercialState({
      version: 1,
      accountPatches: {},
      orders: [],
      appointments: [],
      approvals: [territoryApproval],
      activities: [],
      inventoryLots: [],
      territories: [],
    }, data, "2026-09-15");
    assert.equal(state.approvals.length, 1);
    assert.equal(state.approvals[0].type, "Territory exception");
    assert.equal(state.approvals[0].recordId, ACCOUNT);
  });

  test("a manager can review a direct report's territory exception", () => {
    const manager = data.users.find((item) => item.id === MANAGER)!;
    assert.equal(canReviewApproval(data, manager, territoryApproval), true);
  });

  test("a territory exception notification tells management it is reviewable but not a sales lock", () => {
    const event: AuditEvent = {
      id: "audit-1",
      at: "2026-09-15T08:00:00.000Z",
      actorId: REP,
      actorRole: "Sales Representative",
      action: "Created",
      module: "Workspace",
      collection: "approvals",
      entityType: "Workspace.approvals",
      entityId: territoryApproval.id,
      label: territoryApproval.title,
      summary: territoryApproval.detail,
      sensitivity: "manager",
      relatedAccountId: ACCOUNT,
      relatedUserId: REP,
      changes: [],
    };
    const copy = notificationCopy(event);
    assert.equal(copy.title, "Territory exception needs review");
    assert.match(copy.detail, /does not block/i);
    assert.match(copy.detail, /management validation/i);
  });
});
