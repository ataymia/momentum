/**
 * REVIEW ONLY: server-side, emulator-gated, read-only cross-domain audit
 * snapshot adapter. NOT a production transport, authenticated provenance
 * attestation, migration executor, or permission to read employee records.
 * All paths are derived from a fixed synthetic reviewer inventory.
 */
type Row = Record<string, unknown>;
const row = (value: unknown): value is Row =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const id = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const shardName = (value: unknown): value is string =>
  typeof value === "string" && /^events__chunk_[0-9]{6}$/.test(value);
const version = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9]{1,15}:[0-9]{1,9}$/.test(value) &&
  Number(value.split(":")[1]) < 1_000_000_000;

export type HrPinnedReviewReference = { path: string };
export type HrPinnedReviewSnapshot = {
  ref: HrPinnedReviewReference;
  exists: boolean;
  updateTime?: { seconds: number; nanoseconds: number } | null;
  data: () => unknown;
};
export type HrPinnedReviewTransaction = {
  get: (ref: HrPinnedReviewReference) => Promise<HrPinnedReviewSnapshot>;
};
export type HrPinnedReviewFirestore = {
  projectId: string;
  doc: (path: string) => HrPinnedReviewReference;
  runTransaction: <T>(
    fn: (tx: HrPinnedReviewTransaction) => Promise<T>,
    options: { readOnly: true; maxAttempts: 1 },
  ) => Promise<T>;
};
export type HrPinnedReviewInventory = {
  actorUid: string;
  reviewerUid: string;
  shardNames: readonly string[];
  eventSubjects: readonly { eventId: string; subjectUid: string }[];
  /** Every complete document's updateTime, from independently trusted review. */
  expectedVersions: Readonly<Record<string, string>>;
};
export type HrPinnedReviewResult = {
  status: "versions-matched-unattested" | "quarantined";
  reason: "none" | "unauthorized" | "missing-or-stale-document" |
    "inventory-conflict" | "read-failed";
  safeToAppend: false;
  safeToReplayWithoutWrite: false;
  independentlyAuthenticated: false;
  sameHistoricalSnapshotVerified: false;
};
const report = (reason: HrPinnedReviewResult["reason"]): HrPinnedReviewResult => ({
  status: reason === "none" ? "versions-matched-unattested" : "quarantined",
  reason, safeToAppend: false, safeToReplayWithoutWrite: false,
  independentlyAuthenticated: false, sameHistoricalSnapshotVerified: false,
});
const pinnedVersion = (snapshot: HrPinnedReviewSnapshot): string | null => {
  const t = snapshot?.updateTime;
  if (!t || !Number.isSafeInteger(t.seconds) ||
      !Number.isSafeInteger(t.nanoseconds) ||
      t.seconds < 1 || t.nanoseconds < 0 ||
      t.nanoseconds >= 1_000_000_000) return null;
  return t.seconds + ":" + t.nanoseconds;
};

/**
 * Factory returns null by default. Only the dedicated local emulator project
 * is accepted; caller-supplied inventories and authorization callbacks are
 * NOT proof of a real reviewer, historical completeness or legal retention.
 * No endpoint, write method, raw snapshot, document ID or private payload is
 * exposed by the returned function.
 */
