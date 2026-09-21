/**
 * Momentum edge Worker.
 *
 * Almost every request is a static asset from the Next.js export. The exception is `/api/admin/*`, the
 * privileged provisioning surface:
 *
 *   Administrator's browser  --Firebase ID token-->  Worker
 *                                                      |  verify the token against Google's JWKS
 *                                                      |  confirm userAccess/{caller} is Administrator + Active
 *                                                      |  service account: create/adopt the Auth identity
 *                                                      |  service account: write userAccess + directory + record
 *                                                      v
 *                                             { uid, outcome }
 *
 * The browser never receives the service-account key and can no longer create Firebase identities itself.
 */

import {
  PASSWORD_RESET_PATH,
  SIGN_IN_REJECTED,
  USERNAME_AVAILABILITY_PATH,
  USERNAME_BACKFILL_PATH,
  USERNAME_REMINDER_PATH,
  USERNAME_SIGN_IN_PATH,
  type AuthFailure,
  type PasswordResetResponse,
  type UsernameAvailabilityResponse,
  type UsernameBackfillResponse,
  type UsernameReminderResponse,
  type UsernameSignInResponse,
} from "../lib/auth-contract";
import {
  DELETE_EMPLOYEE_PATH,
  PROVISIONING_STATUS_PATH,
  PROVISION_EMPLOYEE_PATH,
  validateProvisionRequest,
  type DeleteEmployeeResponse,
  type ProvisionEmployeeResponse,
  type ProvisioningStage,
  type ProvisioningStatusResponse,
} from "../lib/provisioning-contract";
import { planUsernameBackfill } from "../lib/username-migration";
import {
  USERNAME_INDEX_COLLECTION,
  USERNAME_REMINDER_COLLECTION,
  generateUsername,
  maskEmail,
  normalizeUsername,
  usernameProblem,
} from "../lib/username";
import { FirebaseAdmin } from "./firebase-admin";
import { parseServiceAccount } from "./service-account";
import { verifyFirebaseIdToken } from "./verify-id-token";

/** Cloudflare's static-asset binding. Declared locally so the project needs no Workers type package. */
type AssetsBinding = { fetch(request: Request): Promise<Response> };

export type Env = {
  ASSETS: AssetsBinding;
  FIREBASE_PROJECT_ID?: string;
  /** Public by design: the same key the browser bundle carries. Needed to verify a password. */
  FIREBASE_WEB_API_KEY?: string;
  /** Worker secret. Set with `wrangler secret put FIREBASE_SERVICE_ACCOUNT`. Never committed. */
  FIREBASE_SERVICE_ACCOUNT?: string;
};

const USER_ACCESS = "userAccess";
const EMPLOYEE_DIRECTORY = "employeeDirectory";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });

const fail = (stage: ProvisioningStage, message: string, status: number) => json({ ok: false, stage, message } satisfies ProvisionEmployeeResponse, status);

/**
 * Administrators see a useful message; the raw backend error stays in the Worker. `EMAIL_EXISTS` and
 * friends are mapped explicitly because they change what the Administrator should do next.
 */
function safeAuthMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : "";
  if (raw.includes("EMAIL_EXISTS")) return "A Firebase identity already exists for that work e-mail.";
  if (raw.includes("WEAK_PASSWORD")) return "Firebase rejected the temporary password as too weak.";
  if (raw.includes("INVALID_EMAIL")) return "Firebase rejected the work e-mail address.";
  if (raw.includes("OPERATION_NOT_ALLOWED") || raw.includes("ADMIN_ONLY_OPERATION")) return "Email/password accounts are disabled for this Firebase project.";
  return "Firebase Authentication refused to create the identity.";
}

/** Resolves the caller to an active Administrator, or returns the Response explaining why not. */
async function requireAdministrator(request: Request, admin: FirebaseAdmin): Promise<{ uid: string } | Response> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return fail("authentication", "Sign in as an Administrator first.", 401);

  let caller;
  try {
    caller = await verifyFirebaseIdToken(token, admin.projectId);
  } catch {
    return fail("authentication", "Your session has expired. Sign in again.", 401);
  }

  let access;
  try {
    access = await admin.getDocument(`${USER_ACCESS}/${caller.uid}`);
  } catch {
    return fail("service", "Could not verify your access record. Try again.", 502);
  }
  // Firestore stays the authority: an Auth identity alone grants nothing, exactly as the rules require.
  if (!access || access.role !== "Administrator" || access.accountState !== "Active") {
    return fail("authorization", "Only an active Administrator can provision employee accounts.", 403);
  }
  return { uid: caller.uid };
}

