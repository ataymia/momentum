import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("username authentication routes through Firebase Functions", () => {
  const source = read("lib/firebase-auth-rest.ts");

  assert.match(source, /firebaseFunctionUrl\("usernameSignIn"\)/);
  assert.match(source, /firebaseFunctionUrl\("usernamePasswordReset"\)/);
  assert.match(source, /firebaseFunctionUrl\("usernameReminder"\)/);

  assert.doesNotMatch(source, /fetch\(USERNAME_SIGN_IN_PATH/);
  assert.doesNotMatch(source, /fetch\(PASSWORD_RESET_PATH/);
  assert.doesNotMatch(source, /fetch\(USERNAME_REMINDER_PATH/);
});

test("privileged employee provisioning routes through Firebase Functions", () => {
  const source = read("lib/firebase-admin-provisioning.ts");

  assert.match(source, /firebaseFunctionUrl\("provisionEmployee"\)/);
  assert.match(source, /firebaseFunctionUrl\("provisioningStatus"\)/);
  assert.match(source, /firebaseFunctionUrl\("deleteEmployee"\)/);

  assert.doesNotMatch(source, /PROVISION_EMPLOYEE_PATH/);
  assert.doesNotMatch(source, /PROVISIONING_STATUS_PATH/);
  assert.doesNotMatch(source, /DELETE_EMPLOYEE_PATH/);
});

test("Cloudflare Worker is not the username-authentication endpoint", () => {
  const source = read("worker/index.ts");

  assert.doesNotMatch(source, /\/api\/auth\/sign-in/);
  assert.doesNotMatch(source, /\/api\/auth\/password-reset/);
  assert.doesNotMatch(source, /\/api\/auth\/username-reminder/);
  assert.doesNotMatch(source, /usernameSignIn/);
  assert.doesNotMatch(source, /usernamePasswordReset/);
  assert.doesNotMatch(source, /usernameReminder/);
});

test("the browser Function endpoint is configurable without changing app code", () => {
  const source = read("lib/firebase-functions.ts");

  assert.match(source, /NEXT_PUBLIC_FIREBASE_FUNCTIONS_BASE_URL/);
  assert.match(source, /us-central1/);
  assert.match(source, /cloudfunctions\.net/);
});
