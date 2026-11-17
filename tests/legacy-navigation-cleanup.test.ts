import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

test("G09: application shell uses sidebar navigation, not legacy header module tabs",()=>{
  const shell=readFileSync("components/app-shell-v4.tsx","utf8");
  assert.match(shell,/function NavigationGroups\(/);
  assert.match(shell,/aria-label="Primary navigation"/);
  assert.match(shell,/<NavigationGroups\/>/);
  assert.doesNotMatch(shell,/const sectionTabs:/);
  assert.doesNotMatch(shell,/topbar__tabs/);
  assert.doesNotMatch(shell,/<div className="company-tabs">/);
  assert.match(shell,/aria-label="Breadcrumb"/);
});
