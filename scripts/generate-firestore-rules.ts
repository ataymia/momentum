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
import { USERNAME_INDEX_COLLECTION, USERNAME_REMINDER_COLLECTION } from "../lib/username";

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

function physicalFieldCondition(spec: DomainSpec, logicalFields: string[]): string {
  if (logicalFields.length === 0) return "false";
  const clauses = [`field in ${list([...logicalFields].sort())}`];
  for (const field of logicalFields) {
    const fieldSpec = spec.fields[field];
    if (!fieldSpec?.chunkBytes) continue;
    clauses.push(`field.matches('^${field}__chunk_[0-9]{6}$')`);
  }
  return clauses.length === 1 ? clauses[0] : `(${clauses.join(" || ")})`;
}

function userBlock(spec: DomainSpec): string {
  const perUser = Object.entries(spec.fields).filter(([, fieldSpec]) => fieldSpec.userIdField);
  if (perUser.length === 0) return "";
  const fields = perUser.map(([field]) => field).sort();
  const noSelfWrite = perUser.filter(([, f]) => f.selfWrite === false).map(([field]) => field).sort();
  const noManagerWrite = perUser.filter(([, f]) => f.managerWrite === false).map(([field]) => field).sort();
  const noManagerRead = perUser.filter(([, f]) => f.managerRead === false).map(([field]) => field).sort();
  const salesRepSupervise = perUser.filter(([, f]) => f.salesRepSupervise === true).map(([field]) => field).sort();
  const allowedFields = physicalFieldCondition(spec, fields);

  const managerReadable = noManagerRead.length
    ? `(!(${physicalFieldCondition(spec, noManagerRead)}) && manages(uid))`
    : "manages(uid)";
  const supervisorReadable = salesRepSupervise.length
    ? `(${physicalFieldCondition(spec, salesRepSupervise)} && supervisesBrandAmbassador(uid))`
    : "false";
  const managerWritable = noManagerWrite.length
    ? `(!(${physicalFieldCondition(spec, noManagerWrite)}) && manages(uid) && activeEmployee())`
    : "(manages(uid) && activeEmployee())";
  const supervisorWritable = salesRepSupervise.length
    ? `(${physicalFieldCondition(spec, salesRepSupervise)} && supervisesBrandAmbassador(uid) && activeEmployee())`
    : "false";

  const ownerReadable = "uid == request.auth.uid ? isEmployee()";
  const ownerWritable = noSelfWrite.length
    ? `uid == request.auth.uid ? (!(${physicalFieldCondition(spec, noSelfWrite)}) && isEmployee())`
    : "uid == request.auth.uid ? isEmployee()";

  return `    // ${spec.key}
    match /{uid}/${spec.id}/{field} {
      allow get, list: if ${allowedFields}
        && (${ownerReadable} : (isAdmin() || ${managerReadable} || ${supervisorReadable}));
      allow write: if ${allowedFields}
        && (isAdmin() || (${ownerWritable} : (${managerWritable} || ${supervisorWritable})));
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
//   userDomains/{uid}/{domainId}/{field}     per-user shard or chunk manifest\n//   userDomains/{uid}/{domainId}/{field}__chunk_000000  bounded chunk -> { items: [...] }
//
// Identity is held separately:
//
//   userAccess/{uid}          authority for role, reporting line, and account state (Administrator-written)
//   employeeDirectory/{uid}   workspace-facing profile every employee may read
//   usernames/{username}      private login-name -> identity map, denied to every client
//   usernameReminders/{uid}   forgot-username requests an Administrator resolves
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
      return hasAccessRecord()
        && role() != 'Customer'
        && access().accountState != 'Suspended'
        && access().accountState != 'Separated';
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

    /** Narrow BA supervision. This never grants a Sales Representative general manager/HR access. */
    function supervisesBrandAmbassador(uid) {
      return uid != request.auth.uid
        && isActiveRole('Sales Representative')
        && exists(accessPath(uid))
        && get(accessPath(uid)).data.role == 'Brand Ambassador'
        && get(accessPath(uid)).data.managerId == request.auth.uid;
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
      // The e-mail is written once, from the Firebase identity itself, and is never editable afterwards.
      // Production drifted exactly here: an access record was edited to an address the Auth identity did
      // not own, which silently pointed an Administrator grant at the wrong mailbox.
      //
      // The username is the login identifier and is owned by the Worker, which keeps it in step with
      // \`usernames/{username}\`. A browser that could edit it here would break that pairing.
      allow update: if isAdmin()
        && request.resource.data.email == resource.data.email
        && request.resource.data.get('username', '') == resource.data.get('username', '')
        && (
          uid != request.auth.uid
          || (
            request.resource.data.role == resource.data.role
            && request.resource.data.accountState == resource.data.accountState
          )
        );
      allow delete: if false;
    }

    // The private login-name -> identity map. Only the Worker's service account reads or writes it, and
    // service-account access bypasses these rules, so denying every client here costs nothing and means
    // a username can never be turned back into an e-mail address from a browser.
    match /${USERNAME_INDEX_COLLECTION}/{username} {
      allow read, write: if false;
    }

    // Forgot-username requests. Administrators read them to answer the employee; the Worker writes them.
    match /${USERNAME_REMINDER_COLLECTION}/{uid} {
      allow get, list: if isAdmin();
      allow update: if isAdmin();
      allow create, delete: if false;
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

    // Privileged offboarding log. Even an Administrator browser cannot write.
    match /employeeSeparations/{uid} {
      allow get, list: if isAdmin();
      allow create, update, delete: if false;
    }

    // Immutable audit proof for owner-authorized off-route deliveries.
    // Only the authenticated server function may create these records.
    match /adminDeliveryOverrides/{orderId} {
      allow get, list: if activeEmployee();
      allow create, update, delete: if false;
    }

    // Future account editor MUST read true creator identity from Admin SDK.
    // Client-writable workspace.createdByUid is never proof of creation.
    // Neither an Administrator client nor a Sales Manager can mint provenance.
    match /accountCreatorProvenance/{accountId} {
      allow get, list, create, update, delete: if false;
    }

    // Personal CRM shorthand is never stored in shared customers/accounts.
    // Neither another employee nor an Administrator can read another UID's nickname.
    match /privateAccountNicknames/{uid}/accounts/{accountId} {
      allow get, list: if isEmployee() && request.auth.uid == uid;
      allow create, update: if isEmployee() && request.auth.uid == uid
        && request.resource.data.keys().hasOnly(['accountId','nickname'])
        && request.resource.data.accountId == accountId
        && request.resource.data.nickname is string
        && request.resource.data.nickname.size() > 0
        && request.resource.data.nickname.size() <= 80;
      allow delete: if isEmployee() && request.auth.uid == uid;
    }

    // Backend-only immutable event history for account-profile edits.
    match /accountProfileEditEvents/{eventId} {
      allow get, list: if isAdmin();
      allow create, update, delete: if false;
    }

    // Server-only idempotency receipts prevent replayed account creation.
    match /accountCreationRequests/{requestId} {
      allow get, list, create, update, delete: if false;
    }

    // Review-only server notification candidates. Browsers cannot mint mail.
    match /notificationCandidates/{candidateId} {
      allow get, list: if isAdmin();
      allow create, update, delete: if false;
    }
    // Server-projected operational email failures. Administrators may read,
    // but no browser role can forge, edit, or delete them.
    match /notificationAdminEvents/{eventId} {
      allow get, list: if isAdmin();
      allow create, update, delete: if false;
    }
    match /emailOutbox/{messageId} {
      allow get, list: if isAdmin();
      allow create, update, delete: if false;
    }
    match /emailSuppressions/{recipientId} {
      allow read, write: if false;
    }

    match /salesVisitTargets/{uid}/weeks/{weekStart} {
      allow read: if isAdmin() || (activeEmployee()
        && (uid == request.auth.uid || manages(uid)));
      allow create, update: if (isAdmin() || manages(uid))
        && request.resource.data.keys().hasOnly(['userId','weekStart','target','updatedAt','updatedBy'])
        && request.resource.data.userId == uid
        && request.resource.data.weekStart == weekStart
        && request.resource.data.target is int && request.resource.data.target >= 0
        && request.resource.data.updatedBy == request.auth.uid;
      allow delete: if false;
    }
    // HR e-form receipt metadata never contains tax identifiers or document field values.
    // Only the trusted server can create/update it after verifying the signing provider.
    // Employees can query their own records using employeeUid == auth.uid; HR Administrators
    // can review across employees. Managers, Marketing and customers cannot see other people.
    match /hrSignedFormRecords/{recordId} {
      allow get, list: if isAdmin() || (isEmployee()
        && resource.data.employeeUid == request.auth.uid);
      allow create, update, delete: if false;
    }
    // Server-owned, append-only audit events; no browser impersonation or deletion.
    match /hrSignedFormAudit/{auditId} {
      allow get, list: if isAdmin();
      allow create, update, delete: if false;
    }

    function marketingEditor() {
      return isActiveRole('Administrator') || isActiveRole('Marketing');
    }
    match /marketingAssetVersions/{versionId} {
      allow read: if marketingEditor() || (isEmployee()
        && resource.data.status == 'Approved' && resource.data.deleted == false);
      allow create: if marketingEditor()
        && request.resource.data.id == versionId
        && request.resource.data.createdBy == request.auth.uid
        && request.resource.data.updatedBy == request.auth.uid
        && request.resource.data.assetId is string
        && request.resource.data.version is int && request.resource.data.version > 0
        && request.resource.data.status == 'Draft'
        && request.resource.data.deleted == false;
      allow update: if marketingEditor()
        && request.resource.data.diff(resource.data).affectedKeys()
          .hasOnly(['status','updatedAt','updatedBy','deleted'])
        && request.resource.data.status in ['Draft','Approved','Archived']
        && request.resource.data.updatedBy == request.auth.uid;
      allow delete: if false;
    }
    match /marketingProductionRequests/{requestId} {
      allow read: if marketingEditor() || (activeEmployee()
        && resource.data.requesterId == request.auth.uid);
      allow create: if activeEmployee()
        && request.resource.data.id == requestId
        && request.resource.data.updatedBy == request.auth.uid
        && request.resource.data.history == [{'at': request.resource.data.createdAt, 'actorId': request.auth.uid, 'status': 'Requested'}]
        && request.resource.data.requesterId == request.auth.uid
        && request.resource.data.status == 'Requested'
        && request.resource.data.quantity is int
        && request.resource.data.quantity > 0
        && request.resource.data.approvedVersionId == ''
        && request.resource.data.draftVersionId == ''
        && request.resource.data.ownerId == '';
      allow update: if marketingEditor()
        && request.resource.data.diff(resource.data).affectedKeys()
          .hasOnly(['ownerId','status','dueDate','draftVersionId','approvedVersionId','updatedAt','updatedBy','history'])
        && request.resource.data.history == resource.data.history.concat([{'at': request.resource.data.updatedAt, 'actorId': request.auth.uid, 'status': request.resource.data.status}])
        && request.resource.data.status in ['Requested','Assigned','Draft','Approval','Printing','Ready','Completed']
        && request.resource.data.updatedBy == request.auth.uid
        && (request.resource.data.approvedVersionId == '' ||
          (get(/databases/$(database)/documents/marketingAssetVersions/$(request.resource.data.approvedVersionId)).data.status == 'Approved'
          && get(/databases/$(database)/documents/marketingAssetVersions/$(request.resource.data.approvedVersionId)).data.deleted == false))
        && (!(request.resource.data.status in ['Printing','Ready','Completed']) || request.resource.data.approvedVersionId != '');
      allow delete: if false;
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
