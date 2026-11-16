import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

test("connected lead workflows require server decisions, provenance and readback",()=>{
 const server=readFileSync("functions/src/trusted-crm-lead.ts","utf8");
 const index=readFileSync("functions/src/index.ts","utf8");
 const client=readFileSync("lib/firebase-crm-lead.ts","utf8");
 const screen=readFileSync("components/prototype/operations-hub.tsx","utf8");
 assert.match(index,/export const changeCrmLead=onRequest/);
 assert.match(index,/verifyIdToken\(token,true\)/);
 for(const marker of ["db.runTransaction","crmLeadChangeRequests","crmLeadEvents",
   "expectedStage","expectedOwnerId","Historical order credit and distribution rights unchanged"])
   assert(server.includes(marker),marker);
 assert(client.includes("getFirestoreSnapshot"));
 assert(client.includes("readbackVerified"));
 assert(screen.includes("changeConnectedCrmLead"));
 assert(screen.includes("window.location.reload()"));
 assert(screen.includes("demoLeadWrite"));
});
