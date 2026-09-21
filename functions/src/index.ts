import {onRequest} from "firebase-functions/v2/https";
import {setGlobalOptions} from "firebase-functions";
import {defineString} from "firebase-functions/params";
import {initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";

initializeApp();
setGlobalOptions({maxInstances: 10});

const db = getFirestore();
const firebaseWebApiKey = defineString("MOMENTUM_FIREBASE_WEB_API_KEY");

/**
 * Normalize a Momentum username to its canonical lookup form.
 * @param {unknown} value Raw username input.
 * @return {string} Normalized username.
 */
function normalizeUsername(value: unknown): string {
  return typeof value === "string" ?
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 32) :
    "";
}

/**
 * Send a no-cache JSON response.
 * @param {object} response HTTP response object.
 * @param {number} status HTTP status code.
 * @param {*} body JSON response payload.
 */
function json(
  response: {
    status: (code: number) => {
      set: (headers: Record<string, string>) => {
        json: (body: unknown) => unknown;
      };
    };
  },
  status: number,
  body: unknown,
) {
  response.status(status).set({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  }).json(body);
}

export const usernameSignIn = onRequest(
  {
    cors: true,
    region: "us-central1",
  },
  async (request, response) => {
    if (request.method !== "POST") {
      json(response, 405, {ok: false, message: "Method not allowed."});
      return;
    }

    const username = normalizeUsername(request.body?.username);
    const password =
      typeof request.body?.password === "string" ? request.body.password : "";

    if (!username || !password) {
      json(response, 401, {
        ok: false,
        message: "Incorrect username or password.",
      });
      return;
    }

    const apiKey = firebaseWebApiKey.value().trim();

    if (!apiKey) {
      json(response, 503, {
        ok: false,
        message: "Username sign-in is not configured.",
      });
      return;
    }

    try {
      const usernameRecord = await db
        .collection("usernames")
        .doc(username)
        .get();

      if (!usernameRecord.exists) {
        json(response, 401, {
          ok: false,
          message: "Incorrect username or password.",
        });
        return;
      }

      const data = usernameRecord.data();
      const email =
        typeof data?.email === "string" ? data.email.trim().toLowerCase() : "";
      const expectedUid =
        typeof data?.uid === "string" ? data.uid.trim() : "";

      if (!email || !expectedUid) {
        json(response, 401, {
          ok: false,
          message: "Incorrect username or password.",
        });
        return;
      }

      const firebaseResponse = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            email,
            password,
            returnSecureToken: true,
          }),
        },
      );

      const payload = await firebaseResponse.json() as {
        localId?: string;
        email?: string;
        idToken?: string;
        refreshToken?: string;
        expiresIn?: string;
        error?: {message?: string};
      };

      if (
        !firebaseResponse.ok ||
        !payload.localId ||
        payload.localId !== expectedUid ||
        !payload.idToken ||
        !payload.refreshToken
      ) {
        json(response, 401, {
          ok: false,
          message: "Incorrect username or password.",
        });
        return;
      }

      json(response, 200, {
        ok: true,
        uid: payload.localId,
        email: payload.email ?? email,
        idToken: payload.idToken,
        refreshToken: payload.refreshToken,
        expiresIn: payload.expiresIn ?? "3600",
      });
    } catch (error) {
      console.error("usernameSignIn failed", error);

      json(response, 500, {
        ok: false,
        message: "Sign-in is temporarily unavailable.",
      });
    }
  },
);

/**
 * Mask an e-mail address before returning it to a signed-out caller.
 * @param {string} email E-mail address to mask.
 * @return {string} Masked e-mail address.
 */
function maskEmail(email: string): string {
  const value = email.trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at < 1) {
    return "***";
  }

  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  const maskedDomain =
    dot > 0 ? `${domain[0]}***${domain.slice(dot)}` : "***";

  return `${local[0]}***@${maskedDomain}`;
}

