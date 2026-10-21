import assert from "node:assert/strict";
import test from "node:test";
import {routeRetentionStart,routeReviewDates,retainRouteEvidence,routeDateWithinRetention} from "../lib/route-retention";

const now="2026-10-20T13:00:00-07:00";
test("10 Arizona review dates include today and nine preceding calendar days",()=>{
  const dates=routeReviewDates(now);
  assert.equal(dates.length,10);
  assert.equal(dates[0],"2026-10-20");
  assert.equal(dates.at(-1),"2026-10-11");
  assert.equal(routeRetentionStart(now),"2026-10-11");
  assert.equal(routeDateWithinRetention("2026-10-10",now),false);
  assert.equal(routeDateWithinRetention("2026-10-11",now),true);
});
test("route retention drops previous days outside the window and future-dated samples",()=>{
  const records=[
    {id:"fresh",at:"2026-10-20T09:00:00-07:00"},
    {id:"boundary",at:"2026-10-11T00:00:00-07:00"},
    {id:"old",at:"2026-10-10T23:59:59-07:00"},
    {id:"future",at:"2026-10-21T00:00:00-07:00"},
    {id:"invalid",at:"not-a-date"},
  ];
  assert.deepEqual(retainRouteEvidence(records,now).map(row=>row.id),["fresh","boundary"]);
});
