import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
const require=createRequire(import.meta.url);
const policy=require("../functions/src/support-case-policy.ts") as typeof import("../functions/src/support-case-policy");
const {validateCaseCommand,validSupportRequestId,canSeeAccount,canSeeSupportCase,applyCaseCommand}=policy;
const actor={uid:"rep-a",role:"Sales Representative" as const,accountState:"Active"};
const admin={uid:"admin",role:"Administrator" as const,accountState:"Active"};
const account={id:"acc-a",ownerId:"rep-a"};
const seed={id:"case-a",title:"Damaged shipment",description:"Original cases were dented",
 accountId:"acc-a",category:"Delivery" as const,priority:"High" as const,
 status:"Open" as const,createdBy:"rep-a",ownerId:"rep-a",createdAt:"2026-11-10",
 updatedAt:"2026-11-10",revision:1,
 history:[{id:"event-a",at:"2026-11-10",actorId:"rep-a",action:"Created" as const,detail:"Initial report"}]};
test("R62 server refuses actor/ledger forgery and malformed support drafts",()=>{
 const draft={kind:"create",draft:{title:"Damaged shipment",description:"Original cases were dented",
  accountId:"acc-a",category:"Delivery",priority:"High"}};
 assert.equal(validateCaseCommand(draft).ok,true);
 for(const field of ["createdBy","ownerId","status","history","revision","updatedAt","paidAmount","auditedBy"]){
  assert.equal(validateCaseCommand({...draft,draft:{...draft.draft,[field]:"forged"}}).ok,false,field);
 }
 assert.equal(validateCaseCommand({...draft,draft:{...draft.draft,accountId:123}}).ok,false);
 assert.equal(validateCaseCommand({...draft,draft:{...draft.draft,orderId:"foreign"}}).ok,true,
  "A syntactically valid order ID is checked against the actual canonical account transactionally");
 assert.equal(validateCaseCommand({...draft,draft:{...draft.draft,orderId:"../foreign"}}).ok,false);
 assert(readFileSync("functions/src/support-case-service.ts","utf8").includes('str(linked.accountId)!==accountId'));
 assert.equal(validSupportRequestId("x".repeat(36)),true);
 assert.equal(validSupportRequestId("../invalid"),false);
 assert.equal(validSupportRequestId("short"),false);
});
test("R62 server visibility requires both linked-account scope and case ownership",()=>{
 assert.equal(canSeeAccount(actor,account),true);
 assert.equal(canSeeAccount({...actor,uid:"rep-b"},account),false);
 assert.equal(canSeeSupportCase(actor,seed,true),true);
 assert.equal(canSeeSupportCase(actor,seed,false),false);
 assert.equal(canSeeSupportCase({...actor,uid:"rep-b"},seed,true),false);
 assert.equal(canSeeSupportCase(admin,seed,false),true);
 const mgr={uid:"mgr",role:"Sales Manager" as const,accountState:"Active",managedTeams:["Sales"]};
 assert.equal(canSeeAccount(mgr,account,{uid:"rep-a",role:"Sales Representative",
   accountState:"Active",team:"Sales"}),true);
 assert.equal(canSeeAccount(mgr,account,{uid:"rep-a",role:"Sales Representative",
   accountState:"Separated",team:"Sales"}),false);
});
test("R62 server case revisions enforce allowed actions and append-only history",()=>{
 const noted=applyCaseCommand(seed,{kind:"note",caseId:seed.id,revision:1,value:"Spoke with buyer"},actor,
   "event-b","2026-11-11");assert(noted);
 assert.equal(noted.revision,2);
 assert.equal(noted.history.length,2);
 assert.equal(applyCaseCommand(seed,{kind:"status",caseId:seed.id,revision:1,value:"Resolved",
  reason:"Already done"},admin,"e2","2026-11-11"),null);
 assert.equal(applyCaseCommand(seed,{kind:"note",caseId:seed.id,revision:2,value:"Stale"},actor,
  "e2","2026-11-11"),null);
 const progressing=applyCaseCommand(seed,{kind:"status",caseId:seed.id,revision:1,
  value:"Investigating",reason:"Investigating source evidence"},admin,"e3","2026-11-11");
 assert(progressing);assert.equal(progressing.status,"Investigating");
 assert.equal(seed.history.length,1);
});
test("R62 connected support is server-authenticated, scoped and never reads demo records",()=>{
 const server=readFileSync("functions/src/support-case-service.ts","utf8");
 const index=readFileSync("functions/src/index.ts","utf8");
 const client=readFileSync("lib/firebase-support-cases.ts","utf8");
 const ui=readFileSync("components/prototype/support-cases-experience.tsx","utf8");
 const rules=readFileSync("firestore.rules","utf8");
 assert(index.includes('export {supportCasesApi} from "./support-case-service"'));
 assert(server.includes("verifyIdToken(token,true)"));
 assert(server.includes('db.collection("supportCases").orderBy("updatedAt","desc").limit(201)'));
 assert(server.includes("canSeeSupportCase"));
 assert(server.includes("tx.create(requestRef"));
 assert(server.includes("validSupportRequestId"));
 assert(client.includes('firebaseFunctionUrl("supportCasesApi")'));
 assert(ui.includes("readConnectedSupportCases"));
 assert(ui.includes("writeConnectedSupportCase"));
 assert(ui.includes('const permitted=demo?items.filter('));
 assert(!rules.includes("match /supportCases/{"));
 assert(rules.includes("allow read, write: if false;"));
});
