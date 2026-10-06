import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { describe } from "node:test";
import { canAccessPage } from "../lib/access";
import { DOMAIN_BY_KEY, domainDocuments, userDocPath } from "../lib/firestore-domains";
import type { PersistenceScope } from "../lib/firebase-access";
import {
  ROUTE_PING_INTERVAL_MINUTES,
  ROUTE_RETENTION_DAYS,
  roleIsTracked,
  routeSampleRetained,
  shouldPersistRouteSample,
  type RouteSample,
} from "../lib/location-tracking-engine";
import type { WorkspaceUser } from "../lib/types";

const user=(role:WorkspaceUser["role"],id:string):WorkspaceUser=>({
  id,name:id,firstName:id,email:`${id}@test.co`,initials:id.slice(0,2).toUpperCase(),title:role,role,
  team:role==="Administrator"?"Leadership":"Sales",accent:"#000",
});

describe("live workforce access",()=>{
  test("Workforce live is Administrator-only",()=>{
    assert.equal(canAccessPage(user("Administrator","admin"),"workforceLive"),true);
    assert.equal(canAccessPage(user("Sales Manager","manager"),"workforceLive"),false);
    assert.equal(canAccessPage(user("Sales Representative","rep"),"workforceLive"),false);
  });

  test("Sales Managers cannot load a rep's route shards while Administrators can",()=>{
    const spec=DOMAIN_BY_KEY.get("momentum-field-tracking-v1")!;
    const managerScope:PersistenceScope={
      uid:"manager",role:"Sales Manager",accountState:"Active",
      readableUserIds:new Set(["manager","rep"]),managedUserIds:new Set(["rep"]),supervisedBrandAmbassadorIds:new Set(),
    };
    const adminScope:PersistenceScope={
      uid:"admin",role:"Administrator",accountState:"Active",
      readableUserIds:new Set(["admin","manager","rep"]),managedUserIds:new Set(),supervisedBrandAmbassadorIds:new Set(),
    };
    const repSamples=userDocPath("rep","fieldTracking","samples");
    assert.equal(domainDocuments(spec,managerScope).some((document)=>document.path===repSamples),false);
    assert.equal(domainDocuments(spec,adminScope).some((document)=>document.path===repSamples),true);
  });
});

describe("clocked-in route sampling",()=>{
  const previous:RouteSample={
    id:"route-1",sessionId:"session-1",userId:"rep",source:"Route",
    latitude:33.4484,longitude:-112.074,accuracyMeters:15,at:"2026-10-06T16:00:00.000Z",
  };
  test("designated field tracking remains limited to Sales Representatives",()=>{
    assert.equal(roleIsTracked("Sales Representative"),true);
    assert.equal(roleIsTracked("Sales Manager"),false);
    assert.equal(roleIsTracked("Warehouse"),false);
  });
  test("regular route persistence is time-bounded at fifteen minutes",()=>{
    assert.equal(ROUTE_PING_INTERVAL_MINUTES,15);
    assert.equal(shouldPersistRouteSample(previous,{...previous,at:"2026-10-06T16:14:59.000Z"}),false);
    assert.equal(shouldPersistRouteSample(previous,{...previous,at:"2026-10-06T16:15:00.000Z"}),true);
  });
  test("route history is retained for thirty days",()=>{
    const reference=new Date("2026-10-06T16:00:00.000Z").getTime();
    assert.equal(ROUTE_RETENTION_DAYS,30);
    assert.equal(routeSampleRetained("2026-09-07T16:00:00.000Z",reference),true);
    assert.equal(routeSampleRetained("2026-09-05T15:59:59.000Z",reference),false);
  });
});

describe("timekeeping production controls",()=>{
  const types=readFileSync(new URL("../lib/types.ts",import.meta.url),"utf8");
  const workspace=readFileSync(new URL("../lib/workspace-context-v5.tsx",import.meta.url),"utf8");
  const live=readFileSync(new URL("../components/pages/workforce-live.tsx",import.meta.url),"utf8");
  const tracking=readFileSync(new URL("../lib/location-tracking-context.tsx",import.meta.url),"utf8");

  test("web punches keep exact clock-in and clock-out instants",()=>{
    assert.match(types,/Web clock/);
    assert.match(types,/clockInAt\?: string/);
    assert.match(types,/clockOutAt\?: string/);
    assert.match(workspace,/source: "Web clock"/);
    assert.match(workspace,/clockInAt: punchAt/);
    assert.match(workspace,/clockOutAt: punchAt/);
  });

  test("Administrator board shows clock status without exposing coordinates as prose",()=>{
    assert.match(live,/Workforce live/);
    assert.match(live,/Clocked in/);
    assert.match(live,/Open route in Google Maps/);
    assert.doesNotMatch(live,/toFixed\(5\)/);
  });

  test("scheduled fifteen-minute capture exists alongside browser location watch",()=>{
    assert.match(tracking,/ROUTE_PING_INTERVAL_MS/);
    assert.match(tracking,/setInterval\(\(\) => void captureScheduledPing\(\), ROUTE_PING_INTERVAL_MS\)/);
    assert.match(tracking,/navigator\.geolocation\.watchPosition/);
  });
});
