import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {classificationForWorkerType} from "../lib/hr-worker-classification";
test("worker classifications are explicit and separate from pay basis",()=>{
 assert.equal(classificationForWorkerType("Not selected","Hourly"),"Not configured");
 assert.equal(classificationForWorkerType("Not selected","Salary per pay period"),"Not configured");
 assert.equal(classificationForWorkerType("Contractor","Hourly"),"Contractor");
 assert.equal(classificationForWorkerType("Contractor","Salary per pay period"),"Contractor");
 assert.equal(classificationForWorkerType("Employee","Hourly"),"Hourly");
 assert.equal(classificationForWorkerType("Employee","Salary per pay period"),"Salary");
});
test("connected manual external-reference shortcut cannot certify a legal form",()=>{
 const ui=readFileSync("components/hcm/new-hire-provisioning.tsx","utf8");
 assert(ui.includes('workerType: "Not selected"'));
 assert(ui.includes('if (form.workerType === "Not selected")'));
 assert(ui.includes('!runtime.isDemo||momentumStorage.mode()!=="local"'));
 assert(ui.includes("Connected HR cannot verify a legal form from a typed reference"));
});
