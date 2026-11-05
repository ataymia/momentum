/**
 * REVIEW ONLY. An injectable Firebase Admin Firestore-shaped transport for
 * synthetic canonical HR read tests. There is no SDK initialization, HTTP
 * endpoint, browser export, deployed rule change, or production activation.
 *
 * This deliberately accepts only a loopback emulator and a review project.
 * It must NOT be repurposed as a production adapter without security review,
 * real Admin SDK binding, approved schema/migration, and separate release.
 */
import { hrCanonicalReviewPath } from "./hr-canonical-storage-review";
import type {
  HrCanonicalAuthority, HrCanonicalDocument, HrCanonicalReadCommand,
} from "./hr-canonical-read-contract";
import type { HrCanonicalPinnedTransport } from "./hr-canonical-pinned-snapshot";
import type { UserAccessRecord } from "./firebase-access";
import type { WorkspaceUser } from "./types";

export type HrAdminSnapshotShape = {
  exists: boolean;
  data: () => unknown;
};
export type HrAdminDocumentShape = {
  path: string;
  get: () => Promise<HrAdminSnapshotShape>;
};
export type HrAdminTransactionShape = {
  get: (reference: HrAdminDocumentShape) => Promise<HrAdminSnapshotShape>;
};
export type HrAdminFirestoreShape = {
  projectId: string;
  doc: (path: string) => HrAdminDocumentShape;
  runTransaction: <T>(
    read: (transaction: HrAdminTransactionShape) => Promise<T>,
    options: { readOnly: true },
  ) => Promise<T>;
};
export type HrCanonicalServerReviewOptions = {
  /** Both values must come from trusted server configuration, not a request. */
  projectId: string;
  emulatorHost: string;
  firestore: HrAdminFirestoreShape;
  /** The command must be captured server-side for the verified request. */
  command: HrCanonicalReadCommand;
};

const uidValid = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function loopback(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const match = /^(?:127\.0\.0\.1|localhost):([0-9]{2,5})$/.exec(value);
  const port = Number(match?.[1]);
  return Boolean(match && port >= 1 && port <= 65535);
}

function snapshotData(value: HrAdminSnapshotShape): Record<string, unknown> | null {
  if (!value || value.exists !== true || typeof value.data !== "function") return null;
  const data = value.data();
  return record(data) ? data : null;
}

function access(data: Record<string, unknown> | null, uid: string): UserAccessRecord | null {
  if (!data || (data.uid !== undefined && data.uid !== uid)) return null;
  return { ...data, uid } as UserAccessRecord;
}
function directory(data: Record<string, unknown> | null, uid: string): WorkspaceUser | null {
  if (!data || (data.id !== undefined && data.id !== uid)) return null;
  return { ...data, id: uid } as WorkspaceUser;
}
function session(data: Record<string, unknown> | null, uid: string):
  HrCanonicalAuthority["session"] {
  if (!data || data.uid !== uid || typeof data.active !== "boolean" ||
      !Number.isSafeInteger(data.epoch) || (data.epoch as number) < 0) return null;
  return { uid, epoch: data.epoch as number, active: data.active };
}

/**
 * Construct a transport factory only for a synthetic review project.
 * The returned function MUST be invoked solely with the UID produced by
 * the trusted identity boundary after verifyIdToken(token, true).
 *
 * Browser roles/claims are never accepted here. Every path is constructed
 * from that verified UID and the validated target command, never supplied
 * by a client. Only read-only transaction methods are exposed.
 */
export function createHrCanonicalServerTransportReview(
  options: HrCanonicalServerReviewOptions,
  enabled = false,
): ((verifiedUid: string) => HrCanonicalPinnedTransport) | null {
  if (!enabled || !options || !record(options) ||
      typeof options.projectId !== "string" ||
      !/^momentum-hr-[a-z0-9-]+-review$/.test(options.projectId) ||
      !loopback(options.emulatorHost) ||
      !options.firestore || options.firestore.projectId !== options.projectId ||
      typeof options.firestore.doc !== "function" ||
      typeof options.firestore.runTransaction !== "function" ||
      !options.command || !uidValid(options.command.ownerUid) ||
      !Number.isSafeInteger(options.command.expectedSessionEpoch) ||
      options.command.expectedSessionEpoch < 0 ||
      (options.command.includeSeparatedHistory !== undefined &&
       typeof options.command.includeSeparatedHistory !== "boolean")) return null;

  let canonicalPath: string;
  try {
    canonicalPath = hrCanonicalReviewPath(options.command.ownerUid, options.command.field);
  } catch {
    return null;
  }
  const db = options.firestore;
  const targetUid = options.command.ownerUid;

  return (verifiedUid: string): HrCanonicalPinnedTransport => {
    if (!uidValid(verifiedUid)) throw new Error("HR identity unavailable");
    const actorAccessPath = "userAccess/" + verifiedUid;
    const targetAccessPath = "userAccess/" + targetUid;
    const actorDirectoryPath = "hrCanonicalReadAuthorityReview/" + verifiedUid;
    const targetDirectoryPath = "hrCanonicalReadAuthorityReview/" + targetUid;
    const actorSessionPath = "hrCanonicalReadSessionReview/" + verifiedUid;

    const readDoc = async (
      path: string, get: (ref: HrAdminDocumentShape) => Promise<HrAdminSnapshotShape>,
    ): Promise<Record<string, unknown> | null> => {
      const reference = db.doc(path);
      if (!reference || reference.path !== path) throw new Error("HR reference unavailable");
      return snapshotData(await get(reference));
    };
    const readAuthority = async (
      get: (ref: HrAdminDocumentShape) => Promise<HrAdminSnapshotShape>,
    ): Promise<HrCanonicalAuthority> => {
      const [s, actor, actorPerson, target, targetPerson] = await Promise.all([
        readDoc(actorSessionPath, get), readDoc(actorAccessPath, get),
        readDoc(actorDirectoryPath, get), readDoc(targetAccessPath, get),
        readDoc(targetDirectoryPath, get),
      ]);
      return {
        authenticatedUid: verifiedUid,
        session: session(s, verifiedUid),
        actorAccess: access(actor, verifiedUid),
        actorDirectory: directory(actorPerson, verifiedUid),
        targetAccess: access(target, targetUid),
        targetDirectory: directory(targetPerson, targetUid),
      };
    };
    const readCanonical = async (
      path: string, get: (ref: HrAdminDocumentShape) => Promise<HrAdminSnapshotShape>,
    ): Promise<HrCanonicalDocument | null> => {
      if (path !== canonicalPath) throw new Error("HR canonical path unavailable");
      const data = await readDoc(canonicalPath, get);
      return data ? {
        path: canonicalPath, version: data.version as string, items: data.items,
      } : null;
    };
    return {
      withReadOnlySnapshot: (callback) => db.runTransaction(async (tx) => {
        const get = (ref: HrAdminDocumentShape) => tx.get(ref);
        return callback({
          readAuthority: () => readAuthority(get),
          readCanonical: (path) => readCanonical(path, get),
          readCanonicalVersion: async (path) => {
            const document = await readCanonical(path, get);
            return typeof document?.version === "string" ? document.version : null;
          },
        });
      }, { readOnly: true }),
      readAuthority: () => readAuthority((ref) => ref.get()),
    };
  };
}