export const usernamePasswordReset = onRequest(
  {
    cors: true,
    region: "us-central1",
  },
  async (request, response) => {
    if (request.method !== "POST") {
      json(response, 405, {ok: false, message: "Method not allowed."});
      return;
    }

    const username = normalizeUsername(request.body?.username);

    if (!username) {
      json(response, 200, {ok: true});
      return;
    }

    const apiKey = firebaseWebApiKey.value().trim();

    if (!apiKey) {
      json(response, 503, {
        ok: false,
        message: "Password recovery is not configured.",
      });
      return;
    }

    try {
      const usernameRecord = await db
        .collection("usernames")
        .doc(username)
        .get();

      if (!usernameRecord.exists) {
        json(response, 200, {ok: true});
        return;
      }

      const data = usernameRecord.data();
      const email =
        typeof data?.email === "string" ?
          data.email.trim().toLowerCase() :
          "";

      if (!email) {
        json(response, 200, {ok: true});
        return;
      }

      const resetResponse = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            requestType: "PASSWORD_RESET",
            email,
          }),
        },
      );

      if (!resetResponse.ok) {
        console.error(
          "usernamePasswordReset upstream failure",
          resetResponse.status,
        );

        json(response, 502, {
          ok: false,
          message: "Password recovery is temporarily unavailable.",
        });
        return;
      }

      json(response, 200, {
        ok: true,
        maskedEmail: maskEmail(email),
      });
    } catch (error) {
      console.error("usernamePasswordReset failed", error);

      json(response, 500, {
        ok: false,
        message: "Password recovery is temporarily unavailable.",
      });
    }
  },
);

export const usernameReminder = onRequest(
  {
    cors: true,
    region: "us-central1",
  },
  async (request, response) => {
    if (request.method !== "POST") {
      json(response, 405, {ok: false, message: "Method not allowed."});
      return;
    }

    const email =
      typeof request.body?.email === "string" ?
        request.body.email.trim().toLowerCase() :
        "";

    if (!email || !email.includes("@")) {
      json(response, 200, {ok: true});
      return;
    }

    try {
      const accessQuery = await db
        .collection("userAccess")
        .where("email", "==", email)
        .limit(1)
        .get();

      if (!accessQuery.empty) {
        const accessDocument = accessQuery.docs[0];
        const data = accessDocument.data();
        const username =
          typeof data.username === "string" ? data.username : "";

        await db
          .collection("usernameReminders")
          .doc(accessDocument.id)
          .set(
            {
              uid: accessDocument.id,
              email,
              username,
              requestedAt: new Date().toISOString(),
              resolved: false,
            },
            {merge: true},
          );
      }

      json(response, 200, {ok: true});
    } catch (error) {
      console.error("usernameReminder failed", error);

      json(response, 500, {
        ok: false,
        message: "Account recovery is temporarily unavailable.",
      });
    }
  },
);


// === MOMENTUM EMPLOYEE PROVISIONING ===

const USER_ACCESS = "userAccess";
const EMPLOYEE_DIRECTORY = "employeeDirectory";

const PROVISIONABLE_TEAMS: Record<string, string> = {
  "Sales Manager": "Sales",
  "Sales Representative": "Sales",
  "Brand Ambassador": "Sales",
  "Operations": "Operations",
  "Warehouse": "Operations",
};

type ProvisioningStage =
  "authentication" |
  "authorization" |
  "request" |
  "firebase-auth" |
  "firestore-access" |
  "service";

type ProvisionProfile = {
  name: string;
  firstName: string;
  initials: string;
  title: string;
  role: string;
  team: string;
  managerId?: string;
  accent: string;
  username: string;
  phone?: string;
};

type ProvisionRequest = {
  email: string;
  temporaryPassword: string;
  profile: ProvisionProfile;
};

