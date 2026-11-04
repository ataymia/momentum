import test from "node:test";
import assert from "node:assert/strict";
import {evaluateSalesCRMInactivity} from "../lib/sales-crm-inactivity";

const origin = "2026-11-04T15:00:00.000Z";
const t = (minutes: number) => Date.parse(origin) + minutes * 60_000;
test("shows CRM warning at 45 minutes and review at 60", () => {
  assert.equal(evaluateSalesCRMInactivity(origin, [], t(44)).state, "within-window");
  assert.equal(evaluateSalesCRMInactivity(origin, [], t(45)).state, "warning");
  assert.equal(evaluateSalesCRMInactivity(origin, [], t(60)).state, "review");
});
test("a recorded CRM event resets the observation window", () => {
  const events = [{at: new Date(t(51)).toISOString(), kind: "crm" as const}];
  const result = evaluateSalesCRMInactivity(origin, events, t(65));
  assert.equal(result.elapsedMinutes, 14);
  assert.equal(result.hadCRMEvent, true);
  assert.equal(result.state, "within-window");
});
test("GPS pings and merely opening a tablet never establish work", () => {
  const events = [
    {at: new Date(t(59)).toISOString(), kind: "gps" as const},
    {at: new Date(t(59)).toISOString(), kind: "app-open" as const},
    {at: new Date(t(59)).toISOString(), kind: "location-permission" as const},
  ];
  assert.equal(evaluateSalesCRMInactivity(origin, events, t(61)).state, "review");
});
test("invalid, future, or pre-shift events cannot reset the window", () => {
  const events = [
    {at: "invalid", kind: "crm" as const},
    {at: new Date(t(-5)).toISOString(), kind: "visit" as const},
    {at: new Date(t(90)).toISOString(), kind: "order" as const},
  ];
  assert.equal(evaluateSalesCRMInactivity(origin, events, t(65)).elapsedMinutes, 65);
});
test("missing timestamp never constructs a fabricated work gap", () => {
  assert.equal(evaluateSalesCRMInactivity(undefined, [], t(61)).state, "unavailable");
});
