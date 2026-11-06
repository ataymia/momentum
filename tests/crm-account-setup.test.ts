import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {validateTaxIdentity} from "../lib/account-tax-identity";

const hub=()=>readFileSync("components/prototype/operations-hub.tsx","utf8");
const source=()=>readFileSync("components/prototype/crm-account-setup.tsx","utf8");
test("account setup is an independent route, not the legacy embedded form",()=>{
 assert.match(hub(),/if\(path==="\/crm\/account-setup"\)return <CrmAccountSetup\/>/);
 assert.match(source(),/function CrmAccountSetup/);
 assert.match(source(),/updateCustomerCommercial\(customer\.id,patch\)/);
 assert.match(source(),/validateTaxIdentity\(identity\)/);
});
test("account setup cannot write from connected mode or a customer login",()=>{
 assert.match(source(),/runtime\.isDemo&&momentumStorage\.mode\(\)==="local"/);
 assert.match(source(),/currentUser\.role==="Customer"/);
 assert.match(source(),/if\(!canEdit\|\|!customer\|\|!account\)/);
 assert.doesNotMatch(source(),/firebase\.deploy|sendEmail\(|createPayment\(/);
});
test("representatives cannot set credit terms: only management has status edit",()=>{
 assert.match(source(),/\.\.\.\(isManager\?\{creditStatus:/);
 assert.match(source(),/requestCredit/);
 assert.match(source(),/creditStatus:"Credit Requested"/);
});
test("tax identity guards reject invalid tax IDs without claiming signature compliance",()=>{
 assert.deepEqual(Object.keys(validateTaxIdentity({legalBusinessName:"",ein:"bad",azTptLicenseNumber:"abc",taxDocumentType:"Undetermined"})).includes("legalBusinessName"),true);
 assert.match(source(),/Tax-document route is informational|Tax document route/);
 assert.match(source(),/previously reviewed external package state/);
});
