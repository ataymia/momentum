/**
 * Additive username assignment for identities that pre-date username login.
 *
 * This is a migration, not an authentication cutover. Planning happens here as a pure function so the
 * guarantees can be tested without a live Firebase:
 *
 *   - it produces Firestore writes only, and never a Firebase Authentication operation, so no password,
 *     uid, or sign-in identity is touched;
 *   - it never changes role, team, reporting line, account state, or any employment record;
 *   - an identity that already holds a username is reported and left alone;
 *   - a collision takes the next free suffix and never disturbs the account that holds the base name.
 *
 * E-mail sign-in keeps working before, during, and after this runs.
 */

import type { UsernameBackfillEntry } from "./auth-contract";
import { USERNAME_INDEX_COLLECTION, generateUsername, normalizeUsername, splitLegalName } from "./username";

export type IdentitySnapshot = { id: string; data: Record<string, unknown> };
export type BackfillWrite = { path: string; data: Record<string, unknown> };

export type UsernameBackfillPlan = {
  entries: UsernameBackfillEntry[];
  /** Empty on a dry run. Firestore document writes only. */
  writes: BackfillWrite[];
};

export type BackfillInput = {
  accessRecords: IdentitySnapshot[];
  directory: IdentitySnapshot[];
  /** Existing `usernames/{username}` documents, so a re-run is idempotent. */
  index: IdentitySnapshot[];
  apply: boolean;
  actorId: string;
  at: string;
  userAccessCollection: string;
  employeeDirectoryCollection: string;
};

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** Fields the migration is allowed to add. Everything else on the document is copied through untouched. */
const ADDITIVE_ACCESS_FIELDS = ["username", "updatedAt", "updatedBy"] as const;

export function planUsernameBackfill(input: BackfillInput): UsernameBackfillPlan {
  const directoryById = new Map(input.directory.map((item) => [item.id, item.data]));
  const taken = new Set(input.index.map((item) => item.id));
  const claimedBy = new Map(input.index.map((item) => [item.id, text(item.data.uid)]));
  const entries: UsernameBackfillEntry[] = [];
  const writes: BackfillWrite[] = [];

  for (const record of input.accessRecords) {
    const uid = record.id;
    const profile = directoryById.get(uid) ?? {};
    const name = text(profile.name) || text(record.data.email) || uid;
    const email = (text(record.data.email) || text(profile.email)).toLowerCase();
    const existing = normalizeUsername(text(record.data.username));

    if (existing && claimedBy.get(existing) === uid) {
      entries.push({ uid, name, username: existing, status: "already-assigned" });
      continue;
    }
    if (!email.includes("@")) {
      entries.push({ uid, name, username: "", status: "unresolvable" });
      continue;
    }

    const parts = splitLegalName(name);
    const username = generateUsername(parts.firstName || text(profile.firstName), parts.lastName, taken);
    if (!username) {
      entries.push({ uid, name, username: "", status: "unresolvable" });
      continue;
    }
    taken.add(username);
    claimedBy.set(username, uid);
    entries.push({ uid, name, username, status: input.apply ? "assigned" : "would-assign" });
    if (!input.apply) continue;

    writes.push({ path: `${USERNAME_INDEX_COLLECTION}/${username}`, data: { uid, email, updatedAt: input.at, updatedBy: input.actorId } });
    // Spread-then-add: role, team, managerId, accountState and everything else survive byte for byte.
    writes.push({ path: `${input.userAccessCollection}/${uid}`, data: { ...record.data, username, updatedAt: input.at, updatedBy: input.actorId } });
    writes.push({ path: `${input.employeeDirectoryCollection}/${uid}`, data: { ...profile, username, updatedAt: input.at } });
  }

  return { entries, writes };
}

/** Fields a backfill write is permitted to introduce or change on an access record. */
export const additiveAccessFields: readonly string[] = ADDITIVE_ACCESS_FIELDS;

/**
 * Clearing a username frees the login name without touching the Firebase identity.
 *
 * Only the index entry is deleted and the field blanked; the Auth user, the access record's role and
 * state, and every employment record are left exactly as they were, so the employee keeps e-mail login.
 */
export function planUsernameRelease(record: IdentitySnapshot, profile: Record<string, unknown>, actorId: string, at: string, userAccessCollection: string, employeeDirectoryCollection: string): { username: string; deletes: string[]; writes: BackfillWrite[] } {
  const username = normalizeUsername(text(record.data.username));
  return {
    username,
    deletes: username ? [`${USERNAME_INDEX_COLLECTION}/${username}`] : [],
    writes: username
      ? [
          { path: `${userAccessCollection}/${record.id}`, data: { ...record.data, username: "", updatedAt: at, updatedBy: actorId } },
          { path: `${employeeDirectoryCollection}/${record.id}`, data: { ...profile, username: "", updatedAt: at } },
        ]
      : [],
  };
}
