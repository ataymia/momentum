import {readFileSync} from "node:fs";
import test,{before,after} from "node:test";
import {initializeTestEnvironment,assertFails,assertSucceeds,type RulesTestEnvironment} from "@firebase/rules-unit-testing";
import {doc,setDoc} from "firebase/firestore";
import {ref,uploadBytes,getBytes} from "firebase/storage";
let env:RulesTestEnvironment;
before(async()=>{
 env=await initializeTestEnvironment({projectId:"momentum-rules-test",firestore:{host:"127.0.0.1",port:8080,rules:readFileSync("firestore.rules","utf8")},storage:{host:"127.0.0.1",port:9199,rules:readFileSync("storage.rules","utf8")}});
 await env.withSecurityRulesDisabled(async context=>{
  for(const [uid,role,accountState] of [["marketing","Marketing","Active"],["rep","Sales Representative","Active"],["rep2","Sales Representative","Active"],["admin","Administrator","Active"],["separated","Marketing","Separated"],["customer","Customer","Active"]])await setDoc(doc(context.firestore(),`userAccess/${uid}`),{uid,role,accountState});
 });
});
after(async()=>{await env?.cleanup();});
test("Storage enforces draft/approved access, immutable versions, and revoked identities",async()=>{
 const path="marketing/asset/version/collateral.txt";
 const storage=(uid:string)=>env.authenticatedContext(uid).storage();
 await assertSucceeds(uploadBytes(ref(storage("marketing"),path),new Uint8Array([65]),{contentType:"text/plain"}));
 await assertFails(uploadBytes(ref(storage("rep"),"marketing/asset/other/collateral.txt"),new Uint8Array([66]),{contentType:"text/plain"}));
 await assertFails(getBytes(ref(storage("rep"),path)));
 await env.withSecurityRulesDisabled(async context=>{await setDoc(doc(context.firestore(),"marketingAssetVersions/version"),{status:"Approved",deleted:false});});
 await assertSucceeds(getBytes(ref(storage("rep"),path)));
 await assertFails(uploadBytes(ref(storage("marketing"),path),new Uint8Array([67]),{contentType:"text/plain"}));
 await assertFails(getBytes(ref(storage("separated"),path)));
 await assertFails(getBytes(ref(storage("customer"),path)));
 await env.withSecurityRulesDisabled(async context=>{await setDoc(doc(context.firestore(),"marketingAssetVersions/version"),{status:"Archived",deleted:true});});
 await assertFails(getBytes(ref(storage("rep"),path)));
});

test("signed employment PDFs are employee-private, admin-readable, immutable and never client-uploaded",async()=>{
 const path="hr-private/rep/W4/signed-001/signed.pdf";
 const certificate="hr-private/rep/W4/signed-001/certificate.pdf";
 const bytes=new Uint8Array([37,80,68,70,45,49,46,55]);
 await env.withSecurityRulesDisabled(async context=>{
  await uploadBytes(ref(context.storage(),path),bytes,{contentType:"application/pdf"});
  await uploadBytes(ref(context.storage(),certificate),bytes,{contentType:"application/pdf"});
 });
 const storage=(uid:string)=>env.authenticatedContext(uid).storage();
 await assertSucceeds(getBytes(ref(storage("rep"),path)));
 await assertSucceeds(getBytes(ref(storage("rep"),certificate)));
 await assertSucceeds(getBytes(ref(storage("admin"),path)));
 await assertFails(getBytes(ref(storage("rep2"),path)));
 await assertFails(getBytes(ref(storage("marketing"),path)));
 await assertFails(getBytes(ref(storage("customer"),path)));
 await assertFails(getBytes(ref(storage("separated"),path)));
 await assertFails(getBytes(ref(env.unauthenticatedContext().storage(),path)));
 await assertFails(uploadBytes(ref(storage("rep"),path),bytes,{contentType:"application/pdf"}));
 await assertFails(uploadBytes(ref(storage("admin"),path),bytes,{contentType:"application/pdf"}));
 await assertFails(uploadBytes(ref(storage("admin"),"hr-private/rep/W4/other/signed.pdf"),bytes,{contentType:"application/pdf"}));
});
