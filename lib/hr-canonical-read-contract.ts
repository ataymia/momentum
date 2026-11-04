/**
 * REVIEW ONLY: server-owned canonical HR read contract. No Firebase SDK,
 * callable endpoint, browser reader, migration or production activation.
 * The injected transport is intended for synthetic tests ONLY.
 */
import { hrCanonicalReviewPath } from "./hr-canonical-storage-review";
import type { UserAccessRecord } from "./firebase-access";
import type { WorkspaceUser } from "./types";

const fields = {
  leaveRequests: { self: true, manager: true, keys: ["id", "startDate", "endDate", "requestedHours", "status", "submittedAt"] },
  training: { self: true, manager: true, keys: ["id", "courseId", "status", "dueDate", "completedAt"] },
  workflows: { self: true, manager: true, keys: ["id", "type", "title", "status", "submittedAt", "dueDate"] },
  reviews: { self: true, manager: true, keys: ["id", "cycleId", "status"] },
  documents: { self: true, manager: false, keys: ["id", "title", "category", "version", "status"] },
  privateProfiles: { self: true, manager: false, keys: ["preferredName", "phone", "address", "emergencyContact"] },
  compensation: { self: false, manager: false, keys: ["id", "basis", "rate", "effectiveDate", "endDate", "status"] },
} as const;

export type HrCanonicalReadField = keyof typeof fields;
export type HrCanonicalReadCommand = {
  ownerUid: string;
  field: HrCanonicalReadField;
  expectedSessionEpoch: number;
  /** Only an active Administrator can explicitly retrieve separated history. */
  includeSeparatedHistory?: boolean;
};
export type HrCanonicalAuthority = {
  /** All values below must be loaded from trusted server-side authority. */
  authenticatedUid: string | null;
  session: { uid: string; epoch: number; active: boolean } | null;
  actorAccess: UserAccessRecord | null;
  actorDirectory: WorkspaceUser | null;
  targetAccess: UserAccessRecord | null;
  targetDirectory: WorkspaceUser | null;
};
export type HrCanonicalDocument = {
  path: string;
  version: string;
  items: unknown;
};
export type HrCanonicalReadDenial =
  | "invalid-command" | "session-revoked" | "actor-not-authorized"
  | "target-not-authorized" | "field-restricted" | "canonical-invalid"
  | "authority-changed" | "canonical-changed" | "unavailable" | "disabled";
export type HrCanonicalReadResult =
  | { ok: false; reason: HrCanonicalReadDenial }
  | { ok: true; field: HrCanonicalReadField; version: string;
      records: ReadonlyArray<Record<string, string | number>> };
type Authorization = { ok: true; path: string } | { ok: false; reason: HrCanonicalReadDenial };

const deny = (reason: HrCanonicalReadDenial): HrCanonicalReadResult => ({ ok: false, reason });
const denyAuth = (reason: HrCanonicalReadDenial): Authorization => ({ ok: false, reason });
const uidValid = (uid: unknown): uid is string =>
  typeof uid === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(uid);
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const validCommand = (command: HrCanonicalReadCommand) =>
  Boolean(command && uidValid(command.ownerUid) &&
    typeof command.field === "string" &&
    Object.prototype.hasOwnProperty.call(fields, command.field) &&
    Number.isSafeInteger(command.expectedSessionEpoch) && command.expectedSessionEpoch >= 0 &&
    (command.includeSeparatedHistory === undefined ||
      typeof command.includeSeparatedHistory === "boolean"));

/**
 * Evaluate authorization before reading any confidential document, then again
 * after IO. Manager scope requires BOTH authoritative managerId assignments;
 * broad team membership is intentionally insufficient for HR access.
 */
export function authorizeHrCanonicalRead(
  command: HrCanonicalReadCommand, authority: HrCanonicalAuthority,
): Authorization {
  if (!validCommand(command)) return denyAuth("invalid-command");
  const { session, actorAccess: actor, actorDirectory: actorPerson } = authority;
  const uid = authority.authenticatedUid;
  if (!uidValid(uid) || !session || !session.active ||
      session.uid !== uid || session.epoch !== command.expectedSessionEpoch)
    return denyAuth("session-revoked");
  if (!actor || actor.uid !== uid || actor.accountState !== "Active" ||
      actor.role === "Customer" || !actorPerson || actorPerson.id !== uid ||
      actorPerson.role !== actor.role || actorPerson.employmentStatus === "Separated")
    return denyAuth("actor-not-authorized");

  const target = authority.targetAccess;
  const person = authority.targetDirectory;
  if (!target || target.uid !== command.ownerUid || target.role === "Customer" ||
      !person || person.id !== command.ownerUid || person.role !== target.role)
    return denyAuth("target-not-authorized");

  const admin = actor.role === "Administrator";
  const historical = command.includeSeparatedHistory === true;
  if (historical) {
    if (!admin || target.accountState !== "Separated" ||
        person.employmentStatus !== "Separated")
      return denyAuth("target-not-authorized");
  } else if (target.accountState !== "Active" || person.employmentStatus === "Separated") {
    return denyAuth("target-not-authorized");
  }

  const field = fields[command.field];
  const self = command.ownerUid === uid;
  const manager = actor.role === "Sales Manager" && !self &&
    target.managerId === uid && person.managerId === uid;
  if (!admin && !(self && field.self) && !(manager && field.manager))
    return denyAuth("field-restricted");
  return { ok: true, path: hrCanonicalReviewPath(command.ownerUid, command.field) };
}

