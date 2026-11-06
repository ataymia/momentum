import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {creditCanApprove} from "../lib/commerce-engine";
test("credit lifecycle requires a second administrator and demo-only finance mutation",()=>{
 const c={id:"c1",invoiceId:"i1",createdAt:"2026-11-06",createdBy:"admin-1",status:"Draft" as const,amount:24,reason:"Verified"};
 assert.equal(creditCanApprove(c,"admin-1"),false);
 assert.equal(creditCanApprove(c,"admin-2"),true);
 const s=readFileSync("components/prototype/credit-workflow-preview.tsx","utf8");
 assert.match(s,/isDemo&&momentumStorage\.mode\(\)==="local"&&role==="Administrator"/);
 assert.match(s,/creditCanApprove\(credit,currentUser\.id\)/);
 assert.match(s,/creditCanApply\(commerce,credit\)/);
 assert.doesNotMatch(s,/\brecordPayment\(/);
 assert.doesNotMatch(s,/\brequestRefund\(/);
});
test("credit workflow is reachable from both invoice and credit note detail",()=>{
 assert.match(readFileSync("components/prototype/commerce-experience.tsx","utf8"),/<CreditCreatePanel invoiceId=\{invoice\.id\}/);
 assert.match(readFileSync("components/prototype/returns-credits-experience.tsx","utf8"),/<CreditDecisionPanel creditId=\{credit\.id\}/);
});
