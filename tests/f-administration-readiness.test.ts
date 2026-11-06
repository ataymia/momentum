import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
test("F11: administration must not falsely mark payment processor, payroll, hosting or storage production-ready",()=>{
 const page=readFileSync("components/pages/settings-v3.tsx","utf8");
 for(const unsupported of [
   "Helcim is the selected tokenized processor",
   'status:"Product layer built", tone:"success"','"Product-complete demo layer"'
 ]) assert(!page.includes(unsupported),"unsupported readiness claim: "+unsupported);
 for(const required of ["Production release blocked","Processor selected; live rail integration pending","Connected-mode preview, release not accepted",'provider:"Cloudflare"','provider:"Helcim"',"live integration deferred"])
   assert(page.includes(required),"missing differentiated readiness disclosure: "+required);
});
test("F03: attendance table sorting never mutates the scoped timecards",()=>{
 const source=readFileSync("components/prototype/hr-attendance-experience.tsx","utf8");
 assert(source.includes("[...visibleTimecards].sort("));
 assert(!source.includes("{visibleTimecards.sort("));
});
