/**
 * Username authentication contract shared by the browser and Firebase Functions.
 *
 * Employees may sign in with either their work e-mail or their username. Firebase Authentication still
 * owns the credential and the uid. The username -> e-mail mapping lives in `usernames/{username}`, which
 * Security Rules deny to every browser client. Firebase Functions resolve that private alias server-side.
 *
 *   browser {username, password}  -->  Firebase Function
 *                                        |  read usernames/{username}  (Admin SDK)
 *                                        |  identitytoolkit signInWithPassword(email, password)
 *                                        v
 *                              { idToken, refreshToken, uid, expiresIn }
 *
 * The password is relayed over TLS and never stored or logged. The browser learns only the signed-in
 * employee's own e-mail after successful authentication, and username failures use a generic response.
 */

/** Legacy Worker route constants retained only for compatibility with older server code. New clients use Firebase Functions. */
export const USERNAME_SIGN_IN_PATH = "/api/auth/sign-in";
export const PASSWORD_RESET_PATH = "/api/auth/password-reset";
export const USERNAME_REMINDER_PATH = "/api/auth/username-reminder";
export const USERNAME_AVAILABILITY_PATH = "/api/admin/username-available";
export const USERNAME_BACKFILL_PATH = "/api/admin/backfill-usernames";

/** Deliberately identical for an unknown username and a wrong password. */
export const SIGN_IN_REJECTED = "Incorrect username or password.";

/**
 * What the employee typed in the single login field.
 *
 * E-mail sign-in is a permanent supported path, not a migration fallback. It authenticates directly
 * against the same Firebase identity that username sign-in resolves to, so both identifiers land on one
 * uid, one password, one access record, and one employee profile.
 */
export type LoginIdentifier = { kind: "email"; email: string } | { kind: "username"; username: string } | { kind: "empty" };

/** An `@` is the only thing that distinguishes the two; usernames can never contain one. */
export function classifyLoginIdentifier(raw: string): LoginIdentifier {
  const value = (raw ?? "").trim();
  if (!value) return { kind: "empty" };
  if (value.includes("@")) return { kind: "email", email: value.toLowerCase() };
  return { kind: "username", username: value.toLowerCase() };
}

export type AuthFailure = { ok: false; message: string; retryAfterSeconds?: number };

export type UsernameSignInRequest = { username: string; password: string };
export type UsernameSignInSuccess = {
  ok: true;
  uid: string;
  idToken: string;
  refreshToken: string;
  /** Seconds until `idToken` expires, as Identity Toolkit reports it. */
  expiresIn: string;
  /** The signed-in employee's own address, returned only after the password has been verified. */
  email: string;
};
export type UsernameSignInResponse = UsernameSignInSuccess | AuthFailure;

export type PasswordResetRequest = { username: string };
/**
 * `maskedEmail` is present only when the username resolved. The message is written so the UI reads the
 * same either way and never states that an account does or does not exist.
 */
export type PasswordResetSuccess = { ok: true; maskedEmail?: string };
export type PasswordResetResponse = PasswordResetSuccess | AuthFailure;

export type UsernameReminderRequest = { email: string };
/** Always the same response. A match records an Administrator task; a miss records nothing. */
export type UsernameReminderSuccess = { ok: true };
export type UsernameReminderResponse = UsernameReminderSuccess | AuthFailure;

export type UsernameAvailabilityRequest = { username: string; uid?: string };
export type UsernameAvailabilitySuccess = {
  ok: true;
  username: string;
  available: boolean;
  /** A free alternative when the requested name is taken. */
  suggestion?: string;
};
export type UsernameAvailabilityResponse = UsernameAvailabilitySuccess | AuthFailure;

export type UsernameBackfillRequest = { apply?: boolean };
export type UsernameBackfillEntry = { uid: string; name: string; username: string; status: "already-assigned" | "assigned" | "would-assign" | "unresolvable" };
export type UsernameBackfillSuccess = { ok: true; applied: boolean; entries: UsernameBackfillEntry[] };
export type UsernameBackfillResponse = UsernameBackfillSuccess | AuthFailure;
