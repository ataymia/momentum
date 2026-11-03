import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {roleIsTracked} from "../lib/location-tracking-engine";
import {isPendingLocationRequest,type LocationPermissionRequest} from "../lib/location-permission-requests";
const source=(path:string)=>readFileSync(path,"utf8");
const reminder:LocationPermissionRequest={targetUid:"rep-1",requestId:"location-1",requestedAt:"2026-11-03T10:00:00.000Z",requestedBy:"admin-1",
 expiresAt:"2026-11-10T10:00:00.000Z",status:"Pending"};
test("location reminder is time-bounded, employee-specific and voluntary",()=>{
 assert.equal(isPendingLocationRequest(reminder,Date.parse("2026-11-03T10:00:01.000Z")),true);
 assert.equal(isPendingLocationRequest({...reminder,status:"Responded"},Date.parse("2026-11-03T10:00:01.000Z")),false);
 assert.equal(isPendingLocationRequest(reminder,Date.parse(reminder.expiresAt)),false);
 assert.equal(roleIsTracked("Sales Representative"),true);
 assert.equal(roleIsTracked("Sales Manager"),false);
});
test("both clock-in entry points punch independently and request GPS only when clocking in",()=>{
 const time=source("components/pages/operations-tools-base.tsx");
 const hr=source("components/pages/people-v2.tsx");
 assert.match(time,/toggleClock\(\);if\(!open&&tracked\)void tracking\.requestLocationPermission\(\)/);
 assert.match(hr,/toggleClock\(\);if\(!activeEntry&&roleIsTracked\(currentUser\.role\)\)void tracking\.requestLocationPermission\(\)/);
 const tracking=source("lib/location-tracking-context.tsx");
 assert.match(tracking,/requestLocationPermission=useCallback/);
 assert.match(tracking,/const action=requestBrowserPoint\(\)\.then/);
 assert.doesNotMatch(tracking,/requestLocationPermission\(\).*toggleClock/s);
});
test("Admin reminders are server-authorized, throttle repeated sends, and never grant GPS remotely",()=>{
 const backend=source("functions/src/location-permission-request.ts");
 const rules=source("firestore.rules");
 assert.match(backend,/actorAccess\?\.role!=="Administrator"/);
 assert.match(backend,/actorUid!==targetUid/);
 assert.match(backend,/COOLDOWN_MS=5\*60_000/);
 assert.match(backend,/targetAccess\?\.role!=="Sales Representative"/);
 assert.doesNotMatch(backend,/geolocation|latitude|longitude|watchPosition/);
 assert.match(rules,/match \/locationPermissionRequests\/\{uid\} \{/);
 assert.match(rules,/allow create, update, delete: if false;/);
 assert.match(rules,/request\.auth\.uid == uid/);
});
test("reminder is shown only on recipient device and never silently opens native browser permission",()=>{
 const banner=source("components/field-tracking/location-permission-reminder.tsx");
 assert.match(banner,/employeeLocationReminder\(uid\)/);
 assert.match(banner,/const check=\(\)=>\{/);
 assert.match(banner,/tracking\.requestLocationPermission\(\)/);
 assert.match(banner,/onClick=\{check\}/);
 const admin=source("components/pages/workforce-live.tsx");
 assert.match(admin,/roleIsTracked\(row\.user\.role\)/);
 assert.match(admin,/updateLocationPermissionRequest\(\{action:"send",targetUid:user\.id\}\)/);
});
