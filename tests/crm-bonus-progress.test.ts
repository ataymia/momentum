import assert from "node:assert/strict";
import test from "node:test";
import { accountBonusProgress } from "../lib/bonus-progress";
import type { BonusMilestone } from "../lib/bonus-engine";

const milestone = (accountId: string, repId: string, milestone: BonusMilestone["milestone"], observedCases: number, status: BonusMilestone["status"]): BonusMilestone => ({
  id: accountId + "-" + milestone, accountId, repId, milestone,
  amount:25, thresholdCases:milestone === "Opening order" ? 10 : 40,
  observedCases, status, evidenceOrderIds:[], ruleNote:"Test only", windowEnd:"2026-12-01",
});
const sample: BonusMilestone[] = [
  milestone("a", "rep-1", "Opening order", 10, "Earned"),
  milestone("a", "rep-1", "Sustained account", 28, "Tracking"),
  milestone("b", "rep-2", "Opening order", 10, "Earned"),
  milestone("b", "rep-2", "Sustained account", 40, "Earned"),
];

test("a 10-case opening plus 28 settled total produces 28/40, never 38/40 or a 20-case award", () => {
  const rows = accountBonusProgress(sample);
  const a = rows.find(row => row.accountId === "a")!;
  assert.equal(a.settledCases, 28);
  assert.equal(a.remainingCases, 12);
  assert.equal(a.percent, 70);
  assert.equal(a.opening.thresholdCases, 10);
  assert.equal(a.sustained.thresholdCases, 40);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row=>row.accountId), ["b","a"]);
});

test("real rep and status filters preserve the two distinct earning gates", () => {
  assert.deepEqual(accountBonusProgress(sample,{repId:"rep-1"}).map(x=>x.accountId),["a"]);
  assert.deepEqual(accountBonusProgress(sample,{status:"Tracking"}).map(x=>x.accountId),["a"]);
  assert.deepEqual(accountBonusProgress(sample,{status:"Earned"}).map(x=>x.accountId),["b","a"]);
  assert.deepEqual(accountBonusProgress(sample,{repId:"rep-2",status:"Tracking"}),[]);
});

test("account search and bidirectional sort remain deterministic", () => {
  const accountNames = new Map([["a","Corner Market"],["b","Food Mart"]]);
  const repNames = new Map([["rep-1","Morgan"],["rep-2","Alex"]]);
  assert.deepEqual(accountBonusProgress(sample,{accountNames,accountSearch:"Corner"}).map(x=>x.accountId),["a"]);
  assert.deepEqual(accountBonusProgress(sample,{sort:"representative",repNames}).map(x=>x.accountId),["b","a"]);
  assert.deepEqual(accountBonusProgress(sample,{sort:"remaining",direction:"desc"}).map(x=>x.accountId),["a","b"]);
});

test("duplicate, missing or inconsistent milestone rows never create duplicate progress or attribution", () => {
  assert.equal(accountBonusProgress([...sample,sample[0]]).length,2);
  assert.deepEqual(accountBonusProgress([sample[0]]),[]);
  assert.deepEqual(accountBonusProgress([sample[0],{...sample[1],repId:"other"}]),[]);
});

test("progress is bounded but never inflates when source data is invalid", () => {
  assert.equal(accountBonusProgress([sample[0],{...sample[1],observedCases:70}])[0].percent,100);
  assert.equal(accountBonusProgress([sample[0],{...sample[1],observedCases:-2}])[0].settledCases,0);
  assert.deepEqual(accountBonusProgress([sample[0],{...sample[1],thresholdCases:0}]),[]);
});
