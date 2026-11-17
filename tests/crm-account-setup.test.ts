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
test("account setup requires authorized manager or Administrator for connected contact writes and never allows customers",()=>{
 const src=source();
 assert.match(src,/runtime\.isDemo&&momentumStorage\.mode\(\)==="local"/);
 assert.match(src,/currentUser\.role==="Customer"/);
 assert.match(src,/connectedContactEdit=Boolean\(!runtime\.isDemo&&firebase\?\.session&&currentUser&&/);
 assert.match(src,/\["Administrator","Sales Manager"\]\.includes\(currentUser\.role\)/);
 assert.match(src,/if\(!canEditContacts\|\|!customer\|\|!account\|\|savingExisting\)/);
 assert.match(src,/if\(!canEdit\)/);
 assert.match(src,/saveConnectedCustomerContacts\(firebase\.session,payload,pendingContactRequest\.current\.id\)/);
 assert.doesNotMatch(src,/firebase\.deploy|sendEmail\(|createPayment\(/);
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

test("Account Setup now starts with new business creation and preserves existing identity completion",()=>{
 const sourceCode=source();
 assert.match(sourceCode,/useState<"new"\|"existing">\("new"\)/);
 assert.match(sourceCode,/validateLeadCreateDraft\(draft,scope\.accounts\)/);
 assert.match(sourceCode,/createAccount\(result\.payload,result\.territoryReason\)/);
 assert.match(sourceCode,/setMode\("existing"\)/);
 assert.match(sourceCode,/setAccountId\(id\)/);
 assert.match(sourceCode,/aria-label="Create new customer account"/);
 assert.match(sourceCode,/aria-label="Customer account setup"/);
 assert.match(sourceCode,/duplicateId&&/);
 assert.match(sourceCode,/No pricing, orders, bonuses, tax verification or external commitments/);
});

test("new-account hydration cannot fall back to editing an unrelated existing customer",()=>{
  const src=source();
  assert.match(src,/const account=accountId\?scope\.accounts\.find\(a=>a\.id===accountId\):scope\.accounts\[0\]/);
  assert.doesNotMatch(src,/scope\.accounts\.find\(a=>a\.id===accountId\)\|\|scope\.accounts\[0\]/);
});

test("connected manager creation and billing-contact editing are guarded; tax and credit edits remain demo-only",()=>{
 const src=source();
 assert.match(src,/connectedCreate=Boolean/);
 assert.match(src,/canCreateNew=canEdit\|\|connectedCreate/);
 assert.match(src,/receipt\.readbackVerified/);
 assert.match(src,/connectedContactEdit=Boolean/);
 assert.match(src,/canEditContacts=canEdit\|\|connectedContactEdit/);
 assert.match(src,/if\(!canEdit\)/);
 assert.match(src,/const saved=updateCustomerCommercial\(customer\.id,patch\)/);
 assert.match(src,/Contact update was accepted by the server but current source readback is incomplete/);
});

test("new connected accounts hydrate the source before opening existing-account setup",()=>{
 const src=source();
 assert.match(src,/momentumStorage\.refreshKeys\(\["momentum-demo-workspace-v5"\]\)/);
 assert.match(src,/if\(!refreshed\.ok\)/);
});
