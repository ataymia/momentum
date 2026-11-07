import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {canVisitRoute,pageForPath,requiresPrototypePage} from "../lib/navigation-route-registry";
import {deliveryAssignmentStillOpen} from "../lib/action-center-policy-v2";
import type {Role,WorkspaceUser} from "../lib/types";

const makeUser=(role:Role):WorkspaceUser=>({
  id:"demo-"+role,name:"Example",firstName:"Example",initials:"EX",title:"Example",
  role,team:role==="Customer"?"Customer":"Sales",email:"example@example.invalid",accent:"#111",
});
test("Action Center has dedicated sidebar route and excludes customers",()=>{
  assert.equal(pageForPath("/work/actions"),"actions");
  assert.equal(requiresPrototypePage("/work/actions"),true);
  assert(canVisitRoute(makeUser("Administrator"),"/work/actions"));
  assert(canVisitRoute(makeUser("Sales Representative"),"/work/actions"));
  assert.equal(canVisitRoute(makeUser("Customer"),"/work/actions"),false);
});
test("Action Center is a read-only projection of authoritative action policy",()=>{
  const src=readFileSync("components/prototype/action-center-experience.tsx","utf8");
  assert.match(src,/buildActionNotices\(\{data,scope,currentUser/);
  assert.match(src,/routeForPage\(item\.page\)/);
  assert.match(src,/navigateToRoute\(target\)/);
  assert.match(src,/Action Center/);
  assert.match(src,/Clearing a bell alert does not close/);
  assert.doesNotMatch(src,/\bdecideApproval\(/);
  assert.doesNotMatch(src,/\bcreateOrder\(/);
  assert.doesNotMatch(src,/\bmarkAllRead\(/);
  assert.doesNotMatch(src,/\bsetCommercial\(/);
});
test("Action Center hides invented times for undated tasks",()=>{
  const src=readFileSync("components/prototype/action-center-experience.tsx","utf8");
  assert.match(src,/Date not recorded/);
  assert.match(src,/dateLabel\(item\.occurredAt\)/);
});

test("G01: completed or cancelled deliveries do not remain active badge actions",()=>{
  for(const state of ["Accepted","Loaded","In transit"] as const)assert.equal(deliveryAssignmentStillOpen(state),true);
  for(const state of ["Delivered","Cancelled"] as const)assert.equal(deliveryAssignmentStillOpen(state),false);
});
