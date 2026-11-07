import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
const source=readFileSync(new URL("../components/prototype/operations-hub.tsx",import.meta.url),"utf8");
const record=source.slice(source.indexOf("function LeadRecord("),source.indexOf("function LeadFollowupScheduler("));
test("lead detail uses an addressable route and only authorized scoped accounts",()=>{
  assert.match(source,/segments\[1\]==="leads"&&segments\[2\]/);
  assert.match(record,/scope\.accounts\.find\(a=>a\.id===id/);
  assert.match(record,/outside your authorized workspace/);
  assert.match(record,/\["Prospect","Qualified","Sampled"\]\.includes\(a\.stage\)/);
});
test("lead record links to existing scheduling, account, contact and canonical orders",()=>{
  assert.match(record,/LeadFollowupScheduler accountId=\{id\}/);
  assert.match(record,/scope\.activities\.filter\(a=>a\.accountId===id/);
  assert.match(record,/scope\.orders\.filter\(o=>o\.accountId===id&&!o\.testOnly/);
  assert.match(record,/\/sales\/orders\//);
  assert.match(record,/\/sales\/customers\//);
  assert.match(record,/\/crm\/contacts\//);
});
test("lead directory links to detail rather than routing every lead to account view",()=>{
  assert.match(source,/\/crm\/leads\/"\+encodeURIComponent\(a\.id\)/);
});
