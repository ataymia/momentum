import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canManageMarketing } from "../lib/access";
import { createDemoData } from "../lib/demo-data";

const data=createDemoData();
const role=(name:string)=>data.users.find((user)=>user.role===name)!;

test("current role model reserves marketing administration for the administrator",()=>{
  assert.equal(canManageMarketing(role("Administrator")),true);
  assert.equal(canManageMarketing(role("Sales Manager")),false);
  assert.equal(canManageMarketing(role("Sales Representative")),false);
  assert.equal(canManageMarketing(role("Operations")),false);
  assert.equal(canManageMarketing(role("Customer")),false);
});

test("marketing context keeps employee support requests separate from administrative mutations",()=>{
  const source=readFileSync(new URL("../lib/marketing-context.tsx",import.meta.url),"utf8");
  assert.match(source,/const isEmployee=Boolean\(currentUser&&currentUser\.role!=="Customer"\)/);
  assert.match(source,/const isAdmin=canManageMarketing\(currentUser\)/);
  assert.match(source,/const submitRequest=.*if\(!isEmployee\|\|!currentUser/);
  assert.match(source,/const createCampaign=[\s\S]*?if\(!isAdmin\|\|!currentUser/);
  assert.match(source,/const recordSpend=[\s\S]*?if\(!isAdmin\|\|!currentUser/);
  assert.match(source,/const addTouch=[\s\S]*?if\(!isAdmin\|\|!currentUser/);
  assert.match(source,/const addAttribution=[\s\S]*?if\(!isAdmin\|\|!currentUser/);
  assert.match(source,/const addPartnership=[\s\S]*?if\(!isAdmin\|\|!currentUser/);
});

test("non-admin marketing UI exposes request self-service without company budgets or control tabs",()=>{
  const source=readFileSync(new URL("../components/pages/marketing.tsx",import.meta.url),"utf8");
  assert.match(source,/admin\?state\.requests:state\.requests\.filter\(\(item\)=>item\.requesterId===currentUser\?\.id\)/);
  assert.match(source,/\{admin&&<div className="company-rule-facts">/);
  assert.match(source,/\{admin&&<div className="company-tabs">/);
  assert.match(source,/\{admin&&tab==="campaigns"/);
  assert.match(source,/\{admin&&tab==="spend"/);
  assert.match(source,/\{admin&&tab==="assets"/);
  assert.match(source,/\{admin&&tab==="attribution"/);
  assert.match(source,/\{admin&&tab==="partnerships"/);
});

test("marketing focus links resolve exact record types before scrolling",()=>{
  const source=readFileSync(new URL("../components/pages/marketing.tsx",import.meta.url),"utf8");
  assert.match(source,/state\.requests\.some\(\(item\)=>item\.id===focus\)\?"requests"/);
  assert.match(source,/state\.campaigns\.some\(\(item\)=>item\.id===focus\)\?"campaigns"/);
  assert.match(source,/document\.getElementById\(`marketing-\$\{focus\}`\)\?\.scrollIntoView/);
  assert.match(source,/id=\{`marketing-\$\{item\.id\}`\}/);
});
