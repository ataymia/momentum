import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

test("new CRM locations capture UID distinct from transferable owner ID",()=>{
  const workspace=readFileSync("lib/workspace-context-v5.tsx","utf8");
  assert.match(workspace,/createdAt, createdByUid:currentUser\.id, customerId/);
  assert.match(workspace,/originatorId: currentUser\.id/);
  assert.match(workspace,/responsibilityStartedAt: nowStamp\(\)/);
});

test("normalization retains verified-format creator UID and timestamp but does not backfill legacy owners",()=>{
  const normalizer=readFileSync("lib/workspace-normalization.ts","utf8");
  assert.match(normalizer,/createdByUid: userRef\(value\.createdByUid\)/);
  assert.match(normalizer,/createdAt: validInstant\(value\.createdAt\)/);
  assert.doesNotMatch(normalizer,/createdByUid:\s*(?:ownerId|userRef\(value\.ownerId\))/);
});

test("provenance alone does not expose an insecure CRM editing path",()=>{
  const ui=readFileSync("components/pages/accounts.tsx","utf8");
  assert.doesNotMatch(ui,/updateAccountProfile\(/);
  const definitions=readFileSync("lib/types.ts","utf8");
  assert.match(definitions,/createdByUid\?: string/);
});
