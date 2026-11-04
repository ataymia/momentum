/**
 * REVIEW ONLY: transactionally pinned, synthetic canonical HR reads.
 * No endpoint, Admin SDK wiring, production storage or client activation.
 * A future trusted adapter MUST provide a genuine read-only snapshot/transaction
 * spanning authority, session and canonical revision reads.
 */
import {
  authorizeHrCanonicalRead, authorityFingerprint, evaluateHrCanonicalRead,
  type HrCanonicalAuthority, type HrCanonicalDocument,
  type HrCanonicalReadCommand, type HrCanonicalReadResult,
} from "./hr-canonical-read-contract";

export type HrCanonicalPinnedReader = {
  readAuthority: () => Promise<HrCanonicalAuthority>;
  readCanonical: (serverComputedPath: string) => Promise<HrCanonicalDocument | null>;
  readCanonicalVersion: (serverComputedPath: string) => Promise<string | null>;
};

export type HrCanonicalPinnedTransport = {
  /** All callback reads MUST observe one consistent read-only database snapshot. */
  withReadOnlySnapshot: <T>(callback: (reader: HrCanonicalPinnedReader) => Promise<T>) => Promise<T>;
  /** Fresh trusted authority read AFTER the snapshot has finished. */
  readAuthority: () => Promise<HrCanonicalAuthority>;
};

/** Retry ONLY an explicitly signalled transactional contention, never revocation. */
export class HrCanonicalSnapshotConflict extends Error {
  constructor() {
    super("Synthetic HR read snapshot contention");
    this.name = "HrCanonicalSnapshotConflict";
  }
}

const denied = (reason: "disabled" | "unavailable" | "authority-changed" |
  "canonical-changed" | "canonical-invalid"): HrCanonicalReadResult => ({ ok: false, reason });

/**
 * Disabled unless the test explicitly opts in. A snapshot conflict may retry
 * the ENTIRE read at most once. Authorization denial, session revocation and
 * post-snapshot authority changes never retry or return partial HR records.
 */
export async function executeHrCanonicalPinnedReadReview(
  command: HrCanonicalReadCommand,
  transport: HrCanonicalPinnedTransport,
  enabled = false,
): Promise<HrCanonicalReadResult> {
  if (!enabled) return denied("disabled");
  if (!transport || typeof transport.withReadOnlySnapshot !== "function" ||
      typeof transport.readAuthority !== "function") return denied("unavailable");

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const pinned = await transport.withReadOnlySnapshot(async (reader) => {
        const authority = await reader.readAuthority();
        const fingerprint = authorityFingerprint(authority);
        const permission = authorizeHrCanonicalRead(command, authority);
        if (!permission.ok) {
          return { result: { ok: false, reason: permission.reason } as HrCanonicalReadResult, fingerprint };
        }
        const document = await reader.readCanonical(permission.path);
        if (!document) return { result: denied("canonical-invalid"), fingerprint };
        const revision = await reader.readCanonicalVersion(permission.path);
        if (!revision || revision !== document.version) {
          return { result: denied("canonical-changed"), fingerprint };
        }
        return { result: evaluateHrCanonicalRead(command, authority, document), fingerprint };
      });
      if (!pinned.result.ok) return pinned.result;

      // The pinned snapshot cannot prevent a later revocation. Recheck with
      // fresh server authority before releasing any allowlisted projection.
      const current = await transport.readAuthority();
      if (authorityFingerprint(current) !== pinned.fingerprint) {
        return denied("authority-changed");
      }
      const permission = authorizeHrCanonicalRead(command, current);
      if (!permission.ok) return { ok: false, reason: permission.reason };
      return pinned.result;
    } catch (error) {
      if (error instanceof HrCanonicalSnapshotConflict && attempt === 0) continue;
      return denied("unavailable");
    }
  }
  return denied("unavailable");
}
