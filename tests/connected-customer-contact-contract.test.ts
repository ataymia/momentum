import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const load=(path:string)=>readFileSync(path,"utf8");

test("connected customer setup has a true source write, revision and readback; sensitive fields remain excluded",()=>{
 const server=load("functions/src/trusted-customer-contact.ts");
 const endpoint=load("functions/src/index.ts");
 const api=load("lib/firebase-customer-contact.ts");
 const screen=load("components/prototype/crm-account-setup.tsx");
 const rules=load("firestore.rules");
 const generator=load("scripts/generate-firestore-rules.ts");
 assert(server.includes("updateTrustedCustomerContacts"));
 assert(server.includes('["Administrator","Sales Manager"]'));
 assert(server.includes("expectedRevision"));
 assert(server.includes("contactRevision"));
 assert(server.includes("customerContactUpdateAudit/"));
 assert(server.includes("customerContactUpdateKeys/"));
 assert(server.includes("creditApproved:false,financialPosting:false"));
 assert(server.includes('["Not started","Prepared"]'));
 for(const forbidden of ['"ein",','"creditStatus",','"taxDocumentType",','"paymentTerms",']){
  assert(!server.slice(server.indexOf("const allowed:readonly ContactField[]"),server.indexOf("const nameFields")).includes(forbidden));
 }
 assert(endpoint.includes("export const updateCustomerContacts="));
 assert(endpoint.includes("verifyIdToken(token,true)"));
 assert(api.includes('firebaseFunctionUrl("updateCustomerContacts")'));
 assert(api.includes("getFirestoreSnapshot"));
 assert(api.includes("contactRevision===data.revision"));
 assert(screen.includes("saveConnectedCustomerContacts"));
 assert(screen.includes("connectedContactEdit"));
 assert(screen.includes("pendingContactRequest"));
 assert(screen.includes("customer.contactRevision??0"));
 assert(screen.includes("In connected mode only ordinary billing and A/P contacts"));
 assert(rules.includes("match /customerContactUpdateAudit/{eventId}"));
 assert(rules.includes("match /customerContactUpdateKeys/{requestId}"));
 assert(generator.includes("match /customerContactUpdateAudit/{eventId}"));
});
