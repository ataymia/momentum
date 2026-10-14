import {readFileSync} from "node:fs";
import test,{before,after} from "node:test";
import {initializeTestEnvironment,assertFails,assertSucceeds,type RulesTestEnvironment} from "@firebase/rules-unit-testing";
import {doc,setDoc} from "firebase/firestore";
import {ref,uploadBytes,getBytes} from "firebase/storage";
let env:RulesTestEnvironment;
before(async()=>{
 env=await initializeTestEnvironment({projectId:"momentum-rules-test",firestore:{host:"127.0.0.1",port:8080,rules:readFileSync("firestore.rules","utf8")},storage:{host:"127.0.0.1",port:9199,rules:readFileSync("storage.rules","utf8")}});
 await env.withSecurityRulesDisabled(async context=>{
  for(const [uid,role,accountState] of [["marketing","Marketing","Active"],["rep","Sales Representative","Active"],["separated","Marketing","Separated"],["customer","Customer","Active"]])await setDoc(doc(context.firestore(),`userAccess/${uid}`),{uid,role,accountState});
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
