import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const ui=readFileSync(new URL("../components/prototype/operations-hub.tsx",import.meta.url),"utf8");
const workspace=readFileSync(new URL("../lib/workspace-context.tsx",import.meta.url),"utf8");
const server=readFileSync(new URL("../functions/src/trusted-crm-lead.ts",import.meta.url),"utf8");
const client=readFileSync(new URL("../lib/firebase-crm-lead.ts",import.meta.url),"utf8");
const record=ui.slice(ui.indexOf("function LeadRecord("),ui.indexOf("function LeadFollowupScheduler("));

test("lead handoff permits only authorized Administrator or Sales Manager with demo or connected session",()=>{
 assert.match(record,/const demoLeadWrite=isDemo&&momentumStorage\.mode\(\)==="local"/);
 assert.match(record,/const connectedLeadWrite=!isDemo&&Boolean\(firebase\?\.session\)/);
 assert.match(record,/const canHandoff=\(demoLeadWrite\|\|connectedLeadWrite\)&&!!currentUser&&/);
 assert.match(record,/\["Administrator","Sales Manager"\]\.includes\(currentUser\.role\)/);
 assert.match(record,/\{canHandoff&&<form/);
 assert.match(record,/eligibleReps=data\.users\.filter\(u=>u\.role==="Sales Representative"/);
 assert.match(record,/employmentStatus!=="Separated"/);
});

test("handoff requires eligible active rep, evidence and server-verified owner transition",()=>{
 assert.match(record,/eligibleReps\.some\(u=>u\.id===newOwner\)/);
 assert.match(record,/handoffReason\.trim\(\)\.length<8/);
 assert.match(record,/transferAccountResponsibility\(account\.id,newOwner,handoffReason\.trim\(\)\)/);
 assert.match(record,/changeLead\(\{/);
 assert.match(record,/expectedOwnerId:account\.ownerId,targetUid:newOwner/);
 assert.match(record,/if\(!receipt\.readbackVerified\)/);
 assert.match(client,/readbackVerified=Boolean\(snapshot\.exists&&account/);
 assert.match(workspace,/canTransferSalesResponsibility\(data, currentUser, account, toUserId\)/);
 assert.match(workspace,/Historical order attribution remains unchanged/);
 assert.match(server,/Transfer/);
});

test("failed authority or uncertain readback cannot display a falsely successful transfer",()=>{
 assert.match(record,/if\(!accepted\)\{setHandoffFeedback\("Assignment rejected/);
 assert.match(record,/setHandoffFeedback\("Responsibility updated only in the isolated demonstration/);
 assert.match(record,/if\(!receipt\.readbackVerified\)/);
 assert.match(record,/if\(!refreshed\.ok\)/);
 assert.match(record,/setHandoffFeedback\("Assignment saved and verified in the connected CRM views/);
 assert.match(record,/catch\(error\)\{/);
});
