/**
 * Generates `firestore.rules` from `lib/firestore-domains.ts`.
 *
 * The client decides which documents to fetch and write from `DOMAIN_SPECS`; Security Rules must reach the
 * same verdict or the app silently parks writes as "denied". Generating the rules from the same table removes
 * the possibility of drift. Re-run `npm run rules:build` after editing the domain table.
 *
 *   npx tsx scripts/generate-firestore-rules.ts
 */

import { writeFileSync } from "node:fs";
import { DOMAIN_SPECS, ROOT_FIELD, type DomainSpec, type RoleRule } from "../lib/firestore-domains";

/**
 * The two founding Administrator bootstrap identities for Momentum Distribution Inc. Momentum has no
 * public signup: the account must already exist in Firebase Authentication AND have a verified e-mail.
 * Once real Administrators exist, trim this list — it is the only path that bypasses Administrator
 * provisioning, so every entry is a standing privilege-escalation route.
 */
const BOOTSTRAP_ADMIN_EMAILS = [
  "vixarynholdings@gmail.com",
  "momentumdistributioninc@gmail.com",
];

const list = (values: readonly string[]) => `[${values.map((value) => `'${value}'`).join(", ")}]`;

/** Translate a `RoleRule` from the domain table into a rules-language boolean expression. */
function ruleExpression(rule: RoleRule): string {
  if (rule === "hasAccess") return "hasAccess()";
  if (rule === "activeEmployee") return "activeEmployee()";
  if (rule.length === 1) return `isActiveRole('${rule[0]}')`;
  return `activeEmployee() && role() in ${list(rule)}`;
}

/** Collapse a per-field override table into `field in [...] ? A : B` chains, deduplicating identical rules. */
function fieldSwitch(spec: DomainSpec, pick: "read" | "write"): string {
  const base = ruleExpression(spec[pick]);
  const byExpression = new Map<string, string[]>();
  for (const [field, fieldSpec] of Object.entries(spec.fields)) {
    const override = fieldSpec[pick];
    if (!override) continue;
    const expression = ruleExpression(override);
    if (expression === base) continue;
    byExpression.set(expression, [...(byExpression.get(expression) ?? []), field]);
  }
  let output = `(${base})`;
  for (const [expression, fields] of [...byExpression].reverse()) {
    output = `field in ${list(fields.sort())} ? (${expression}) : ${output}`;
  }
  return output;
}

function sharedBlock(spec: DomainSpec): string {
  const fields = [ROOT_FIELD, ...Object.keys(spec.fields)].sort();
  return `    // ${spec.key}
    match /${spec.id}/fields/{field} {
      allow get, list: if field in ${list(fields)} && (${fieldSwitch(spec, "read")});
      allow write: if field in ${list(fields)} && (${fieldSwitch(spec, "write")});
    }`;
}

function userBlock(spec: DomainSpec): string {
  const perUser = Object.entries(spec.fields).filter(([, fieldSpec]) => fieldSpec.userIdField);
  if (perUser.length === 0) return "";
  const fields = perUser.map(([field]) => field).sort();
  const noSelfWrite = perUser.filter(([, f]) => f.selfWrite === false).map(([field]) => field).sort();
  const noManagerWrite = perUser.filter(([, f]) => f.managerWrite === false).map(([field]) => field).sort();
  const noManagerRead = perUser.filter(([, f]) => f.managerRead === false).map(([field]) => field).sort();

  // Mirrors domainDocuments(): a user shard is readable by its owner regardless of the domain's shared
  // read rule, by any Administrator, and by a manager unless the field opts out of manager visibility.
  const readable = [
    "uid == request.auth.uid ? hasAccessRecord()",
    "isAdmin()",
    noManagerRead.length
      ? `(!(field in ${list(noManagerRead)}) && manages(uid))`
      : "manages(uid)",
  ];
  // Mirrors userShardWritable(): Administrator is checked *before* the owner, so an Administrator may
  // write shards that even their owner may not (compensation, PTO ledger, payroll disbursements).
  const writable = [
    noSelfWrite.length
      ? `uid == request.auth.uid ? (!(field in ${list(noSelfWrite)}) && isEmployee())`
      : "uid == request.auth.uid ? isEmployee()",
    noManagerWrite.length
      ? `(!(field in ${list(noManagerWrite)}) && manages(uid) && activeEmployee())`
      : "(manages(uid) && activeEmployee())",
  ];

  return `    // ${spec.key}
    match /{uid}/${spec.id}/{field} {
      allow get, list: if field in ${list(fields)}
        && (${readable[0]} : (${readable[1]} || ${readable[2]}));
      allow write: if field in ${list(fields)}
        && (isAdmin() || (${writable[0]} : ${writable[1]}));
    }`;
}

