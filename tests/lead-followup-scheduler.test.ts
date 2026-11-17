import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
const source=readFileSync(new URL("../components/prototype/operations-hub.tsx",import.meta.url),"utf8");
test("lead scheduling is demo-only and role-gated",()=>{
  const section=source.slice(source.indexOf("function LeadFollowupScheduler"),source.indexOf("function CustomerRecord"));
  assert.match(section,/isDemo&&!!currentUser/);
  assert.match(section,/Sales Representative/);
  assert.match(section,/createAppointment\(/);
  assert.match(section,/if\(!id\)/);
  assert.match(section,/Scheduling was rejected/);
});
test("lead follow-up action is attached to accessible filtered rows",()=>{
  assert.match(source,/LeadFollowupScheduler accountId=\{a\.id\}/);
  assert.match(source,/scope\.accounts/);
});
