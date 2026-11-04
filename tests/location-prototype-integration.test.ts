import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const file=(path:string)=>readFileSync(path,"utf8");

test("integrated app shell preserves the single redesigned sidebar and own-device location reminder",()=>{
  const shell=file("components/app-shell-v4.tsx");
  assert.match(shell,/NavigationGroups\/>/);
  assert.match(shell,/useNavigationRoute\(\)/);
  assert.match(shell,/requiresPrototypePage\(route\)/);
  assert.match(shell,/LocationPermissionReminder\/>/);
  assert.match(shell,/import \{LocationPermissionReminder\} from "\.\/field-tracking\/location-permission-reminder";/);
  assert.doesNotMatch(shell,/<SectionSubnav\/>/,"Old secondary header should not be reintroduced");
  assert.equal((shell.match(/<LocationPermissionReminder\/>/g)??[]).length,1);
});
test("all clock-in recovery layers survive without elevating an administrator to employee GPS",()=>{
  const reminder=file("components/field-tracking/location-permission-reminder.tsx");
  const request=file("functions/src/location-permission-request.ts");
  const rules=file("firestore.rules");
  const tracking=file("lib/location-tracking-context.tsx");
  assert.match(reminder,/firebase\?\.session\?\.uid===currentUser\?\.id/);
  assert.match(reminder,/onClick=\{check\}/);
  assert.match(request,/actorAccess\?\.role!=="Administrator"/);
  assert.match(rules,/locationPermissionRequests/);
  assert.match(tracking,/requestLocationPermission=useCallback/);
});
test("the test command retains both prior prototype suites and new location permission tests",()=>{
  const pkg=JSON.parse(file("package.json")) as {scripts:Record<string,string>};
  for(const name of [
    "tests/notification-display-time.test.ts",
    "tests/navigation-route-registry.test.ts",
    "tests/fulfillment-demo-controls.test.ts",
    "tests/workspace-home-source.test.ts",
    "tests/work-review-source.test.ts",
    "tests/location-permission-recovery.test.ts",
  ])assert(pkg.scripts["test:logic"].split(" ").includes(name),name);
});