export function createHrAuditPinnedReaderReview(options: {
  projectId: string;
  emulatorHost: string;
  firestore: HrPinnedReviewFirestore;
  inventory: HrPinnedReviewInventory;
  /** Must be implemented by a trusted server reviewer gate, never a client. */
  authorizeReviewer: (reviewerUid: string) => Promise<boolean>;
}, enabled = false): (() => Promise<HrPinnedReviewResult>) | null {
  if (!enabled || !row(options) ||
      options.projectId !== "momentum-hr-admin-sdk-review" ||
      options.emulatorHost !== "127.0.0.1:8080" ||
      process.env.FIRESTORE_EMULATOR_HOST !== options.emulatorHost ||
      process.env.GCLOUD_PROJECT !== options.projectId ||
      !options.firestore ||
      options.firestore.projectId !== options.projectId ||
      typeof options.firestore.doc !== "function" ||
      typeof options.firestore.runTransaction !== "function" ||
      typeof options.authorizeReviewer !== "function" ||
      !row(options.inventory)) return null;

  const { actorUid, reviewerUid, shardNames, eventSubjects, expectedVersions } =
    options.inventory;
  if (!id(actorUid) || !id(reviewerUid) || actorUid === reviewerUid ||
      !Array.isArray(shardNames) || !Array.isArray(eventSubjects) ||
      !row(expectedVersions) ||
      shardNames.length < 1 || shardNames.length > 50 ||
      eventSubjects.length < 1 || eventSubjects.length > 50 ||
      shardNames.some((name) => !shardName(name)) ||
      new Set(shardNames).size !== shardNames.length ||
      eventSubjects.some((entry) => !row(entry) ||
        !id(entry.eventId) || !id(entry.subjectUid)) ||
      new Set(eventSubjects.map((entry) => entry.eventId)).size !==
        eventSubjects.length) return null;

  const chunkPath = `userDomains/${actorUid}/audit/events`;
  const legacyPath = `userDomains/${actorUid}/hcm/audit`;
  const shards = shardNames.map((name) => `userDomains/${actorUid}/audit/${name}`);
  const events = eventSubjects.map(({ eventId, subjectUid }) =>
    `hrAuditReview/${subjectUid}/events/${eventId}`);
  const receipts = eventSubjects.map(({ eventId }) =>
    `hrAuditReviewReceipts/${eventId}`);
  const paths = [chunkPath, legacyPath, ...shards, ...events, ...receipts];
  if (new Set(paths).size !== paths.length ||
      Object.keys(expectedVersions).length !== paths.length ||
      paths.some((path) => !Object.hasOwn(expectedVersions, path) ||
        !version(expectedVersions[path]))) return null;

  const db = options.firestore;
  const expectedIds = new Set(eventSubjects.map((entry) => entry.eventId));
  const verifyItems = (value: unknown): boolean => {
    if (!Array.isArray(value) || value.length !== expectedIds.size) return false;
    const seen = new Set<string>();
    for (const item of value) {
      if (!row(item) || !id(item.id) || item.actorId !== actorUid ||
          !expectedIds.has(item.id) || seen.has(item.id)) return false;
      seen.add(item.id);
    }
    return seen.size === expectedIds.size;
  };

  return async (): Promise<HrPinnedReviewResult> => {
    try {
      if (await options.authorizeReviewer(reviewerUid) !== true)
        return report("unauthorized");
      return await db.runTransaction(async (tx) => {
        const snapshots: HrPinnedReviewSnapshot[] = [];
        for (const path of paths) {
          const ref = db.doc(path);
          if (!ref || ref.path !== path)
            return report("missing-or-stale-document");
          snapshots.push(await tx.get(ref));
        }
        for (let i = 0; i < paths.length; i++) {
          const snap = snapshots[i];
          if (!snap || snap.ref?.path !== paths[i] || !snap.exists ||
              pinnedVersion(snap) !== expectedVersions[paths[i]] ||
              typeof snap.data !== "function" || !row(snap.data()))
            return report("missing-or-stale-document");
        }
        const manifest = snapshots[0].data() as Row;
        const legacy = snapshots[1].data() as Row;
        if (!Array.isArray(manifest.shards) ||
            manifest.shards.length !== shardNames.length ||
            manifest.shards.some((name, i) => name !== shardNames[i]) ||
            manifest.itemCount !== expectedIds.size ||
            !verifyItems(legacy.items)) return report("inventory-conflict");
        const seen = new Set<string>();
        for (const snap of snapshots.slice(2, 2 + shards.length)) {
          const data = snap.data() as Row;
          if (!Array.isArray(data.items)) return report("inventory-conflict");
          for (const item of data.items) {
            if (!row(item) || !id(item.id) || item.actorId !== actorUid ||
                !expectedIds.has(item.id) || seen.has(item.id))
              return report("inventory-conflict");
            seen.add(item.id);
          }
        }
        if (seen.size !== expectedIds.size) return report("inventory-conflict");
        for (let i = 0; i < eventSubjects.length; i++) {
          const subject = snapshots[2 + shards.length + i].data() as Row;
          const receipt = snapshots[2 + shards.length + events.length + i].data() as Row;
          const entry = eventSubjects[i];
          if (!row(subject.event) || !row(subject.provenance) ||
              subject.event.id !== entry.eventId ||
              subject.provenance.sourcePath !== legacyPath ||
              subject.provenance.subjectUid !== entry.subjectUid ||
              receipt.sourcePath !== legacyPath ||
              receipt.destinationPath !== events[i] ||
              receipt.subjectUid !== entry.subjectUid)
            return report("inventory-conflict");
        }
        // Recheck authorization inside the read-only transaction.
        if (await options.authorizeReviewer(reviewerUid) !== true)
          return report("unauthorized");
        // Matching versions and contents are NOT authenticated provenance.
        return report("none");
      }, { readOnly: true, maxAttempts: 1 });
    } catch {
      // Never expose Firestore errors, paths, subjects or confidential values.
      return report("read-failed");
    }
  };
}