/** A small, explicit allowlist prevents raw HR payloads and document evidence leaking. */
function projectDocument(
  command: HrCanonicalReadCommand, path: string, document: HrCanonicalDocument | null,
): HrCanonicalReadResult {
  if (!document || document.path !== path ||
      typeof document.version !== "string" || !document.version ||
      document.version.length > 256 || /[\r\n\t]/.test(document.version) ||
      !Array.isArray(document.items) || document.items.length > 500)
    return deny("canonical-invalid");
  const keys: readonly string[] = fields[command.field].keys;
  const records: Array<Record<string, string | number>> = [];
  const ids = new Set<string>();
  for (const item of document.items as unknown[]) {
    if (!object(item) || item.userId !== command.ownerUid ||
        (command.field !== "privateProfiles" &&
          (typeof item.id !== "string" || !item.id || item.id.length > 160)))
      return deny("canonical-invalid");
    if (typeof item.id === "string") {
      if (ids.has(item.id)) return deny("canonical-invalid");
      ids.add(item.id);
    }
    const row: Record<string, string | number> = {};
    for (const key of keys) {
      if (item[key] === undefined || item[key] === null) continue;
      const value = item[key];
      if ((typeof value !== "string" && typeof value !== "number") ||
          (typeof value === "string" && value.length > 2000) ||
          (typeof value === "number" && !Number.isFinite(value)))
        return deny("canonical-invalid");
      row[key] = value;
    }
    records.push(row);
  }
  return { ok: true, field: command.field, version: document.version, records };
}

export function evaluateHrCanonicalRead(
  command: HrCanonicalReadCommand, authority: HrCanonicalAuthority,
  document: HrCanonicalDocument | null,
): HrCanonicalReadResult {
  const authorization = authorizeHrCanonicalRead(command, authority);
  if (!authorization.ok) return deny(authorization.reason);
  return projectDocument(command, authorization.path, document);
}

function authorityFingerprint(value: HrCanonicalAuthority): string {
  const actor = value.actorAccess;
  const target = value.targetAccess;
  const a = value.actorDirectory;
  const t = value.targetDirectory;
  return JSON.stringify([
    value.authenticatedUid, value.session?.uid, value.session?.epoch, value.session?.active,
    actor?.uid, actor?.role, actor?.accountState, actor?.managerId, actor?.updatedAt,
    a?.id, a?.role, a?.managerId, a?.employmentStatus,
    target?.uid, target?.role, target?.accountState, target?.managerId, target?.updatedAt,
    t?.id, t?.role, t?.managerId, t?.employmentStatus,
  ]);
}

export type HrCanonicalReadTransport = {
  readAuthority: () => Promise<HrCanonicalAuthority>;
  readCanonical: (serverComputedPath: string) => Promise<HrCanonicalDocument | null>;
  /** Trusted revision read, not a browser-provided version or cached value. */
  readCanonicalVersion: (serverComputedPath: string) => Promise<string | null>;
};

/**
 * Default disabled. Tests explicitly opt in with an injected synthetic
 * transport. Re-authorizes AFTER the document fetch so a stale in-flight
 * response cannot resurrect data after session/manager/role revocation.
 * A future real handler must obtain both snapshots from trusted sources.
 */
export async function executeHrCanonicalReadReview(
  command: HrCanonicalReadCommand,
  transport: HrCanonicalReadTransport,
  enabled = false,
): Promise<HrCanonicalReadResult> {
  if (!enabled) return deny("disabled");
  try {
    const before = await transport.readAuthority();
    const authorized = authorizeHrCanonicalRead(command, before);
    if (!authorized.ok) return deny(authorized.reason);
    const beforeFingerprint = authorityFingerprint(before);
    const document = await transport.readCanonical(authorized.path);
    const after = await transport.readAuthority();
    if (beforeFingerprint !== authorityFingerprint(after))
      return deny("authority-changed");
    if (!document) return deny("canonical-invalid");
    // Reject a document replaced between its initial read and projection.
    // A real server handler must additionally pin all reads transactionally.
    if (typeof transport.readCanonicalVersion !== "function") return deny("unavailable");
    const currentVersion = await transport.readCanonicalVersion(authorized.path);
    if (currentVersion !== document.version) return deny("canonical-changed");
    // Revocation may happen while the version read is in flight.
    const finalAuthority = await transport.readAuthority();
    if (beforeFingerprint !== authorityFingerprint(finalAuthority))
      return deny("authority-changed");
    return evaluateHrCanonicalRead(command, finalAuthority, document);
  } catch {
    return deny("unavailable");
  }
}
