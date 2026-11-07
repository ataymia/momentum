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

// F10 data minimization: marketers see only approved asset metadata.
test("F10: document index excludes marketing drafts and retired assets for non-admin users",()=>{
 const source=readFileSync("components/prototype/documents-experience.tsx","utf8");
 assert(source.includes('marketing.assets.filter(m=>admin||m.status==="Approved")'));
});

// Clean initial marketing state is essential: nothing should look approved or budgeted without evidence.
test("F07: new marketing workspaces never invent a campaign, collateral approval or inventory",async()=>{
 const {createMarketingSeed}=await import("../lib/marketing-engine");
 const seed=createMarketingSeed();
 assert.equal(seed.campaigns.length,0);
 assert.equal(seed.assets.length,0);
 assert.equal(seed.materials.length,0);
 assert.equal(seed.spend.length,0);
});
test("F07: synthetic paid orders cannot influence the displayed campaign outcome engine",()=>{
 const source=readFileSync("lib/marketing-engine.ts","utf8");
 assert(source.includes('!order.testOnly&&linkedAccountIds.has(order.accountId)'));
 assert(source.includes('!order.testOnly&&orderIds.has(order.id)'));
});
