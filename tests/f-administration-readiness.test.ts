import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
test("F11: administration must not falsely mark payment processor, payroll, hosting or storage production-ready",()=>{
 const page=readFileSync("components/pages/settings-v3.tsx","utf8");
 for(const unsupported of [
   "Helcim is the selected tokenized processor","Processor selected; live rail integration pending",
   'provider:"Cloudflare"','status:"Connected", tone:"success"',
   'status:"Product layer built", tone:"success"','"Product-complete demo layer"'
 ]) assert(!page.includes(unsupported),"unsupported readiness claim: "+unsupported);
 for(const required of ["Production release blocked","No processor or live payment rail verified","Connected-mode preview, release not accepted"])
   assert(page.includes(required),"missing truthful readiness disclosure: "+required);
});
test("F03: attendance table sorting never mutates the scoped timecards",()=>{
 const source=readFileSync("components/prototype/hr-attendance-experience.tsx","utf8");
 assert(source.includes("[...visibleTimecards].sort("));
 assert(!source.includes("{visibleTimecards.sort("));
});
