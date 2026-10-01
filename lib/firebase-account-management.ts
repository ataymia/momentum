import type { FirebaseAuthSession } from "./firebase-auth-rest";
import { firebaseFunctionUrl } from "./firebase-functions";

export type AccountEmailChangeSuccess = {
  ok: true;
  uid: string;
  email: string;
  previousEmail: string;
};

type AccountEmailChangeFailure = {
  ok: false;
  message: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function updateMomentumAccountEmail(
  session: FirebaseAuthSession,
  uid: string,
  email: string,
): Promise<AccountEmailChangeSuccess> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!uid.trim()) throw new Error("Choose an account to update.");
  if (!emailPattern.test(normalizedEmail)) throw new Error("Enter a valid e-mail address.");

  let response: Response;
  try {
    response = await fetch(firebaseFunctionUrl("updateAccountEmail"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.idToken}`,
      },
      body: JSON.stringify({ uid, email: normalizedEmail }),
    });
  } catch {
    throw new Error("Could not reach the account service. Check your connection and try again.");
  }

  const payload = await response.json().catch(() => null) as AccountEmailChangeSuccess | AccountEmailChangeFailure | null;
  if (!payload) throw new Error(`The account service returned an unreadable response (${response.status}).`);
  if (payload.ok !== true) throw new Error(payload.message || "The e-mail address could not be changed.");
  return payload;
}
