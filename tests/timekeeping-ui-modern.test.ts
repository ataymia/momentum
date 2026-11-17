import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
test("redesigned timekeeper uses existing authoritative punch and meal callbacks",()=>{
 const code=readFileSync("components/pages/operations-tools-base.tsx","utf8");
 assert.match(code,/function TimekeepingPage\(\)/);
 assert.match(code,/toggleClock\(\)/);
 assert.match(code,/onClick=\{startMeal\}/);
 assert.match(code,/onClick=\{endMeal\}/);
 assert.match(code,/onClick=\{punch\}/);
 assert.match(code,/className="timekeeping-hero"/);
 assert.match(code,/entry\.breakMinutes/);
 assert.match(code,/roleIsTracked\(currentUser\.role\)/);
 assert.match(code,/tracking\.requestLocationPermission\(\)/);
});
test("timekeeping and profiles have responsive styles loaded at root",()=>{
 const layout=readFileSync("app/layout.tsx","utf8");
 assert.match(layout,/timekeeping-modern\.css/);
 assert.match(layout,/employee-profile-modern\.css/);
 const css=readFileSync("app/timekeeping-modern.css","utf8");
 assert.match(css,/@media\(max-width:620px\)/);
});