const textValue = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const usernameProblem = (value: string): string | null => {
  const normalized = normalizeUsername(value);

  if (!normalized) {
    return "Enter a username.";
  }

  if (normalized.length < 2) {
    return "Usernames must be at least 2 characters.";
  }

  if (!/^[a-z][a-z0-9]{1,31}$/.test(normalized)) {
    return "Usernames must start with a letter and contain only " +
      "letters and numbers.";
  }

  if (normalized !== value.trim().toLowerCase()) {
    return "Usernames are lowercase letters and numbers only.";
  }

  return null;
};

const temporaryPasswordProblem = (password: string): string | null => {
  if (password.length < 10) {
    return "Temporary password must be at least 10 characters.";
  }

  if (
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/\d/.test(password)
  ) {
    return "Temporary password needs upper-case, lower-case, and a digit.";
  }

  return null;
};

const provisioningFailure = (
  response: Parameters<typeof json>[0],
  stage: ProvisioningStage,
  message: string,
  status: number,
) => {
  json(response, status, {
    ok: false,
    stage,
    message,
  });
};

const validateProvisionRequest = (
  input: unknown,
): {ok: true; value: ProvisionRequest} |
   {ok: false; message: string} => {
  if (!input || typeof input !== "object") {
    return {ok: false, message: "Malformed provisioning request."};
  }

  const raw = input as Record<string, unknown>;
  const email = textValue(raw.email).toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {ok: false, message: "Enter a valid work e-mail address."};
  }

  const temporaryPassword =
    typeof raw.temporaryPassword === "string" ?
      raw.temporaryPassword :
      "";

  const passwordIssue = temporaryPasswordProblem(temporaryPassword);
  if (passwordIssue) {
    return {ok: false, message: passwordIssue};
  }

  if (!raw.profile || typeof raw.profile !== "object") {
    return {ok: false, message: "The employee profile is missing."};
  }

  const profile = raw.profile as Record<string, unknown>;
  const name = textValue(profile.name);

  if (name.length < 2) {
    return {ok: false, message: "Enter the employee's legal name."};
  }

  const role = textValue(profile.role);
  const team = textValue(profile.team);

  if (
    !Object.prototype.hasOwnProperty.call(PROVISIONABLE_TEAMS, role)
  ) {
    return {
      ok: false,
      message:
        "That role cannot be provisioned here. Administrator access " +
          "is granted separately.",
    };
  }

  if (team !== PROVISIONABLE_TEAMS[role]) {
    return {
      ok: false,
      message: `A ${role} must be on the ${PROVISIONABLE_TEAMS[role]} team.`,
    };
  }

  const usernameRaw = textValue(profile.username);
  const usernameIssue = usernameProblem(usernameRaw);

  if (usernameIssue) {
    return {ok: false, message: usernameIssue};
  }

  const username = normalizeUsername(usernameRaw);
  const parts = name.split(/\s+/).filter(Boolean);
  const firstName = textValue(profile.firstName) || parts[0] || name;

  const initials =
    (
      textValue(profile.initials) ||
      (
        parts.length > 1 ?
          `${parts[0][0]}${parts[parts.length - 1]?.[0] ?? ""}` :
          name.slice(0, 2)
      )
    ).toUpperCase();

  const title = textValue(profile.title) || role;
  const managerId = textValue(profile.managerId) || undefined;
  const phone = textValue(profile.phone) || undefined;

  const rawAccent = textValue(profile.accent);
  const accent =
    /^#[0-9a-fA-F]{6}$/.test(rawAccent) ? rawAccent : "#53657d";

  return {
    ok: true,
    value: {
      email,
      temporaryPassword,
      profile: {
        name,
        firstName,
        initials,
        title,
        role,
        team,
        managerId,
        accent,
        username,
        phone,
      },
    },
  };
};

type AuthorizationRequest = {
  headers: {
    authorization?: string;
  };
};

