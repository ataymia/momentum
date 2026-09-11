import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const config=readFileSync(new URL("../lib/firebase-config.ts",import.meta.url),"utf8");
const auth=readFileSync(new URL("../lib/firebase-auth-rest.ts",import.meta.url),"utf8");
const firestore=readFileSync(new URL("../lib/firebase-firestore-rest.ts",import.meta.url),"utf8");
const firestoreRules=readFileSync(new URL("../firestore.rules",import.meta.url),"utf8");
const storageRules=readFileSync(new URL("../storage.rules",import.meta.url),"utf8");

test("Firebase browser boundary uses only public web configuration and never embeds a service credential",()=>{
  assert.match(config,/NEXT_PUBLIC_FIREBASE_API_KEY/);
  assert.match(config,/NEXT_PUBLIC_FIREBASE_PROJECT_ID/);
  assert.doesNotMatch(config,/private_key|service_account|client_email/i);
  assert.doesNotMatch(auth,/service_account|private_key/i);
  assert.doesNotMatch(firestore,/service_account|private_key/i);
});

test("Firebase Authentication integration supports sign-in refresh and password change without exposing self-signup",()=>{
  assert.match(auth,/accounts:signInWithPassword/);
  assert.match(auth,/securetoken\.googleapis\.com\/v1\/token/);
  assert.match(auth,/accounts:update/);
  assert.doesNotMatch(auth,/accounts:signUp/);
});

test("Firestore REST requests use Firebase ID tokens so Security Rules remain the authorization boundary",()=>{
  assert.match(firestore,/authorization:`Bearer \$\{session\.idToken\}`/);
  assert.match(firestore,/firestore\.googleapis\.com\/v1\/projects/);
});

test("Firestore rules are deny-by-default and enforce account-to-territory ownership",()=>{
  assert.match(firestoreRules,/function territoryMatches\(data\)/);
  assert.match(firestoreRules,/get\(territoryPath\(data\.territoryId\)\)\.data\.ownerId == data\.ownerId/);
  assert.match(firestoreRules,/match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
});

test("Storage rules keep onboarding and employee documents authenticated and private",()=>{
  assert.match(storageRules,/match \/onboardingTemplates/);
  assert.match(storageRules,/match \/employeeDocuments\/\{uid\}/);
  assert.match(storageRules,/uid == request\.auth\.uid \|\| isAdmin\(\)/);
  assert.match(storageRules,/allow read, write: if false;/);
});