const header = `rules_version = '2';

// ---------------------------------------------------------------------------
// GENERATED FILE — DO NOT EDIT BY HAND.
// Source of truth: lib/firestore-domains.ts + lib/firebase-access.ts
// Regenerate with: npm run rules:build
//
// Momentum stores each engine's state as one JSON document per storage key. In production that document is
// sharded so these rules can gate it by role and by owner:
//
//   domains/{domainId}/fields/{field}        shared array field  -> { items: [...] }
//   domains/{domainId}/fields/_root          non-array remainder -> { data: {...} }
//   userDomains/{uid}/{domainId}/{field}     per-user shard      -> { items: [...] }
//
// Identity is held separately:
//
//   userAccess/{uid}          authority for role, reporting line, and account state (Administrator-written)
//   employeeDirectory/{uid}   workspace-facing profile every employee may read
//   platform/bootstrap        one-time marker for the first Administrator claim
//   platform/meta             monotonic per-document version stamps used for change polling
// ---------------------------------------------------------------------------

service cloud.firestore {
  match /databases/{database}/documents {

    // --- identity helpers ---------------------------------------------------

    function signedIn() {
      return request.auth != null;
    }

    function accessPath(uid) {
      return /databases/$(database)/documents/userAccess/$(uid);
    }

    function hasAccessRecord() {
      return signedIn() && exists(accessPath(request.auth.uid));
    }

    function access() {
      return get(accessPath(request.auth.uid)).data;
    }

    function role() {
      return access().role;
    }

    /** Any provisioned employee, including one still onboarding. Mirrors roleAllows(\`hasAccess\`). */
    function isEmployee() {
      return hasAccessRecord() && role() != 'Customer';
    }
    function hasAccess() {
      return isEmployee();
    }

    /** Mirrors roleAllows(\`activeEmployee\`). */
    function activeEmployee() {
      return isEmployee() && access().accountState == 'Active';
    }

    function isActiveRole(wanted) {
      return activeEmployee() && role() == wanted;
    }

    function isAdmin() {
      return isActiveRole('Administrator');
    }

    /** Mirrors buildPersistenceScope(): a Sales Manager supervises direct reports and their managed teams. */
    function manages(uid) {
      return uid != request.auth.uid
        && isActiveRole('Sales Manager')
        && exists(accessPath(uid))
        && get(accessPath(uid)).data.role != 'Customer'
        && (
          get(accessPath(uid)).data.managerId == request.auth.uid
          || (
            access().managedTeams is list
            && get(accessPath(uid)).data.team in access().managedTeams
          )
        );
    }

    // --- first-Administrator bootstrap --------------------------------------
    //
    // The only path that does not require an existing Administrator. It requires a verified e-mail on the
    // allow-list below. Trim this list once real Administrators exist.

    function bootstrapEmails() {
      return ${list(BOOTSTRAP_ADMIN_EMAILS)};
    }

    function bootstrapClaimant() {
      return signedIn()
        && request.auth.token.email_verified == true
        && request.auth.token.email.lower() in bootstrapEmails();
    }

    /** The claimant may only mint an active Administrator record for themselves. */
    function bootstrapSelfAccess(uid) {
      return bootstrapClaimant()
        && uid == request.auth.uid
        && request.resource.data.role == 'Administrator'
        && request.resource.data.accountState == 'Active'
        && request.resource.data.email.lower() == request.auth.token.email.lower();
    }

    // --- identity documents -------------------------------------------------

    match /userAccess/{uid} {
      allow get: if signedIn() && (uid == request.auth.uid || isAdmin() || manages(uid));
      allow list: if isAdmin();
      // An Administrator may never change their own role or account state; that requires a second Administrator.
      allow create: if bootstrapSelfAccess(uid)
        || (isAdmin() && uid != request.auth.uid);
      allow update: if isAdmin()
        && (
          uid != request.auth.uid
          || (
            request.resource.data.role == resource.data.role
            && request.resource.data.accountState == resource.data.accountState
          )
        );
      allow delete: if false;
    }

    match /employeeDirectory/{uid} {
      allow get, list: if isEmployee();
      allow create, update: if isAdmin()
        || (bootstrapClaimant() && uid == request.auth.uid);
      allow delete: if false;
    }

    match /platform/bootstrap {
      allow get: if signedIn();
      allow write: if bootstrapClaimant();
    }

    match /platform/meta {
      // Every employee stamps a version here after a successful write so other sessions can poll for changes.
      allow get: if signedIn();
      allow write: if isEmployee() || bootstrapClaimant();
    }

    // --- engine state: shared shards ----------------------------------------

    match /domains {
`;

const footer = `    }

    // Anything not matched above is denied.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
`;

const shared = DOMAIN_SPECS.map(sharedBlock).join("\n\n");
const perUser = DOMAIN_SPECS.map(userBlock).filter(Boolean).join("\n\n");

const rules = `${header}${shared}
    }

    // --- engine state: per-user shards --------------------------------------

    match /userDomains {

${perUser}
${footer}`;

writeFileSync("firestore.rules", rules);
console.log(`firestore.rules written: ${DOMAIN_SPECS.length} domains, ${rules.split("\n").length} lines`);
