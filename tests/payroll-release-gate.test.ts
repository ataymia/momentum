import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {canMutatePayroll} from "../lib/payroll-release-gate";
import type {Role} from "../lib/types";
test("F04: payroll mutations are restricted to administrator in isolated local demo",()=>{
 assert.equal(canMutatePayroll("Administrator",true,"local"),true);
 assert.equal(canMutatePayroll("Administrator",true,"firestore"),false);
 assert.equal(canMutatePayroll("Administrator",false,"local"),false);
 assert.equal(canMutatePayroll("Administrator",false,"firestore"),false);
 for(const role of ["Sales Manager","Operations","Marketing","Warehouse","Sales Representative","Customer",undefined] as (Role|undefined)[]){
  assert.equal(canMutatePayroll(role,true,"local"),false);
 }
});
test("F04: payroll provider interlocks all mutators and forbids connected auto-persistence",()=>{
 const src=readFileSync("lib/payroll-context-v2.tsx","utf8");
 assert.match(src,/const isAdmin=canMutatePayroll\(currentUser\?\.role,runtime\.isDemo,momentumStorage\.mode\(\)\)/);
 assert.match(src,/if\(typeof window==="undefined"\|\|!runtime\.isDemo\|\|momentumStorage\.mode\(\)!=="local"\)return;/);
 assert.match(src,/const setRunStatus=\(.*?if\(!isAdmin\|\|!currentUser\)return false/);
 assert.match(src,/const settleDisbursement=\(.*?if\(!isAdmin\)return false/);
});