async function handleProvision(request: Request, admin: FirebaseAdmin): Promise<Response> {
  const caller = await requireAdministrator(request, admin);
  if (caller instanceof Response) return caller;

  const body = await request.json().catch(() => null);
  const validated = validateProvisionRequest(body);
  if (!validated.ok) return fail("request", validated.message, 400);
  const { email, temporaryPassword, profile } = validated.value;

  // The username must be free before any identity is created, or provisioning half-succeeds and leaves
  // an Auth account whose login name belongs to somebody else.
  const claimed = await admin.getDocument(usernameIndexPath(profile.username)).catch(() => null);
  if (claimed && claimed.email !== email) return fail("request", `The username ${profile.username} is already taken. Choose another before creating this account.`, 409);

  // --- Firebase Authentication: create, or adopt an orphan from a previous partial attempt -------------
  let uid: string;
  let outcome: "created" | "recovered" | "already-provisioned";
  try {
    const existing = await admin.findUserByEmail(email);
    if (!existing) {
      uid = await admin.createUser(email, temporaryPassword);
      outcome = "created";
    } else {
      const existingAccess = await admin.getDocument(`${USER_ACCESS}/${existing.uid}`);
      if (existingAccess) {
        // Already a real Momentum account. Never silently re-point it at a different employee.
        if (existingAccess.email !== email) return fail("firebase-auth", "That work e-mail is already linked to a different Momentum account. Ask an Administrator to review it before continuing.", 409);
        return json({ ok: true, uid: existing.uid, email, outcome: "already-provisioned" } satisfies ProvisionEmployeeResponse, 200);
      }
      // Auth identity with no access record: the exact state a failed provisioning leaves behind.
      if (existing.disabled) return fail("firebase-auth", "An existing Firebase identity for that e-mail is disabled. Re-enable it in the Firebase console before provisioning.", 409);
      uid = existing.uid;
      await admin.setPassword(uid, temporaryPassword);
      outcome = "recovered";
    }
  } catch (error) {
    return fail("firebase-auth", safeAuthMessage(error), 502);
  }

  // --- Firestore: the records that actually grant access ----------------------------------------------
  const at = new Date().toISOString();
  try {
    await admin.commit([
      {
        path: `${USER_ACCESS}/${uid}`,
        data: {
          email, username: profile.username, role: profile.role, team: profile.team,
          managerId: profile.managerId ?? null, managedTeams: [],
          accountState: "Password change required", updatedAt: at, updatedBy: caller.uid,
        },
      },
      {
        // Private username -> identity mapping. Security Rules deny this collection to every client, so
        // the browser can never turn a login name back into an e-mail address.
        path: usernameIndexPath(profile.username),
        data: { uid, email, updatedAt: at, updatedBy: caller.uid },
      },
      {
        path: `${EMPLOYEE_DIRECTORY}/${uid}`,
        data: {
          name: profile.name, firstName: profile.firstName, email, initials: profile.initials, title: profile.title,
          role: profile.role, team: profile.team, managerId: profile.managerId ?? null, managedTeams: [], accountIds: [],
          accent: profile.accent, username: profile.username, phone: profile.phone ?? null, updatedAt: at,
        },
      },
      {
        // Written server-side so the onboarding queue can always recover the hire, even if the
        // Administrator's browser closes between identity creation and onboarding linkage.
        path: `userDomains/${uid}/identity/records`,
        data: {
          items: [{
            id: `access-${uid}`, userId: uid, state: "Password change required",
            source: "Direct hire", provisionedBy: caller.uid, provisionedAt: at,
          }],
        },
      },
    ]);
  } catch {
    // The identity survives on purpose: the Administrator recovers it instead of creating a duplicate.
    return json({ ok: false, stage: "firestore-access", message: "The Firebase identity was created but its Momentum access records were rejected. Reopen this hire in the provisioning queue to finish it — do not create the account again." } satisfies ProvisionEmployeeResponse, 502);
  }

  await admin.stampMeta(["employeeDirectory", `userDomains_${uid}_identity_records`]);
  return json({ ok: true, uid, email, outcome } satisfies ProvisionEmployeeResponse, 200);
}

