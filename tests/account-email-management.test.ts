import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("employees can change their own sign-in email from the account menu", () => {
  const shell = readFileSync("components/app-shell-v4.tsx", "utf8");
  const session = readFileSync("lib/firebase-session-context.tsx", "utf8");
  assert.match(shell, /Change email/);
  assert.match(shell, /Update your own sign-in email/);
  assert.match(shell, /firebase\.changeOwnEmail\(newEmail,currentPassword\)/);
  assert.match(session, /signInWithFirebasePassword\(session\.email,currentPassword\)/);
  assert.match(session, /updateMomentumAccountEmail\(fresh,session\.uid,normalizedEmail\)/);
});

test("administrators can change another employee's work and login email", () => {
  const directory = readFileSync("components/hcm/employee-directory.tsx", "utf8");
  const session = readFileSync("lib/firebase-session-context.tsx", "utf8");
  assert.match(directory, /Field label="Work email"/);
  assert.match(directory, /firebase\.changeUserEmail\(selected\.id,email\)/);
  assert.match(session, /changeUserEmail:/);
  assert.match(session, /requireAdministrator\(\)/);
});

test("email changes update Firebase Auth and every login-facing Momentum identity record", () => {
  const functions = readFileSync("functions/src/index.ts", "utf8");
  assert.match(functions, /export const updateAccountEmail = onRequest/);
  assert.match(functions, /getAuth\(\)\.updateUser\(uid, \{/);
  assert.match(functions, /emailVerified: false/);
  assert.match(functions, /collection\(USER_ACCESS\)\.doc\(uid\)/);
  assert.match(functions, /collection\(EMPLOYEE_DIRECTORY\)\.doc\(uid\)/);
  assert.match(functions, /collection\("usernames"\)\.doc\(username\)/);
  assert.match(functions, /emailChangeHistory/);
  assert.match(functions, /previousEmail/);
});

test("self-service email changes require recent password reauthentication while admins retain managed access", () => {
  const functions = readFileSync("functions/src/index.ts", "utf8");
  const helper = readFileSync("lib/firebase-account-management.ts", "utf8");
  assert.match(functions, /auth_time/);
  assert.match(functions, /recently sign in again/i);
  assert.match(functions, /callerIsAdministrator/);
  assert.match(helper, /authorization: `Bearer \$\{session\.idToken\}`/);
});
