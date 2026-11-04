import type { PersistenceScope } from "./firebase-access";
import { DOMAIN_SPECS, assembleState, parseDocPath } from "./firestore-domains";
import { planHrShadowReadPaths } from "./hr-shadow-read-compatibility";

/**
 * REVIEW-ONLY cache transition model for a future HR shadow-rules cutover.
 * No Firebase, browser storage, network, side effects or runtime wiring.
 * Callers must invalidate their assembled HCM state as well as raw documents.
 */
const HCM = DOMAIN_SPECS.find((spec) => spec.id === "hcm");
if (!HCM) throw new Error("HCM domain specification missing");
const isHcmPath = (path: string) => parseDocPath(path)?.domainId === "hcm";
const sorted = (values: Iterable<string>) => [...new Set(values)].sort();
const allowed = (scope: PersistenceScope) =>
  new Set(planHrShadowReadPaths(scope).readable.map((item) => item.path));

export type HrShadowCacheTransition = {
  /** A new identity, changed authority or rejected cloud read cannot reuse old HCM state. */
  invalidateHcmSnapshot: boolean;
  /** A pending HCM journal must be quarantined, not flushed under changed authority. */
  blockedByPendingOrDenied: boolean;
  evictPaths: string[];
  retainPaths: string[];
  requestPaths: string[];
  quarantinePendingPaths: string[];
};

/**
 * Compute a fail-closed cache transition. No record contents or identifiers are
 * logged. This plan is NOT applied to the live FirestoreBackend yet.
 */
export function planHrShadowCacheTransition(input: {
  previousScope: PersistenceScope | null;
  nextScope: PersistenceScope;
  cachedPaths: readonly string[];
  pendingWritePaths?: readonly string[];
  deniedReadPaths?: readonly string[];
}): HrShadowCacheTransition {
  const nextAllowed = allowed(input.nextScope);
  const previousAllowed = input.previousScope ? allowed(input.previousScope) : new Set<string>();
  const identityChanged = !input.previousScope || input.previousScope.uid !== input.nextScope.uid;
  const authorityChanged = Boolean(input.previousScope &&
    (input.previousScope.role !== input.nextScope.role ||
      input.previousScope.accountState !== input.nextScope.accountState));
  const pathsRevoked = [...previousAllowed].some((path) => !nextAllowed.has(path));
  const denied = (input.deniedReadPaths ?? []).some(isHcmPath);
  const reset = identityChanged || authorityChanged || pathsRevoked || denied;
  const cached = sorted(input.cachedPaths.filter(isHcmPath));
  const retainPaths = reset ? [] : cached.filter((path) => nextAllowed.has(path));
  const retained = new Set(retainPaths);
  const evictPaths = cached.filter((path) => !retained.has(path));
  const quarantinePendingPaths = reset
    ? sorted((input.pendingWritePaths ?? []).filter(isHcmPath)) : [];
  const blockedByPendingOrDenied = denied || quarantinePendingPaths.length > 0;
  return {
    invalidateHcmSnapshot: reset || evictPaths.length > 0,
    blockedByPendingOrDenied,
    evictPaths,
    retainPaths,
    requestPaths: blockedByPendingOrDenied ? [] :
      sorted([...nextAllowed].filter((path) => !retained.has(path))),
    quarantinePendingPaths,
  };
}

/** Filter BOTH cached and newly fetched documents before assembling HCM state. */
export function assembleAuthorizedHrShadowSnapshot(
  scope: PersistenceScope,
  documents: ReadonlyMap<string, Record<string, unknown> | null>,
): Record<string, unknown> | null {
  const permitted = allowed(scope);
  const safe = new Map<string, Record<string, unknown> | null>();
  for (const [path, value] of documents) {
    if (isHcmPath(path) && permitted.has(path)) safe.set(path, value);
  }
  return assembleState(HCM!, safe);
}

/**
 * Reject a late response from an earlier session/scope generation, including
 * a response containing paths not requested by the current authorized plan.
 * The generation must be advanced BEFORE a role/scope change begins.
 */
export function acceptHrShadowFetch(input: {
  requestEpoch: number;
  activeEpoch: number;
  requestUid: string;
  activeScope: PersistenceScope;
  requestedPaths: readonly string[];
  returnedPaths: readonly string[];
  deniedPaths?: readonly string[];
}): boolean {
  if (!Number.isSafeInteger(input.requestEpoch) || input.requestEpoch < 0 ||
    input.requestEpoch !== input.activeEpoch ||
    input.requestUid !== input.activeScope.uid ||
    (input.deniedPaths?.length ?? 0) > 0) return false;
  const permitted = allowed(input.activeScope);
  const requested = new Set(input.requestedPaths);
  return input.requestedPaths.length > 0 &&
    input.requestedPaths.every((path) => isHcmPath(path) && permitted.has(path)) &&
    input.returnedPaths.every((path) => requested.has(path) && permitted.has(path));
}