async function handleStatus(request: Request, admin: FirebaseAdmin): Promise<Response> {
  const caller = await requireAdministrator(request, admin);
  if (caller instanceof Response) return caller;

  const body = await request.json().catch(() => null) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email.includes("@")) return fail("request", "Enter a valid work e-mail address.", 400);

  try {
    const existing = await admin.findUserByEmail(email);
    if (!existing) return json({ ok: true, email, authIdentityExists: false, accessRecordExists: false, recoverable: false } satisfies ProvisioningStatusResponse, 200);
    const access = await admin.getDocument(`${USER_ACCESS}/${existing.uid}`);
    return json({
      ok: true, email, uid: existing.uid,
      authIdentityExists: true, accessRecordExists: Boolean(access), recoverable: !access && !existing.disabled,
    } satisfies ProvisioningStatusResponse, 200);
  } catch {
    return fail("service", "Could not read the provisioning status. Try again.", 502);
  }
}

/**
 * Permanently removes an employee: the Firebase sign-in identity and every Firestore document that
 * grants or describes their access.
 *
 * Deleting the identity is what frees the work e-mail for re-use, which is the whole point — a half-
 * deleted account would leave the address taken and the hire unrecreatable. Self-deletion is refused so
 * an Administrator cannot lock the workspace out of its own administration.
 */
async function handleDelete(request: Request, admin: FirebaseAdmin): Promise<Response> {
  const caller = await requireAdministrator(request, admin);
  if (caller instanceof Response) return caller;

  const body = await request.json().catch(() => null) as { uid?: unknown } | null;
  const uid = typeof body?.uid === "string" ? body.uid.trim() : "";
  if (!uid) return fail("request", "Choose an account to delete.", 400);
  if (uid === caller.uid) return fail("request", "You cannot delete your own Administrator account.", 400);

  try {
    const access = await admin.getDocument(`${USER_ACCESS}/${uid}`);
    const directory = await admin.getDocument(`${EMPLOYEE_DIRECTORY}/${uid}`);
    const email = String(access?.email ?? directory?.email ?? "");
    const username = normalizeUsername(String(access?.username ?? directory?.username ?? ""));

    // Remove the identity first: while it exists the address stays taken.
    const authIdentityDeleted = await admin.deleteUser(uid);

    // Freeing the username matters as much as freeing the e-mail: a stale index entry would point a
    // login name at a uid that no longer exists.
    const paths = [`${USER_ACCESS}/${uid}`, `${EMPLOYEE_DIRECTORY}/${uid}`, ...(username ? [usernameIndexPath(username)] : []), ...await admin.userShardPaths(uid)];
    await admin.deleteDocuments(paths);
    await admin.stampMeta(["employeeDirectory", `userDomains_${uid}_identity_records`]);

    return json({ ok: true, uid, email, authIdentityDeleted, documentsDeleted: paths.length } satisfies DeleteEmployeeResponse, 200);
  } catch {
    return fail("service", "The account could not be fully deleted. Check Firebase Authentication before retrying.", 502);
  }
}

// --- username authentication ---------------------------------------------------------------------
//
// These endpoints are the only place the username -> e-mail mapping is readable. Security Rules deny
// `usernames/{username}` to every client, so the mapping is not reachable from a browser at all.

const authFail = (message: string, status: number, retryAfterSeconds?: number) =>
  json({ ok: false, message, retryAfterSeconds } satisfies AuthFailure, status);

const usernameIndexPath = (username: string) => `${USERNAME_INDEX_COLLECTION}/${username}`;

