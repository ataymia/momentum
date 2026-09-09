import assert from "node:assert/strict";
import test from "node:test";
import { addCalendarDays, arizonaDateKey, arizonaTimeKey, endOfLocalWeek, startOfLocalWeek } from "../lib/date-time";

test("Arizona company date does not roll to the next day at UTC midnight", () => {
  assert.equal(arizonaDateKey("2026-09-10T00:30:00.000Z"), "2026-09-09");
  assert.equal(arizonaTimeKey("2026-09-10T00:30:00.000Z"), "17:30");
});

test("Arizona date rolls at Arizona midnight", () => {
  assert.equal(arizonaDateKey("2026-09-10T06:59:59.000Z"), "2026-09-09");
  assert.equal(arizonaDateKey("2026-09-10T07:00:00.000Z"), "2026-09-10");
});

test("calendar-day helpers preserve local date semantics", () => {
  assert.equal(addCalendarDays("2026-09-09", 1), "2026-09-10");
  assert.equal(addCalendarDays("2026-09-01", -1), "2026-08-31");
  assert.equal(startOfLocalWeek("2026-09-09"), "2026-09-07");
  assert.equal(endOfLocalWeek("2026-09-09"), "2026-09-13");
});
