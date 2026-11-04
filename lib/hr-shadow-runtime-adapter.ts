import type { PersistenceScope } from "./firebase-access";
import {
  acceptHrShadowFetch,
  assembleAuthorizedHrShadowSnapshot,
  planHrShadowCacheTransition,
  type HrShadowCacheTransition,
} from "./hr-shadow-cache-revocation";
import { parseDocPath } from "./firestore-domains";

type HcmDocument = Record<string, unknown> | null;
const copyScope = (scope: PersistenceScope): PersistenceScope => ({
  ...scope,
  readableUserIds: new Set(scope.readableUserIds),
  managedUserIds: new Set(scope.managedUserIds),
  supervisedBrandAmbassadorIds: new Set(scope.supervisedBrandAmbassadorIds),
});
type FetchBatch = {
  epoch: number;
  requestUid: string;
  requestedPaths: readonly string[];
  documents: ReadonlyMap<string, HcmDocument>;
  deniedPaths?: readonly string[];
};

/**
 * Stateful, in-memory HR read adapter for a future guarded persistence cutover.
 * No network, localStorage, Firestore writes, or production activation.
 * The caller must advance its epoch BEFORE beginning a new role/session read.
 */
export class HrShadowRuntimeAdapter {
  private scope: PersistenceScope;
  private generation = 0;
  private state: "unprimed" | "ready" | "quarantined" = "unprimed";
  private documents = new Map<string, HcmDocument>();
  private quarantinedJournals = new Set<string>();

  constructor(scope: PersistenceScope) {
    this.scope = copyScope(scope);
  }

  get epoch() { return this.generation; }
  get isReady() { return this.state === "ready"; }
  get isQuarantined() { return this.state === "quarantined"; }
  get journalKeysRequiringReview() { return [...this.quarantinedJournals].sort(); }
  get cachedPaths() { return [...this.documents.keys()].sort(); }

  /**
   * Atomically revoke old assembled data and unauthorized raw HCM documents.
   * Journal keys are evidence to preserve outside this adapter, never deleted.
   */
  transition(nextScope: PersistenceScope, pendingStorageKeys: readonly string[] = []): {
    epoch: number;
    plan: HrShadowCacheTransition;
  } {
    const plan = planHrShadowCacheTransition({
      previousScope: this.scope,
      nextScope,
      cachedPaths: [...this.documents.keys()],
      pendingStorageKeys,
    });
    this.generation += 1;
    this.scope = copyScope(nextScope);
    const retain = new Set(plan.retainPaths);
    for (const path of this.documents.keys()) if (!retain.has(path)) this.documents.delete(path);
    for (const key of plan.quarantinePendingKeys) this.quarantinedJournals.add(key);
    this.state = plan.blockedByPendingOrDenied || this.quarantinedJournals.size > 0 ? "quarantined" : "unprimed";
    return { epoch: this.generation, plan };
  }

  /**
   * A response is accepted only for the current UID, epoch and authorized
   * requested paths. Any denied HR path quarantines the read model.
   */
  accept(batch: FetchBatch): boolean {
    if (this.state === "quarantined") return false;
    if (batch.deniedPaths?.length) {
      this.deny();
      return false;
    }
    const paths = [...batch.documents.keys()];
    if (!acceptHrShadowFetch({
      requestEpoch: batch.epoch,
      activeEpoch: this.generation,
      requestUid: batch.requestUid,
      activeScope: this.scope,
      requestedPaths: batch.requestedPaths,
      returnedPaths: paths,
    })) return false;
    const next = new Map(this.documents);
    for (const [path, data] of batch.documents) {
      if (parseDocPath(path)?.domainId !== "hcm") return false;
      next.set(path, data);
    }
    // Reject malformed cross-owned shards before storing them, not just at UI projection.
    const assembled = assembleAuthorizedHrShadowSnapshot(this.scope, next);
    if (assembled === null && [...next.values()].some((value) => value !== null)) {
      this.deny();
      return false;
    }
    this.documents = next;
    this.state = "ready";
    return true;
  }

  /** A denied read must blank the HCM model; a new scope transition is required to retry. */
  deny(): void {
    this.generation += 1;
    this.state = "quarantined";
    this.documents.clear();
  }

  /** Never expose stale or quarantined HR state to an engine. */
  snapshot(): Record<string, unknown> | null {
    return this.state === "ready"
      ? assembleAuthorizedHrShadowSnapshot(this.scope, this.documents)
      : null;
  }
}
