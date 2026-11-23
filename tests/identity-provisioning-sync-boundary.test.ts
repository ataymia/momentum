import assert from "node:assert/strict";
import test, {describe} from "node:test";
import {canPersistIdentityProvisioning,IDENTITY_PROVISIONING_STORAGE_KEY} from "../lib/identity-provisioning";
import {DOMAIN_BY_KEY,domainDocuments,userDocPath,sharedDocPath} from "../lib/firestore-domains";
import type {PersistenceScope} from "../lib/firebase-access";

const scope=(role:PersistenceScope["role"],state:PersistenceScope["accountState"]="Active"):PersistenceScope=>({
  uid:"rep-1",role,accountState:state,readableUserIds:new Set(["rep-1"]),
  managedUserIds:new Set(),supervisedBrandAmbassadorIds:new Set(),
});

describe("onboarding domain is not an active rep CRM sync dependency",()=>{
  test("active employees and unrelated sessions cannot save HR identity state",()=>{
    const rep={id:"rep-1",role:"Sales Representative" as const};
    assert.equal(canPersistIdentityProvisioning(rep,rep.id,"Active"),false);
    assert.equal(canPersistIdentityProvisioning(rep,rep.id,"Suspended"),false);
    assert.equal(canPersistIdentityProvisioning(rep,rep.id,undefined),false);
    assert.equal(canPersistIdentityProvisioning(rep,"other","Onboarding"),false);
    assert.equal(canPersistIdentityProvisioning(rep,null,"Onboarding"),false);
    assert.equal(canPersistIdentityProvisioning({id:"rep-1",role:"Customer"},rep.id,"Onboarding"),false);
  });
  test("employees can save real pre-activation records while only an active admin manages drafts",()=>{
    const rep={id:"rep-1",role:"Sales Representative" as const};
    for(const state of ["Password change required","Onboarding","Pending approval"] as const)
      assert.equal(canPersistIdentityProvisioning(rep,rep.id,state),true,state);
    assert.equal(canPersistIdentityProvisioning({id:"rep-1",role:"Administrator"},"rep-1","Active"),true);
    assert.equal(canPersistIdentityProvisioning({id:"rep-1",role:"Administrator"},"rep-1","Onboarding"),false);
  });
  test("a rep's own records shard is readable/writable without accessing admin drafts",()=>{
    const spec=DOMAIN_BY_KEY.get(IDENTITY_PROVISIONING_STORAGE_KEY)!;
    for(const accountState of ["Active","Onboarding","Password change required"] as const){
      const docs=domainDocuments(spec,scope("Sales Representative",accountState));
      assert.ok(docs.some(doc=>doc.path===userDocPath("rep-1","identity","records")&&doc.writable));
      assert.ok(!docs.some(doc=>doc.path===sharedDocPath("identity","drafts")));
      assert.ok(!docs.some(doc=>doc.path===sharedDocPath("identity","records")));
      assert.ok(!docs.some(doc=>doc.path===sharedDocPath("identity","_root")));
    }
    const adminDocs=domainDocuments(spec,scope("Administrator"));
    assert.ok(adminDocs.some(doc=>doc.path===sharedDocPath("identity","drafts")&&doc.writable));
  });
});
