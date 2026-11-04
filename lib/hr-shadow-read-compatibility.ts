import type { PersistenceScope } from "./firebase-access";
import {
  DOMAIN_SPECS, domainDocuments, parseDocPath,
  type DomainDocument,
} from "./firestore-domains";

const HCM = DOMAIN_SPECS.find((spec) => spec.id === "hcm");
if (!HCM) throw new Error("HCM storage specification missing");

/**
 * REVIEW-ONLY compatibility candidate for a future HCM shared-field lockdown.
 * This is deliberately NOT wired into persistence.ts or deployed rules.
 *
 * Current clients request shared legacy arrays even for user-owned fields.
 * The proposed shadow policy rejects those reads for non-Administrators. This
 * candidate removes only those incompatible requests, leaving owner-scoped
 * shards, shared organizational fields, and Administrator recovery reads.
 *
 * It does NOT establish that legacy records have been migrated. An empty shard
 * under this plan can mean lost self-service history, not verified absence.
 */
export function planHrShadowReadPaths(scope: PersistenceScope): {
  readable: DomainDocument[];
  incompatibleLegacyPaths: string[];
} {
  const current = domainDocuments(HCM!, scope);
  const readable: DomainDocument[] = [];
  const incompatibleLegacyPaths: string[] = [];

  for (const entry of current) {
    const parsed = parseDocPath(entry.path);
    if (!parsed || parsed.domainId !== "hcm") {
      throw new Error("Unexpected HCM document path");
    }
    const field = HCM!.fields[parsed.field];
    const sharedPrivateField = !parsed.uid && Boolean(field?.userIdField);
    // The actor shard can contain other people's before/after values.
    const actorAudit = Boolean(parsed.uid && parsed.field === "audit");
    // Defense in depth: current domainDocuments already suppresses manager
    // compensation reads, but future spec drift must not reintroduce them.
    const managerCompensation = Boolean(
      parsed.uid && parsed.uid !== scope.uid &&
      parsed.field === "compensation" && scope.role === "Sales Manager",
    );
    const incompatible = scope.role !== "Administrator" &&
      (sharedPrivateField || actorAudit || managerCompensation);
    if (incompatible) incompatibleLegacyPaths.push(entry.path);
    else readable.push(entry);
  }

  return { readable, incompatibleLegacyPaths };
}

/**
 * Cutover evidence check, not an approval or a migration executor. Every
 * user-owned field must have an explicitly inventoried shared source; unknown
 * fields, missing inventory and unreconciled records block compatibility.
 * Returns aggregate issue codes only, never employee IDs or record payloads.
 */
export function assessHrShadowCutover(
  inventory: readonly {
    field: string;
    sourceCount: number;
    sourceVerified: boolean;
    destinationReconciled: boolean;
  }[],
): { compatibleForReview: boolean; issueCodes: string[] } {
  const expected = Object.entries(HCM!.fields)
    .filter(([field, spec]) => Boolean(spec.userIdField) && field !== "audit")
    .map(([field]) => field);
  const expectedSet = new Set(expected);
  const seen = new Set<string>();
  const issues = new Set<string>();

  for (const item of inventory) {
    if (!expectedSet.has(item.field) || seen.has(item.field)) {
      issues.add("unknown-or-duplicate-field");
      continue;
    }
    seen.add(item.field);
    if (!Number.isSafeInteger(item.sourceCount) || item.sourceCount < 0) {
      issues.add("invalid-source-count");
      continue;
    }
    if (!item.sourceVerified) issues.add("source-not-verified");
    if (item.sourceCount > 0 && !item.destinationReconciled)
      issues.add("legacy-records-unreconciled");
  }
  if (seen.size !== expected.length) issues.add("inventory-incomplete");
  return { compatibleForReview: issues.size === 0, issueCodes: [...issues].sort() };
}
