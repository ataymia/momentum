/* eslint-disable @typescript-eslint/no-require-imports */
const {test,after}=require("node:test");
const assert=require("node:assert/strict");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getFirestore}=require("firebase-admin/firestore");
const {getStorage}=require("firebase-admin/storage");
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_STORAGE_EMULATOR_HOST)throw Error("Emulators only");
const app=initializeApp({projectId:"momentum-rules-test",storageBucket:"momentum-rules-test.firebasestorage.app"});
const db=getFirestore(app);
const {customerDocumentAction:act}=require("../lib/customer-documents.js");
after(()=>deleteApp(app));
test("Customer document archive scopes location, preserves bytes, rejects unauthorized reads and independent self-review",async()=>{
 const a="qa-document-customer",b="qa-document-other",admin="qa-document-admin",suspended="qa-document-suspended",loc="qa-document-location",other="qa-document-other-location";
 for(const [uid,role,accountState,accountIds] of [[a,"Customer","Active",[loc]],[b,"Customer","Active",[other]],[admin,"Administrator","Active",[]],[suspended,"Administrator","Suspended",[]]]){
  await db.doc("userAccess/"+uid).set({uid,role,accountState,email:uid+"@example.invalid"});
  await db.doc("employeeDirectory/"+uid).set({uid,role,email:uid+"@example.invalid",accountIds});
 }
 const source=db.doc("domains/workspace/fields/accounts");
 const prior=(await source.get()).data()||{};
 await source.set({...prior,items:[...(prior.items||[]).filter(r=>r.id!==loc&&r.id!==other),{id:loc,customerId:a,name:"QA customer"},{id:other,customerId:b,name:"QA other"}]});
 const original=Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
 const input={action:"upload",accountId:loc,title:"QA certificate",category:"Resale certificate",attested:true,pdfBase64:original.toString("base64")};
 await assert.rejects(act(b,input),/access/);
 await assert.rejects(act(a,{...input,attested:false}),/confirmation/);
 const first=await act(a,input),retry=await act(a,input);assert.equal(first.id,retry.id);
 const list=await act(a,{action:"list",accountId:loc});assert.equal(list.records.length,1);assert.equal(list.records[0].status,"Submitted for review");
 assert.equal(list.records[0].storagePath,undefined);
 await assert.rejects(act(b,{action:"download",accountId:other,id:first.id}),/access/);
 await assert.rejects(act(suspended,{action:"list",accountId:loc}),/access/);
 await assert.rejects(act(a,{action:"review",accountId:loc,id:first.id,status:"Reviewed",note:"QA review"}),/Independent/);
 await act(admin,{action:"review",accountId:loc,id:first.id,status:"Reviewed",note:"QA document received; tax validity not established"});
 assert.equal((await act(a,{action:"list",accountId:loc})).records[0].status,"Reviewed");
 const downloaded=await act(a,{action:"download",accountId:loc,id:first.id});
 assert.deepEqual(Buffer.from(downloaded.pdfBase64,"base64"),original);
 assert.equal((await db.collection("customerDocumentAccess").where("documentId","==",first.id).get()).size,1);
 assert.equal((await getStorage(app).bucket().file("customer-private/"+loc+"/"+first.id+".pdf").exists())[0],true);
 await source.set({...prior,items:[...(prior.items||[]),{id:loc,customerId:b,name:"Reassigned location"}]});
 await assert.rejects(act(a,{action:"download",accountId:loc,id:first.id}),/access/);
});
