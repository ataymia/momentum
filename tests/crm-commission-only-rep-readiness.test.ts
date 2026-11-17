import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {commissionOnlyRepresentativeReview} from "../lib/commission-only-rep-readiness";
import type {HCMState} from "../lib/hcm-engine";
import type {WorkspaceData} from "../lib/types";

const data=()=>({
 users:[{id:"rep-1",name:"Alex Rep",role:"Sales Representative",employmentStatus:"Active"}],
 territories:[{id:"az",ownerId:"rep-1",status:"Active",postalCodes:["85018","85001"]}],
 orders:[{id:"ord-1",number:"MD-1",accountId:"loc-1",ownerId:"rep-1",creditedRepId:"rep-1",status:"Delivered",testOnly:false}],
 accounts:[],activities:[],
} as unknown as WorkspaceData);
const hcm=()=>({
 employees:[{userId:"rep-1",status:"Active",classification:"Contractor"}],
 documents:[{id:"plan-1",userId:"rep-1",title:"Signed commission-only sales agreement",category:"Compensation",
 status:"Available",version:2,verification:{method:"External signed original",documentVersion:2,verifiedBy:"admin",recordReference:"doc-sign-provider-id",verifiedAt:"2026-10-15T10:00:00Z"}}],
 compensation:[],
} as unknown as HCMState);

test("a reviewed contractor with signed commission-only agreement and territory still cannot auto-post pay",()=>{
 const row=commissionOnlyRepresentativeReview(data(),hcm(),"rep-1");
 assert.equal(row.activeDirectoryUser,true);
 assert.equal(row.verifiedCommissionOnlyAgreement,true);
 assert.deepEqual(row.activeTerritoryZips,["85001","85018"]);
 assert.equal(row.attributedOrders,1);
 assert.equal(row.missingExplicitAttribution,0);
 assert.equal(row.commissionRates.representative,0.025);
 assert.equal(row.commissionRates.managerOverride,0.005);
 assert.equal(row.commissionRates.combined,0.03);
 assert.equal(row.automaticPaymentEnabled,false);
 assert.ok(row.blockers.some(b=>b.includes("Commission payout is blocked")));
});

test("a generic or outdated signed document is not approval for commission-only pay",()=>{
 const bad=hcm();
 bad.documents[0]={...bad.documents[0],title:"Generic compensation plan"};
 let row=commissionOnlyRepresentativeReview(data(),bad,"rep-1");
 assert.equal(row.verifiedCommissionOnlyAgreement,false);
 bad.documents[0]={...hcm().documents[0],verification:{...hcm().documents[0].verification!,documentVersion:1}};
 row=commissionOnlyRepresentativeReview(data(),bad,"rep-1");
 assert.equal(row.verifiedCommissionOnlyAgreement,false);
});

test("worker classification, signed terms, active identity, and attribution are independent gates",()=>{
 const d=data(),h=hcm();
 d.users[0].employmentStatus="Separated";
 d.orders[0].creditedRepId=undefined;
 h.employees[0].classification="Not configured";
 h.compensation=[{userId:"rep-1",basis:"Hourly",rate:20,status:"Active"}] as HCMState["compensation"];
 const result=commissionOnlyRepresentativeReview(d,h,"rep-1");
 assert.equal(result.activeDirectoryUser,false);
 assert.equal(result.missingExplicitAttribution,1);
 assert.ok(result.blockers.some(s=>s.includes("worker classification")));
 assert.ok(result.blockers.some(s=>s.includes("hourly or salary")));
 assert.ok(result.blockers.some(s=>s.includes("directory identity")));
});

test("admin-only route and read-only review have no pay execution control",()=>{
 const registry=readFileSync("lib/navigation-route-registry.ts","utf8");
 const hub=readFileSync("components/prototype/operations-hub.tsx","utf8");
 const page=readFileSync("components/prototype/crm-commission-only-review.tsx","utf8");
 assert.match(registry,/path: "\/admin\/commission-readiness", permission: "audit"/);
 assert.match(registry,/"\/admin\/commission-readiness": "audit"/);
 assert.match(hub,/if\(path==="\/crm\/commission-only"\|\|path==="\/admin\/commission-readiness"\)return <CrmCommissionOnlyReview\/>/);
 assert.match(page,/currentUser\?\.role!=="Administrator"/);
 assert.match(page,/automaticPaymentEnabled:"No"/);
 assert.doesNotMatch(page,/buildBonusRun\(|setRunStatus\(|createDisbursement\(/);
});
