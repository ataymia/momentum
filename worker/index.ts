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
  DELETE_EMPLOYEE_PATH,
  PROVISIONING_STATUS_PATH,
  PROVISION_EMPLOYEE_PATH,
  validateProvisionRequest,
  type DeleteEmployeeResponse,
  type ProvisionEmployeeResponse,
  type ProvisioningStage,
  type ProvisioningStatusResponse,
} from "../lib/provisioning-contract";
import { FirebaseAdmin } from "./firebase-admin";
import { parseServiceAccount } from "./service-account";
import { verifyFirebaseIdToken } from "./verify-id-token";

/** Cloudflare's static-asset binding. Declared locally so the project needs no Workers type package. */
type AssetsBinding = { fetch(request: Request): Promise<Response> };

export type Env = {
  ASSETS: AssetsBinding;
  FIREBASE_PROJECT_ID?: string;
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
          email, role: profile.role, team: profile.team,
          managerId: profile.managerId ?? null, managedTeams: [],
          accountState: "Password change required", updatedAt: at, updatedBy: caller.uid,
        },
      },
      {
        path: `${EMPLOYEE_DIRECTORY}/${uid}`,
        data: {
          name: profile.name, firstName: profile.firstName, email, initials: profile.initials, title: profile.title,
          role: profile.role, team: profile.team, managerId: profile.managerId ?? null, managedTeams: [], accountIds: [],
          accent: profile.accent, updatedAt: at,
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

    // Remove the identity first: while it exists the address stays taken.
    const authIdentityDeleted = await admin.deleteUser(uid);

    const paths = [`${USER_ACCESS}/${uid}`, `${EMPLOYEE_DIRECTORY}/${uid}`, ...await admin.userShardPaths(uid)];
    await admin.deleteDocuments(paths);
    await admin.stampMeta(["employeeDirectory", `userDomains_${uid}_identity_records`]);

    return json({ ok: true, uid, email, authIdentityDeleted, documentsDeleted: paths.length } satisfies DeleteEmployeeResponse, 200);
  } catch {
    return fail("service", "The account could not be fully deleted. Check Firebase Authentication before retrying.", 502);
  }
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

    if (url.pathname === PROVISION_EMPLOYEE_PATH) return handleProvision(request, admin);
    if (url.pathname === PROVISIONING_STATUS_PATH) return handleStatus(request, admin);
    if (url.pathname === DELETE_EMPLOYEE_PATH) return handleDelete(request, admin);
    return fail("request", "Unknown endpoint.", 404);
  },
};

export default handler;
