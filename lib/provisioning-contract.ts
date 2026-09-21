/**
 * The provisioning contract shared by the browser and the Cloudflare Worker.
 *
 * Both sides import this module so the request shape, the role allow-list, and the validation rules cannot
 * drift apart. The Worker re-validates everything here on the server: the browser copy is a convenience,
 * never a control.
 */

import type { Role, Team } from "./types";
import { normalizeUsername, usernameProblem } from "./username";

export const PROVISION_EMPLOYEE_PATH = "/api/admin/provision-employee";
export const PROVISIONING_STATUS_PATH = "/api/admin/provisioning-status";
export const DELETE_EMPLOYEE_PATH = "/api/admin/delete-employee";

export type DeleteEmployeeRequest = { uid: string };
export type DeleteEmployeeSuccess = {
  ok: true;
  uid: string;
  email: string;
  /** False when there was no Firebase identity left to remove, so the caller knows it was already gone. */
  authIdentityDeleted: boolean;
  documentsDeleted: number;
};
export type DeleteEmployeeResponse = DeleteEmployeeSuccess | ProvisioningFailure;

/**
 * Which part of the pipeline failed. Administrators need to know whether to retry, recover, or escalate,
 * and the Worker never leaks raw backend errors to satisfy that.
 */
export type ProvisioningStage = "authentication" | "authorization" | "request" | "firebase-auth" | "firestore-access" | "service";

export type ProvisioningOutcome =
  /** A brand-new Firebase identity was created and its access records written. */
  | "created"
  /** An Auth identity already existed with no Momentum access records; it was adopted and completed. */
  | "recovered"
  /** Records already existed and matched; nothing changed. */
  | "already-provisioned";

/** Administrator accounts are bootstrap-only or promoted by an existing Administrator, never provisioned here. */
export const PROVISIONABLE_ROLES = ["Sales Manager", "Sales Representative", "Brand Ambassador", "Operations", "Warehouse"] as const;
export type ProvisionableRoleName = (typeof PROVISIONABLE_ROLES)[number];

export const TEAM_FOR_ROLE: Record<ProvisionableRoleName, Exclude<Team, "Customer">> = {
  "Sales Manager": "Sales",
  "Sales Representative": "Sales",
  "Brand Ambassador": "Sales",
  Operations: "Operations",
  Warehouse: "Operations",
};

export type ProvisionEmployeeProfile = {
  name: string;
  firstName: string;
  initials: string;
  title: string;
  role: ProvisionableRoleName;
  team: Exclude<Team, "Customer">;
  managerId?: string;
  accent: string;
  /** Login identifier. The e-mail stays on the identity for recovery only. */
  username: string;
  phone?: string;
};

export type ProvisionEmployeeRequest = {
  email: string;
  temporaryPassword: string;
  profile: ProvisionEmployeeProfile;
};

export type ProvisionEmployeeSuccess = { ok: true; uid: string; email: string; outcome: ProvisioningOutcome };
export type ProvisioningFailure = { ok: false; stage: ProvisioningStage; message: string };
export type ProvisionEmployeeResponse = ProvisionEmployeeSuccess | ProvisioningFailure;

export type ProvisioningStatusRequest = { email: string };
export type ProvisioningStatusSuccess = {
  ok: true;
  email: string;
  /** A Firebase Authentication identity exists for this address. */
  authIdentityExists: boolean;
  /** A `userAccess/{uid}` record exists for that identity. */
  accessRecordExists: boolean;
  /** Auth exists but Momentum access does not: safe to adopt instead of creating a duplicate. */
  recoverable: boolean;
  uid?: string;
};
export type ProvisioningStatusResponse = ProvisioningStatusSuccess | ProvisioningFailure;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function temporaryPasswordProblem(password: string): string | null {
  if (password.length < 10) return "Temporary password must be at least 10 characters.";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) return "Temporary password needs upper-case, lower-case, and a digit.";
  return null;
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/**
 * Server-side validation. Returns the normalized request or the reason it was refused.
 *
 * The role/team pair is checked here rather than trusted from the client, so a tampered request cannot
 * mint an Administrator or place an employee on a team their role does not belong to.
 */
export function validateProvisionRequest(input: unknown): { ok: true; value: ProvisionEmployeeRequest } | { ok: false; message: string } {
  if (!input || typeof input !== "object") return { ok: false, message: "Malformed provisioning request." };
  const raw = input as Record<string, unknown>;
  const email = text(raw.email).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) return { ok: false, message: "Enter a valid work e-mail address." };

  const temporaryPassword = typeof raw.temporaryPassword === "string" ? raw.temporaryPassword : "";
  const passwordProblem = temporaryPasswordProblem(temporaryPassword);
  if (passwordProblem) return { ok: false, message: passwordProblem };

  if (!raw.profile || typeof raw.profile !== "object") return { ok: false, message: "The employee profile is missing." };
  const profile = raw.profile as Record<string, unknown>;
  const name = text(profile.name);
  if (name.length < 2) return { ok: false, message: "Enter the employee's legal name." };

  const role = text(profile.role) as ProvisionableRoleName;
  if (!PROVISIONABLE_ROLES.includes(role)) return { ok: false, message: "That role cannot be provisioned here. Administrator access is granted separately." };

  const username = normalizeUsername(text(profile.username));
  const usernameIssue = usernameProblem(username);
  if (usernameIssue) return { ok: false, message: usernameIssue };

  const team = text(profile.team) as Exclude<Team, "Customer">;
  if (team !== TEAM_FOR_ROLE[role]) return { ok: false, message: `A ${role} must be on the ${TEAM_FOR_ROLE[role]} team.` };

  const title = text(profile.title) || role;
  const parts = name.split(/\s+/).filter(Boolean);
  const firstName = text(profile.firstName) || parts[0] || name;
  const initials = (text(profile.initials) || (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)![0]}` : name.slice(0, 2))).toUpperCase();
  const managerId = text(profile.managerId) || undefined;
  const phone = text(profile.phone) || undefined;
  const accent = /^#[0-9a-fA-F]{6}$/.test(text(profile.accent)) ? text(profile.accent) : "#53657d";

  return { ok: true, value: { email, temporaryPassword, profile: { name, firstName, initials, title, role, team, managerId, accent, username, phone } } };
}

/** Roles that may never be handed out by the provisioning endpoint, restated for tests and reviewers. */
export const isProvisionableRole = (role: Role): role is ProvisionableRoleName => (PROVISIONABLE_ROLES as readonly string[]).includes(role);