const requireAdministrator = async (
  request: AuthorizationRequest,
): Promise<{uid: string} | {
  stage: ProvisioningStage;
  message: string;
  status: number;
}> => {
  const authorization = request.headers.authorization ?? "";
  const token =
    authorization.startsWith("Bearer ") ?
      authorization.slice("Bearer ".length).trim() :
      "";

  if (!token) {
    return {
      stage: "authentication",
      message: "Sign in as an Administrator first.",
      status: 401,
    };
  }

  let uid = "";

  try {
    const decoded = await getAuth().verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return {
      stage: "authentication",
      message: "Your session has expired. Sign in again.",
      status: 401,
    };
  }

  try {
    const access = await db.collection(USER_ACCESS).doc(uid).get();
    const data = access.data();

    if (
      !access.exists ||
      data?.role !== "Administrator" ||
      data?.accountState !== "Active"
    ) {
      return {
        stage: "authorization",
        message:
          "Only an active Administrator can provision employee accounts.",
        status: 403,
      };
    }
  } catch {
    return {
      stage: "service",
      message: "Could not verify your access record. Try again.",
      status: 502,
    };
  }

  return {uid};
};

const stampMeta = async (keys: string[]) => {
  const stamp =
    `${new Date().toISOString()}#${crypto.randomUUID().slice(0, 6)}`;

  const versions = Object.fromEntries(keys.map((key) => [key, stamp]));

  await db
    .collection("platform")
    .doc("meta")
    .set(
      {versions},
      {
        mergeFields: keys.map(
          (key) => `versions.${key}`,
        ),
      },
    )
    .catch(() => undefined);
};

