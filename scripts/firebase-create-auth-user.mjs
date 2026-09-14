#!/usr/bin/env node
/**
 * Create the first Firebase Authentication user for Momentum from the command line.
 *
 * Uses the public Web API key (same call the Firebase console's "Add user" makes), so it needs no service
 * account. The account gets NO Momentum access until it signs in and claims Administrator under the
 * rules-controlled bootstrap (firestore.rules → bootstrapEmails / first verified claim).
 *
 * Usage:
 *   node scripts/firebase-create-auth-user.mjs owner@company.com
 *   MOMENTUM_TEMP_PASSWORD='Str0ng-Temp-Pass' node scripts/firebase-create-auth-user.mjs owner@company.com
 *
 * Reads NEXT_PUBLIC_FIREBASE_API_KEY from the environment or .env.local.
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

function loadDotEnv(path) {
  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* optional */ }
}
loadDotEnv(new URL("../.env.local", import.meta.url).pathname);
loadDotEnv(new URL("../.env", import.meta.url).pathname);

const email = (process.argv[2] ?? "").trim().toLowerCase();
const apiKey = (process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "").trim();
if (!email.includes("@")) { console.error("Usage: node scripts/firebase-create-auth-user.mjs <work-email>"); process.exit(64); }
if (!apiKey) { console.error("NEXT_PUBLIC_FIREBASE_API_KEY is not set (environment or .env.local)."); process.exit(78); }

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
const generated = Array.from(randomBytes(14), (byte) => alphabet[byte % alphabet.length]).join("");
const password = process.env.MOMENTUM_TEMP_PASSWORD?.trim() || `${generated.slice(0, 4)}-${generated.slice(4, 9)}-${generated.slice(9)}`;

const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password, returnSecureToken: true }),
});
const payload = await response.json().catch(() => null);
if (!response.ok || !payload?.localId) {
  const message = payload?.error?.message ?? `HTTP ${response.status}`;
  if (message.includes("EMAIL_EXISTS")) console.error(`An Authentication user already exists for ${email}. Use "Forgot password" on the sign-in screen if needed.`);
  else if (message.includes("OPERATION_NOT_ALLOWED")) console.error("Email/Password sign-in is not enabled for this Firebase project. Enable it under Authentication → Sign-in method.");
  else console.error(`Firebase rejected the request: ${message}`);
  process.exit(1);
}

// Send the verification e-mail immediately; the bootstrap rules require a verified address.
const verify = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(apiKey)}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ requestType: "VERIFY_EMAIL", idToken: payload.idToken }),
});

console.log(`Created Firebase Authentication user ${email} (uid ${payload.localId}).`);
console.log(`Temporary password: ${password}`);
console.log(verify.ok ? "Verification e-mail sent. Click the link, then sign in to Momentum and claim Administrator access." : "Could not send the verification e-mail automatically; use the sign-in screen's access page to resend it.");
console.log("Share the temporary password only through a secure channel and rotate it after first sign-in.");
