import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {reviewLeadQualification} from "../lib/lead-qualification";

test("assigned rep may progress qualified leads, never reverse or skip stages",()=>{
 assert.equal(reviewLeadQualification("Sales Representative","rep1","rep1","Prospect","Qualified","Buyer contacted").ok,true);
 assert.equal(reviewLeadQualification("Sales Representative","rep1","rep1","Qualified","Sampled","Sample accepted").ok,true);
 assert.equal(reviewLeadQualification("Sales Representative","rep1","rep1","Prospect","Sampled","Try to skip").ok,false);
 assert.equal(reviewLeadQualification("Sales Representative","rep1","rep1","Sampled","Qualified","Reverse stage").ok,false);
 assert.equal(reviewLeadQualification("Sales Representative","rep2","rep1","Prospect","Qualified","Another owner").ok,false);
});
test("manager can correct a sampled lead with reason, but never change an ordered account",()=>{
 assert.equal(reviewLeadQualification("Sales Manager","mgr","rep1","Sampled","Qualified","Correct recorded stage").ok,true);
 assert.equal(reviewLeadQualification("Administrator","admin","rep1","Opening order","Qualified","Do not reverse order").ok,false);
 assert.equal(reviewLeadQualification("Sales Manager","mgr","rep1","Placed","Sampled","Do not reverse history").ok,false);
 assert.equal(reviewLeadQualification("Customer","customer","rep1","Prospect","Qualified","Customer cannot edit").ok,false);
 assert.equal(reviewLeadQualification("Sales Manager","mgr","rep1","Prospect","Qualified","").ok,false);
});
test("LeadRecord delegates local-demo stage changes through authorized audited workspace",()=>{
 const ui=readFileSync("components/prototype/operations-hub.tsx","utf8");
 const workspace=readFileSync("lib/workspace-context.tsx","utf8");
 assert.match(ui,/qualifyLead\(account\.id,target,qualificationReason\)/);
 assert.match(ui,/isDemo&&momentumStorage\.mode\(\)==="local"/);
 assert.match(workspace,/reviewLeadQualification\(currentUser\.role,currentUser\.id,account\.ownerId,account\.stage,nextStage,reason\)/);
 assert.match(workspace,/title:"Lead qualification updated"/);
 assert.match(workspace,/accountPatches:/);
 assert.match(workspace,/qualifyLead,/);
});