export const provisionEmployee = onRequest(
  {
    cors: true,
    region: "us-central1",
  },
  async (request, response) => {
    if (request.method !== "POST") {
      provisioningFailure(
        response,
        "request",
        "This endpoint only accepts POST.",
        405,
      );
      return;
    }

    const caller = await requireAdministrator(request);

    if ("stage" in caller) {
      provisioningFailure(
        response,
        caller.stage,
        caller.message,
        caller.status,
      );
      return;
    }

    const validated = validateProvisionRequest(request.body);

    if (!validated.ok) {
      provisioningFailure(
        response,
        "request",
        validated.message,
        400,
      );
      return;
    }

    const {email, temporaryPassword, profile} = validated.value;
    const usernameRef = db.collection("usernames").doc(profile.username);

    try {
      const usernameRecord = await usernameRef.get();

      if (
        usernameRecord.exists &&
        usernameRecord.data()?.email !== email
      ) {
        provisioningFailure(
          response,
          "request",
          `The username ${profile.username} is already taken.`,
          409,
        );
        return;
      }
    } catch {
      provisioningFailure(
        response,
        "service",
        "Could not verify username availability. Try again.",
        502,
      );
      return;
    }

    let uid = "";
    let outcome:
      "created" |
      "recovered" |
      "already-provisioned" = "created";

    try {
      let existing = null;

      try {
        existing = await getAuth().getUserByEmail(email);
      } catch (error) {
        const code =
          typeof error === "object" &&
          error !== null &&
          "code" in error ?
            String(error.code) :
            "";

        if (code !== "auth/user-not-found") {
          throw error;
        }
      }

      if (!existing) {
        const created = await getAuth().createUser({
          email,
          password: temporaryPassword,
          emailVerified: false,
          disabled: false,
        });

        uid = created.uid;
        outcome = "created";
      } else {
        uid = existing.uid;

        const access = await db
          .collection(USER_ACCESS)
          .doc(uid)
          .get();

        if (access.exists) {
          const accessData = access.data() ?? {};
          const currentUsername =
            normalizeUsername(accessData.username);

          if (
            textValue(accessData.email).toLowerCase() !== email
          ) {
            provisioningFailure(
              response,
              "firebase-auth",
              "That work e-mail is already linked to a different " +
              "Momentum account.",
              409,
            );
            return;
          }

          if (
            currentUsername &&
            currentUsername !== profile.username
          ) {
            provisioningFailure(
              response,
              "request",
              `That account already uses the username ${currentUsername}.`,
              409,
            );
            return;
          }

          if (currentUsername === profile.username) {
            json(response, 200, {
              ok: true,
              uid,
              email,
              outcome: "already-provisioned",
            });
            return;
          }
        }

        if (existing.disabled) {
          provisioningFailure(
            response,
            "firebase-auth",
            "An existing Firebase identity for that e-mail is disabled.",
            409,
          );
          return;
        }

        await getAuth().updateUser(uid, {
          password: temporaryPassword,
        });

        outcome = "recovered";
      }
    } catch (error) {
      console.error("provisionEmployee auth failed", error);

      provisioningFailure(
        response,
        "firebase-auth",
        "Firebase Authentication could not create or recover the " +
          "employee identity.",
        502,
      );
      return;
    }

    const at = new Date().toISOString();

    const usernameCollisionMarker =
      "MOMENTUM_USERNAME_INDEX_COLLISION";

    try {
      await db.runTransaction(async (transaction) => {
        const usernameRecord =
          await transaction.get(usernameRef);

        if (usernameRecord.exists) {
          const indexedUid =
            textValue(usernameRecord.data()?.uid);

          if (indexedUid !== uid) {
            throw new Error(usernameCollisionMarker);
          }
        }

        transaction.set(
          db.collection(USER_ACCESS).doc(uid),
          {
            email,
            username: profile.username,
            role: profile.role,
            team: profile.team,
            managerId: profile.managerId ?? null,
            managedTeams: [],
            accountState: "Password change required",
            updatedAt: at,
            updatedBy: caller.uid,
          },
        );

        transaction.set(
          db.collection(EMPLOYEE_DIRECTORY).doc(uid),
          {
            name: profile.name,
            firstName: profile.firstName,
            email,
            username: profile.username,
            initials: profile.initials,
            title: profile.title,
            role: profile.role,
            team: profile.team,
            managerId: profile.managerId ?? null,
            managedTeams: [],
            accountIds: [],
            phone: profile.phone ?? null,
            accent: profile.accent,
            updatedAt: at,
          },
        );

        transaction.set(
          db
            .collection("userDomains")
            .doc(uid)
            .collection("identity")
            .doc("records"),
          {
            items: [{
              id: `access-${uid}`,
              userId: uid,
              state: "Password change required",
              source: "Direct hire",
              provisionedBy: caller.uid,
              provisionedAt: at,
            }],
          },
        );

        transaction.set(
          usernameRef,
          {
            uid,
            email,
            updatedAt: at,
            updatedBy: caller.uid,
          },
        );
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === usernameCollisionMarker
      ) {
        provisioningFailure(
          response,
          "request",
          `The username ${profile.username} is already taken.`,
          409,
        );
        return;
      }

      console.error("provisionEmployee firestore failed", error);

      provisioningFailure(
        response,
        "firestore-access",
        "The Firebase identity was created but its Momentum access " +
          "records were rejected. Reopen this hire in the provisioning " +
          "queue to finish it.",
        502,
      );
      return;
    }

    await stampMeta([
      "employeeDirectory",
      `userDomains_${uid}_identity_records`,
    ]);

    json(response, 200, {
      ok: true,
      uid,
      email,
      outcome,
    });
  },
);

export const provisioningStatus = onRequest(
  {
    cors: true,
    region: "us-central1",
  },
  async (request, response) => {
    if (request.method !== "POST") {
      provisioningFailure(
        response,
        "request",
        "This endpoint only accepts POST.",
        405,
      );
      return;
    }

    const caller = await requireAdministrator(request);

    if ("stage" in caller) {
      provisioningFailure(
        response,
        caller.stage,
        caller.message,
        caller.status,
      );
      return;
    }

    const email = textValue(request.body?.email).toLowerCase();

    if (!email.includes("@")) {
      provisioningFailure(
        response,
        "request",
        "Enter a valid work e-mail address.",
        400,
      );
      return;
    }

    try {
      let existing = null;

      try {
        existing = await getAuth().getUserByEmail(email);
      } catch (error) {
        const code =
          typeof error === "object" &&
          error !== null &&
          "code" in error ?
            String(error.code) :
            "";

        if (code !== "auth/user-not-found") {
          throw error;
        }
      }

      if (!existing) {
        json(response, 200, {
          ok: true,
          email,
          authIdentityExists: false,
          accessRecordExists: false,
          recoverable: false,
        });
        return;
      }

      const access = await db
        .collection(USER_ACCESS)
        .doc(existing.uid)
        .get();

      json(response, 200, {
        ok: true,
        email,
        uid: existing.uid,
        authIdentityExists: true,
        accessRecordExists: access.exists,
        recoverable: !access.exists && !existing.disabled,
      });
    } catch (error) {
      console.error("provisioningStatus failed", error);

      provisioningFailure(
        response,
        "service",
        "Could not read the provisioning status. Try again.",
        502,
      );
    }
  },
);

export const deleteEmployee = onRequest(
  {
    cors: true,
    region: "us-central1",
  },
  async (request, response) => {
    if (request.method !== "POST") {
      provisioningFailure(
        response,
        "request",
        "This endpoint only accepts POST.",
        405,
      );
      return;
    }

    const caller = await requireAdministrator(request);

    if ("stage" in caller) {
      provisioningFailure(
        response,
        caller.stage,
        caller.message,
        caller.status,
      );
      return;
    }

    const uid = textValue(request.body?.uid);

    if (!uid) {
      provisioningFailure(
        response,
        "request",
        "Choose an account to delete.",
        400,
      );
      return;
    }

    if (uid === caller.uid) {
      provisioningFailure(
        response,
        "request",
        "You cannot delete your own Administrator account.",
        400,
      );
      return;
    }

    try {
      const accessRef = db.collection(USER_ACCESS).doc(uid);
      const directoryRef = db.collection(EMPLOYEE_DIRECTORY).doc(uid);

      const [access, directory] = await Promise.all([
        accessRef.get(),
        directoryRef.get(),
      ]);

      const accessData = access.data() ?? {};
      const directoryData = directory.data() ?? {};

      const email =
        textValue(accessData.email) ||
        textValue(directoryData.email);

      const username =
        normalizeUsername(
          accessData.username ?? directoryData.username,
        );

      let authIdentityDeleted = true;

      try {
        await getAuth().deleteUser(uid);
      } catch (error) {
        const code =
          typeof error === "object" &&
          error !== null &&
          "code" in error ?
            String(error.code) :
            "";

        if (code === "auth/user-not-found") {
          authIdentityDeleted = false;
        } else {
          throw error;
        }
      }

      const batch = db.batch();
      batch.delete(accessRef);
      batch.delete(directoryRef);

      if (username) {
        const usernameRef =
          db.collection("usernames").doc(username);
        const usernameSnapshot = await usernameRef.get();
        const indexedUid =
          textValue(usernameSnapshot.data()?.uid);

        if (usernameSnapshot.exists && indexedUid === uid) {
          batch.delete(usernameRef);
        } else if (usernameSnapshot.exists) {
          console.warn(
            "Username index ownership mismatch during employee deletion",
            {
              username,
              targetUid: uid,
              indexedUid,
            },
          );
        }
      }

      await batch.commit();

      await db.recursiveDelete(
        db.collection("userDomains").doc(uid),
      );

      await stampMeta([
        "employeeDirectory",
        `userDomains_${uid}_identity_records`,
      ]);

      json(response, 200, {
        ok: true,
        uid,
        email,
        authIdentityDeleted,
        documentsDeleted: username ? 3 : 2,
      });
    } catch (error) {
      console.error("deleteEmployee failed", error);

      provisioningFailure(
        response,
        "service",
        "The account could not be fully deleted. Check Firebase " +
          "Authentication before retrying.",
        502,
      );
    }
  },
);