/** Resolves a login name to its identity, or null. Callers must answer identically when this is null. */
async function resolveUsername(admin: FirebaseAdmin, raw: unknown): Promise<{ username: string; uid: string; email: string } | null> {
  const username = normalizeUsername(typeof raw === "string" ? raw : "");
  if (!username || usernameProblem(username)) return null;
  const record = await admin.getDocument(usernameIndexPath(username)).catch(() => null);
  const uid = typeof record?.uid === "string" ? record.uid : "";
  const email = typeof record?.email === "string" ? record.email.toLowerCase() : "";
  if (!uid || !email.includes("@")) return null;
  return { username, uid, email };
}

async function handleUsernameSignIn(request: Request, admin: FirebaseAdmin, env: Env): Promise<Response> {
  const apiKey = (env.FIREBASE_WEB_API_KEY ?? "").trim();
  if (!apiKey) return authFail("Username sign-in is not configured on this deployment.", 503);

  const body = await request.json().catch(() => null) as { username?: unknown; password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  const resolved = await resolveUsername(admin, body?.username);
  // One rejection message for an unknown username and a wrong password: the endpoint must not confirm
  // that a username exists, or it becomes an account-enumeration oracle.
  if (!resolved || !password) return authFail(SIGN_IN_REJECTED, 401);

  let signIn;
  try {
    signIn = await admin.signInWithPassword(apiKey, resolved.email, password);
  } catch (error) {
    const raw = error instanceof Error ? error.message : "";
    if (raw.includes("TOO_MANY_ATTEMPTS_TRY_LATER")) return authFail("Too many sign-in attempts. Wait a few minutes and try again.", 429, 300);
    if (raw.includes("USER_DISABLED")) return authFail("This Momentum account is disabled. Contact an Administrator.", 403);
    return authFail("Sign-in is temporarily unavailable. Try again.", 502);
  }
  if (!signIn || signIn.uid !== resolved.uid) return authFail(SIGN_IN_REJECTED, 401);

  return json({
    ok: true, uid: signIn.uid, idToken: signIn.idToken, refreshToken: signIn.refreshToken,
    expiresIn: signIn.expiresIn, email: signIn.email,
  } satisfies UsernameSignInResponse, 200);
}

async function handlePasswordReset(request: Request, admin: FirebaseAdmin, env: Env): Promise<Response> {
  const apiKey = (env.FIREBASE_WEB_API_KEY ?? "").trim();
  if (!apiKey) return authFail("Password recovery is not configured on this deployment.", 503);

  const body = await request.json().catch(() => null) as { username?: unknown } | null;
  const resolved = await resolveUsername(admin, body?.username);
  // Unknown usernames still return ok so the caller cannot tell the two cases apart from the status code.
  if (!resolved) return json({ ok: true } satisfies PasswordResetResponse, 200);

  await admin.sendPasswordReset(apiKey, resolved.email);
  // Masked, never the address itself: knowing a username must not reveal the mailbox behind it.
  return json({ ok: true, maskedEmail: maskEmail(resolved.email) } satisfies PasswordResetResponse, 200);
}

/**
 * Forgot username.
 *
 * Momentum has no outbound mail service of its own, and Firebase cannot send a custom message, so a match
 * records an Administrator task instead of replying with the name. The response is identical either way,
 * so this cannot be used to test whether an address belongs to an employee.
 */
async function handleUsernameReminder(request: Request, admin: FirebaseAdmin): Promise<Response> {
  const body = await request.json().catch(() => null) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const acknowledged = json({ ok: true } satisfies UsernameReminderResponse, 200);
  if (!email.includes("@")) return acknowledged;

  const identity = await admin.findUserByEmail(email).catch(() => null);
  if (!identity) return acknowledged;
  const access = await admin.getDocument(`${USER_ACCESS}/${identity.uid}`).catch(() => null);
  if (!access) return acknowledged;

  const at = new Date().toISOString();
  await admin.commit([{
    path: `${USERNAME_REMINDER_COLLECTION}/${identity.uid}`,
    data: { uid: identity.uid, email, username: String(access.username ?? ""), requestedAt: at, resolved: false },
  }]).catch(() => undefined);
  return acknowledged;
}

async function handleUsernameAvailability(request: Request, admin: FirebaseAdmin): Promise<Response> {
  const caller = await requireAdministrator(request, admin);
  if (caller instanceof Response) return caller;

  const body = await request.json().catch(() => null) as { username?: unknown; uid?: unknown } | null;
  const username = normalizeUsername(typeof body?.username === "string" ? body.username : "");
  const forUid = typeof body?.uid === "string" ? body.uid : "";
  const problem = usernameProblem(username);
  if (problem) return authFail(problem, 400);

  const existing = await admin.getDocument(usernameIndexPath(username)).catch(() => null);
  const ownedByTarget = Boolean(forUid && existing && existing.uid === forUid);
  if (!existing || ownedByTarget) return json({ ok: true, username, available: true } satisfies UsernameAvailabilityResponse, 200);

  const taken = new Set((await admin.listDocuments(USERNAME_INDEX_COLLECTION).catch(() => [])).map((item) => item.id));
  return json({ ok: true, username, available: false, suggestion: generateUsername(username[0], username.slice(1), taken) || undefined } satisfies UsernameAvailabilityResponse, 200);
}

/**
 * One-time migration: give every existing identity a username.
 *
 * Runs as a dry run by default so an Administrator can review the generated names before anything is
 * written. Identities that already have a username are reported and left alone.
 */
async function handleUsernameBackfill(request: Request, admin: FirebaseAdmin): Promise<Response> {
  const caller = await requireAdministrator(request, admin);
  if (caller instanceof Response) return caller;

  const body = await request.json().catch(() => null) as { apply?: unknown } | null;
  const apply = body?.apply === true;

  let accessRecords: Array<{ id: string; data: Record<string, unknown> }>;
  let directory: Array<{ id: string; data: Record<string, unknown> }>;
  let index: Array<{ id: string; data: Record<string, unknown> }>;
  try {
    accessRecords = await admin.listDocuments(USER_ACCESS);
    directory = await admin.listDocuments(EMPLOYEE_DIRECTORY);
    index = await admin.listDocuments(USERNAME_INDEX_COLLECTION);
  } catch {
    return authFail("Could not read the existing identities. Try again.", 502);
  }

  const plan = planUsernameBackfill({
    accessRecords, directory, index, apply,
    actorId: caller.uid, at: new Date().toISOString(),
    userAccessCollection: USER_ACCESS, employeeDirectoryCollection: EMPLOYEE_DIRECTORY,
  });

  if (apply && plan.writes.length) {
    try {
      for (let start = 0; start < plan.writes.length; start += 200) await admin.commit(plan.writes.slice(start, start + 200));
    } catch {
      return authFail("Some usernames could not be written. Re-run the migration; it skips identities that already have one.", 502);
    }
    await admin.stampMeta([EMPLOYEE_DIRECTORY]);
  }

  return json({ ok: true, applied: apply, entries: plan.entries } satisfies UsernameBackfillResponse, 200);
}

const handler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    if (request.method !== "POST") return fail("request", "This endpoint only accepts POST.", 405);
    // Same-origin only. The app is served from this Worker, so a cross-site page has no business here.
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).host !== url.host) return fail("request", "Cross-origin provisioning requests are refused.", 403);

    let admin: FirebaseAdmin;
    try {
      const account = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT);
      admin = await FirebaseAdmin.create(account, env.FIREBASE_PROJECT_ID || account.project_id);
    } catch {
      return fail("service", "Employee provisioning is not configured on this deployment. Set the FIREBASE_SERVICE_ACCOUNT Worker secret.", 503);
    }

    if (url.pathname === USERNAME_SIGN_IN_PATH) return handleUsernameSignIn(request, admin, env);
    if (url.pathname === PASSWORD_RESET_PATH) return handlePasswordReset(request, admin, env);
    if (url.pathname === USERNAME_REMINDER_PATH) return handleUsernameReminder(request, admin);
    if (url.pathname === USERNAME_AVAILABILITY_PATH) return handleUsernameAvailability(request, admin);
    if (url.pathname === USERNAME_BACKFILL_PATH) return handleUsernameBackfill(request, admin);
    if (url.pathname === PROVISION_EMPLOYEE_PATH) return handleProvision(request, admin);
    if (url.pathname === PROVISIONING_STATUS_PATH) return handleStatus(request, admin);
    if (url.pathname === DELETE_EMPLOYEE_PATH) return handleDelete(request, admin);
    return fail("request", "Unknown endpoint.", 404);
  },
};

export default handler;
