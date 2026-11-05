/**
 * REVIEW ONLY. Builds an in-memory Firestore policy candidate from generated
 * rules. Never import this from runtime or deploy the returned rules.
 *
 * Existing legacy HCM arrays and actor-sharded audit can expose another
 * employee's data. A safe cutover also requires inventory, backfill, old-client
 * compatibility, backup/restore and explicit HR/security acceptance.
 */
export const HR_SHARED_EMPLOYEE_FIELDS_REVIEW = [
  "privateProfiles", "documents", "compensation", "compensationChanges",
  "leaveRequests", "profileChangeRequests", "dependents", "benefitEnrollments",
  "benefitEvents", "ptoLedger", "ptoAssignments", "employmentChanges",
  "workflows", "reviews", "goals", "tasks", "availability", "shiftRequests",
  "training", "acknowledgments",
] as const;

/** A manager must never read or edit a report's private HR documents. */
export const HR_MANAGER_PRIVATE_FIELDS_REVIEW = [
  "privateProfiles", "documents", "dependents", "benefitEnrollments",
  "benefitEvents", "compensation", "compensationChanges",
  "employmentChanges", "ptoLedger", "ptoAssignments",
] as const;

function firestoreFieldList(fields: readonly string[]): string {
  return "[" + fields.map((field) => "'" + field + "'").join(", ") + "]";
}

function replacePolicyBlock(
  rules: string,
  marker: string,
  readGuard: string,
  writeGuard: string,
): string {
  const start = rules.indexOf(marker);
  if (start < 0 || rules.indexOf(marker, start + marker.length) >= 0) {
    throw new Error("HR review policy requires exactly one " + marker);
  }
  const end = rules.indexOf("\n    }", start);
  if (end < 0) throw new Error("Unclosed HR policy block: " + marker);
  let block = rules.slice(start, end);
  for (const [prefix, guard] of [
    ["allow get, list: if ", readGuard],
    ["allow write: if ", writeGuard],
  ]) {
    const at = block.indexOf(prefix);
    if (at < 0 || block.indexOf(prefix, at + prefix.length) >= 0) {
      throw new Error("Missing/duplicate HR permission: " + marker + " " + prefix);
    }
    const expressionStart = at + prefix.length;
    const semicolon = block.indexOf(";", expressionStart);
    if (semicolon < 0) throw new Error("Missing HR permission terminator: " + marker);
    const original = block.slice(expressionStart, semicolon).trim();
    block = block.slice(0, expressionStart) +
      "(" + original + ") && (" + guard + ")" +
      block.slice(semicolon);
  }
  return rules.slice(0, start) + block + rules.slice(end);
}

/**
 * Characterization-only, not a production-ready replacement:
 * - private shared arrays become Administrator-only;
 * - actor-owned audit is Administrator-only (actor != record subject);
 * - managers may see ordinary per-user HR fields only for DIRECT reports;
 * - managers cannot read/write reports' private files or compensation history;
 * - employee own-document read access and normal direct-report requests remain.
 *
 * The strict source-marker checks intentionally fail if generated rules drift.
 */
export function buildHrLegacyConfidentialityShadowReview(generatedRules: string): string {
  if (generatedRules.includes("HR_LEGACY_SHADOW_REVIEW_MARKER")) {
    throw new Error("Do not apply the HR shadow policy twice");
  }
  const privateShared = firestoreFieldList(HR_SHARED_EMPLOYEE_FIELDS_REVIEW);
  const privateManager = firestoreFieldList(HR_MANAGER_PRIVATE_FIELDS_REVIEW);
  const sharedGuard = "(!(field in " + privateShared + ") || isAdmin())";
  let candidate = replacePolicyBlock(
    generatedRules,
    "match /hcm/fields/{field} {",
    sharedGuard,
    sharedGuard,
  );

  // Generated manages(uid) also grants managed-team access. For HR records
  // require the actual managerId, not just membership in a managed team.
  const directReportGuard =
    "(uid == request.auth.uid || isAdmin() || " +
    "(exists(accessPath(uid)) && get(accessPath(uid)).data.managerId == request.auth.uid))";
  const managerPrivateGuard =
    "(!(field in " + privateManager + ") || uid == request.auth.uid || isAdmin())";
  const actorAuditGuard = "(field != 'audit' || isAdmin())";
  const perUserGuard = [directReportGuard, managerPrivateGuard, actorAuditGuard].join(" && ");
  candidate = replacePolicyBlock(
    candidate,
    "match /{uid}/hcm/{field} {",
    perUserGuard,
    perUserGuard,
  );
  // Sentinel exists only inside returned candidate; generated source untouched.
  return candidate.replace(
    "match /{uid}/hcm/{field} {",
    "// HR_LEGACY_SHADOW_REVIEW_MARKER: emulator-only candidate, never deploy\n    match /{uid}/hcm/{field} {",
  );
}
