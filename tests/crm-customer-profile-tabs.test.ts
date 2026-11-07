import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

const hub=()=>readFileSync("components/prototype/operations-hub.tsx","utf8");
const sections=()=>readFileSync("components/prototype/crm-customer-record-sections.tsx","utf8");

test("customer profile provides Overview, Comments, Transactions, Mails, Statements, Locations, Documents, Reps, and Activity",()=>{
 const source=hub();
 for(const key of ["overview","comments","transactions","mails","statements","locations","documents","representatives","activity"]){
   assert.match(source,new RegExp('key:"'+key+'"'));
 }
 assert.match(source,/tab==="documents"&&<CrmCustomerDocuments/);
 assert.match(source,/tab==="representatives"&&<CrmCustomerRepresentatives/);
 assert.match(source,/tab==="activity"&&<CrmCustomerActivity/);
});

test("internal activity is per visible location, excludes seeded mirrors and blocks customer login",()=>{
 const s=sections();
 assert.match(s,/canonicalActivities\.filter\(a=>a\.accountId&&ids\.has\(a\.accountId\)\)/);
 assert.match(s,/crm\.interactions\.filter\(item=>ids\.has\(item\.locationId\)&&!canonicalIds\.has\(item\.id\)\)/);
 assert.match(s,/currentUser\.role==="Customer"/);
 assert.match(s,/downloadCsv\("momentum-customer-activity\.csv"/);
 assert.match(s,/Customer activity from/);
 assert.match(s,/Customer activity through/);
});

test("document tab accurately distinguishes missing attachments from verification without fake downloads",()=>{
 const s=sections();
 assert.match(s,/taxDocumentType/);
 assert.match(s,/taxExemptionStatus/);
 assert.match(s,/onboardingPackageStatus/);
 assert.match(s,/No authenticated document vault/);
 assert.match(s,/does not create, sign, verify or download documents/);
 assert.doesNotMatch(s,/getDownloadURL\(|uploadBytes\(|document\.fileURL/);
});

test("rep history is scoped, historical and separate from current owner and order credit",()=>{
 const s=sections();
 assert.match(s,/crm\.responsibilityHistory\.filter\(event=>ids\.has\(event\.locationId\)\)/);
 assert.match(s,/a\.originatorId/);
 assert.match(s,/a\.ownerId/);
 assert.match(s,/a\.closerId/);
 assert.match(s,/Transfers cannot rewrite old orders/);
 assert.doesNotMatch(s,/transferAccountResponsibility\(/);
});
