import type { DomainSpec } from "./firestore-domains";
import { chunkManifestShardPaths, parseDocPath, resolveUserPhysicalField } from "./firestore-domains";
import type { FirestoreSnapshot } from "./firebase-firestore-rest";

export type ChunkHydrationReview = {
  ok: boolean;
  paths: string[];
  issue: "invalid-manifest" | "missing-or-denied-shard" | "invalid-shard" | "owner-conflict" | "item-count-mismatch" | null;
};

/**
 * Fail-closed integrity gate for a synthetic/review-mode chunk read.
 * A successful network response is NOT proof that every manifest shard exists.
 * No record payload, UID, or path is returned in an issue description.
 */
export function reviewChunkHydration(
  spec: DomainSpec,
  manifestPath: string,
  manifest: Record<string, unknown> | null,
  snapshots: readonly FirestoreSnapshot[],
): ChunkHydrationReview {
  const fail = (issue: Exclude<ChunkHydrationReview["issue"], null>): ChunkHydrationReview =>
    ({ ok: false, paths: [], issue });
  const parsed = parseDocPath(manifestPath);
  const field = parsed?.uid && parsed.domainId === spec.id
    ? resolveUserPhysicalField(spec, parsed.field) : null;
  if (!parsed?.uid || !field || field.isChunk || !field.fieldSpec.chunkBytes ||
    !manifest || manifest.shardManifestVersion !== 1 ||
    !Array.isArray(manifest.shards) || typeof manifest.itemCount !== "number" || !Number.isSafeInteger(manifest.itemCount) ||
    (manifest.itemCount as number) < 0) return fail("invalid-manifest");
  const paths = chunkManifestShardPaths(spec, manifestPath, manifest);
  if (paths.length !== manifest.shards.length ||
    (paths.length === 0 && manifest.itemCount !== 0)) return fail("invalid-manifest");
  const byPath = new Map(snapshots.map((item) => [item.path, item]));
  if (byPath.size !== snapshots.length) return fail("invalid-shard");
  let count = 0;
  for (const path of paths) {
    const snapshot = byPath.get(path);
    if (!snapshot || (snapshot as FirestoreSnapshot & { denied?: boolean }).denied || !snapshot.exists || !snapshot.data)
      return fail("missing-or-denied-shard");
    const items = snapshot.data.items;
    if (!Array.isArray(items)) return fail("invalid-shard");
    if (items.some((item) => !item || typeof item !== "object" || Array.isArray(item) ||
      (item as Record<string, unknown>)[field.fieldSpec.userIdField!] !== parsed.uid))
      return fail("owner-conflict");
    count += items.length;
  }
  if (count !== manifest.itemCount) return fail("item-count-mismatch");
  return { ok: true, paths, issue: null };
}
