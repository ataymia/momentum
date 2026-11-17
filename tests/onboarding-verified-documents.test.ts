import assert from "node:assert/strict";
import test from "node:test";
import {onboardingReadiness} from "../lib/onboarding-engine";
import {createHcmSeed} from "../lib/hcm-engine";
import {createDemoData} from "../lib/demo-data";
import type {IdentityProvisioningRecord} from "../lib/identity-provisioning";

test("R44 required onboarding documents cannot complete activation by Available status alone",()=>{
 const data=createDemoData();
 const employee=data.users.find(u=>u.role!=="Customer");
 assert(employee);
 const base=createHcmSeed(data);
 const record={userId:employee.id,state:"Pending approval",passwordChangedAt:"2026-10-11T00:00:00Z"} as IdentityProvisioningRecord;
 const required=base.documents.filter(d=>d.userId===employee.id&&["Employment","Tax","Compensation"].includes(d.category));
 if(required.length===0)throw new Error("Fixture missing required documents");
 for(const doc of required){doc.status="Available";doc.verification=undefined;}
 const status=onboardingReadiness(base,record,employee.id);
 assert.equal(status.readyForActivation,false);
 assert.match(status.activationBlockers.join(" "),/verified original reference/);
});
test("R44 signed-version verification remains required when document version changes",()=>{
 const data=createDemoData();
 const user=data.users.find(u=>u.role!=="Customer");
 assert(user);
 const base=createHcmSeed(data);
 const docs=base.documents.filter(d=>d.userId===user.id&&["Employment","Tax","Compensation"].includes(d.category));
 for(const doc of docs){
   doc.status="Available";
   doc.verification={method:"External signed original",recordReference:"SECURE-ARCHIVE-EXAMPLE",verifiedAt:"2026-10-11T12:00:00Z",verifiedBy:"admin",documentVersion:doc.version-1};
 }
 const record={userId:user.id,state:"Pending approval",passwordChangedAt:"2026-10-11T00:00:00Z"} as IdentityProvisioningRecord;
 assert.equal(onboardingReadiness(base,record,user.id).readyForActivation,false);
});
