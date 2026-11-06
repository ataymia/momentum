import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {projectAccounts} from "../lib/maps-integration";
import type {Account} from "../lib/types";

const account=(id:string,latitude?:number,longitude?:number):Account=>({
  id,name:"Store "+id,location:"Phoenix, AZ",latitude,longitude,
} as Account);

test("plot uses only saved real coordinate fields, never fabricated positions",()=>{
 const pts=projectAccounts([account("west",33.45,-112.19),account("east",33.48,-112.01),account("missing")]);
 assert.deepEqual(pts.map(p=>p.accountId),["west","east"]);
 assert.ok(pts.every(p=>p.x>=0&&p.x<=1000&&p.y>=0&&p.y<=620));
 assert.equal(pts[0].x<pts[1].x,true);
 assert.equal(pts[0].y>pts[1].y,true);
 assert.deepEqual(projectAccounts([account("missing")]),[]);
});

test("Account Map route is independent, role-scoped, deep-linked, and provider neutral",()=>{
 const registry=readFileSync("lib/navigation-route-registry.ts","utf8");
 const hub=readFileSync("components/prototype/operations-hub.tsx","utf8");
 const page=readFileSync("components/prototype/crm-account-map.tsx","utf8");
 assert.match(registry,/path: "\/crm\/account-map", permission: "salesMap", state: "prototype"/);
 assert.match(hub,/if\(path==="\/crm\/account-map"\)return <CrmAccountMap\/>/);
 assert.match(page,/scope\.accounts\.filter/);
 assert.match(page,/currentUser\.role==="Customer"/);
 assert.match(page,/projectAccounts\(rows\)/);
 assert.match(page,/navigateToRoute\("\/sales\/customers\/"\+encodeURIComponent\(account\.id\)\)/);
 assert.match(page,/Only stored coordinates are plotted/);
 assert.doesNotMatch(page,/navigator\.geolocation|getCurrentPosition\(|https?:\/\//);
});

test("map includes nongeocoded records as ordinary list rows, not invented points",()=>{
 const page=readFileSync("components/prototype/crm-account-map.tsx","utf8");
 assert.match(page,/const missing=rows\.filter\(a=>!accountHasCoordinates\(a\)\)/);
 assert.match(page,/Not geocoded/);
 assert.match(page,/!plot\.length/);
});
