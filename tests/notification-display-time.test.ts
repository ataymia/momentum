import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeFirstSeenRecords,
  mergeFirstSeenTimes,
  notificationDisplayTime,
  parseFirstSeenTimes,
} from "../lib/notification-display-time";

const actual="2026-10-15T20:03:22.000Z";
const first="2026-10-16T09:15:00.000Z";
const check="2026-11-03T22:31:00.000Z";

test("recorded event time takes priority over current render time",()=>{
  assert.deepEqual(notificationDisplayTime(actual,first,check),{time:actual,source:"recorded"});
});
test("undated notices retain a stable first-seen time across rerenders",()=>{
  const stored=mergeFirstSeenTimes({},["derived-action:approval:1"],first);
  const again=mergeFirstSeenTimes(stored,["derived-action:approval:1"],check);
  assert.strictEqual(again,stored);
  assert.deepEqual(notificationDisplayTime(undefined,again["derived-action:approval:1"],check),{time:first,source:"first-seen"});
});
test("missing or invalid event timestamps cannot be presented as event times",()=>{
  assert.deepEqual(notificationDisplayTime("invalid",undefined,check),{time:check,source:"first-seen"});
  assert.deepEqual(notificationDisplayTime(undefined,"not-a-time",check),{time:check,source:"first-seen"});
  assert.deepEqual(notificationDisplayTime("2026-11-05",undefined,check),{time:check,source:"first-seen"});
  assert.deepEqual(notificationDisplayTime("2026-11-05T11:00:00",undefined,check),{time:check,source:"first-seen"});
});
test("first-seen state deduplicates IDs, rejects bad persistence and stays bounded",()=>{
  const result=mergeFirstSeenTimes({},["x","x","y",""],first);
  assert.deepEqual(Object.keys(result).sort(),["x","y"]);
  assert.deepEqual(parseFirstSeenTimes({x:first,y:"bad",z:null}),{x:first});
  assert.deepEqual(parseFirstSeenTimes(null),{});
});
test("notification popover displays cleared notices only outside its unread list",()=>{
  const source=readFileSync("components/app-shell-v4.tsx","utf8");
  assert.match(source,/unreadItems = generated\.currentUserItems\.filter\(item=>item\.status==="Unread"\)/);
  assert.match(source,/>Clear all<\/button>/);
  assert.match(source,/unreadItems\.slice\(0, 12\)/);
});

test("concurrent tabs preserve the earliest first-seen date and all valid IDs",()=>{
  const merged=mergeFirstSeenRecords(
    {"one":"2026-11-05T00:00:00Z","two":"2026-11-06T00:00:00Z"},
    {"one":"2026-11-01T00:00:00Z","three":"2026-11-06T11:00:00Z"},
  );
  assert.equal(merged.one,"2026-11-01T00:00:00Z");
  assert.deepEqual(Object.keys(merged).sort(),["one","three","two"]);
  assert.deepEqual(mergeFirstSeenRecords(merged,{}),merged);
});
