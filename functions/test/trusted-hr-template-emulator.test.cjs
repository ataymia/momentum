/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";
const {test,after}=require("node:test");
const assert=require("node:assert/strict");
const {createHash,randomUUID}=require("node:crypto");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getFirestore}=require("firebase-admin/firestore");
const {getStorage}=require("firebase-admin/storage");
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_STORAGE_EMULATOR_HOST)
 throw new Error("HR template tests require Firestore and Storage emulators");
const app=initializeApp({
 projectId:"momentum-rules-test",
 storageBucket:"momentum-rules-test.firebasestorage.app",
});
const db=getFirestore(app),bucket=getStorage(app).bucket();
const {
 registerTrustedHrTemplate,listTrustedHrTemplates,TrustedHrTemplateError,
}=require("../lib/trusted-hr-template.js");
const {uploadTrustedBlankHrTemplate}=require("../lib/trusted-hr-template-upload.js");
const suffix=randomUUID().replaceAll("-","").slice(0,12);
const admin="hr-template-admin-"+suffix;
const rep="hr-template-rep-"+suffix;
const suspended="hr-template-suspended-"+suffix;
const pdf=Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
const sha256=createHash("sha256").update(pdf).digest("hex");
const key="hrTemplate"+suffix+"abcdefghijklmnop";
const draft={
 kind:"W9",title:"IRS Form W-9 blank revision",edition:"Rev. 2024",
 storagePath:"",sha256,blankTemplateConfirmed:true,
 fields:[
  {id:"taxpayer-name",label:"Name of taxpayer",type:"Text",
   required:true,pdfFieldName:"Name",signer:"Worker"},
  {id:"payer-sign",label:"Contractor signature",type:"Signature",
   required:true,signer:"Worker"},
 ],
};
const deny=(call,status)=>assert.rejects(call,
 error=>error instanceof TrustedHrTemplateError&&error.status===status);
after(async()=>{await deleteApp(app);});

test("HR blank PDFs: actual object hash, server registration, role denial, immutable audit and retry",async()=>{
 await Promise.all([
  db.doc("userAccess/"+admin).set({role:"Administrator",accountState:"Active"}),
  db.doc("userAccess/"+rep).set({role:"Sales Representative",accountState:"Active"}),
  db.doc("userAccess/"+suspended).set({role:"Administrator",accountState:"Suspended"}),
 ]);
 const uploadPayload={kind:"W9",pdfBase64:pdf.toString("base64"),
  sha256,blankTemplateConfirmed:true};
 await deny(uploadTrustedBlankHrTemplate(rep,uploadPayload,"repUpload"+key),403);
 await deny(uploadTrustedBlankHrTemplate(suspended,uploadPayload,"suspendedUpload"+key),403);
 const uploaded=await uploadTrustedBlankHrTemplate(admin,uploadPayload,"upload"+key);
 assert.equal(uploaded.sha256,sha256);
 assert.equal(uploaded.size,pdf.length);
 assert(uploaded.storagePath.startsWith("hr-templates/W9/"));
 assert.equal(uploaded.status,"Uploaded blank PDF; pending form and signer review");
 draft.storagePath=uploaded.storagePath;
 const again=await uploadTrustedBlankHrTemplate(admin,uploadPayload,"upload"+key);
 assert.equal(again.storagePath,uploaded.storagePath);
 assert.equal(again.replayed,true);
 await deny(uploadTrustedBlankHrTemplate(admin,{...uploadPayload,sha256:"0".repeat(64)},"badUploadHash"+key),409);
 await deny(uploadTrustedBlankHrTemplate(admin,{...uploadPayload,kind:"I9"},"wrongUploadKind"+key),400);
 await deny(uploadTrustedBlankHrTemplate(admin,{...uploadPayload,price:24},"forgedUpload"+key),400);
 await deny(registerTrustedHrTemplate(rep,draft,"rep"+key),403);
 await deny(registerTrustedHrTemplate(suspended,draft,"suspended"+key),403);
 const receipt=await registerTrustedHrTemplate(admin,draft,key);
 assert.equal(receipt.replayed,false);
 assert.equal(receipt.status,"Pending HR form and signer review");
 const saved=(await db.doc("hrTemplateCatalog/"+receipt.templateId).get()).data();
 assert.equal(saved.kind,"W9");assert.equal(saved.sha256,sha256);
 assert.equal(saved.size,pdf.length);
 assert.equal(saved.classification,"Contractor");
 assert.equal(saved.signedOriginal,false);
 assert.equal(saved.status,"Pending HR form and signer review");
 assert.equal(saved.source,"https://www.irs.gov/forms-pubs/about-form-w-9");
 assert.equal(saved.fields.length,2);
 assert(!("employeeUid" in saved)&&!("taxpayerIdentificationNumber" in saved));
 const audit=(await db.doc("hrTemplateAudit/"+receipt.templateId).get()).data();
 assert.equal(audit.actorUid,admin);
 assert.equal(audit.sha256,sha256);
 const prior=(await bucket.file(uploaded.storagePath).download())[0];
 assert.equal(createHash("sha256").update(prior).digest("hex"),sha256);
 const replay=await registerTrustedHrTemplate(admin,draft,key);
 assert.equal(replay.templateId,receipt.templateId);
 assert.equal(replay.replayed,true);
 await deny(registerTrustedHrTemplate(admin,{...draft,title:"Altered title"},key),409);
 await deny(registerTrustedHrTemplate(admin,{...draft,sha256:"a".repeat(64)},"badHash"+key),409);
 await deny(registerTrustedHrTemplate(admin,{...draft,kind:"I9"},"wrongType"+key),400);
 await deny(registerTrustedHrTemplate(admin,{...draft,blankTemplateConfirmed:false},"notBlank"+key),400);
 await deny(registerTrustedHrTemplate(admin,{...draft,tin:"123-45-6789"},"forgedTIN"+key),400);
 await deny(registerTrustedHrTemplate(admin,{...draft,fields:[{...draft.fields[0],id:"../../bad"}]},"unsafeMap"+key),400);
 await deny(registerTrustedHrTemplate(admin,{...draft,fields:[draft.fields[0],draft.fields[0]]},"duplicateMap"+key),400);
 const badPath="hr-templates/W9/"+randomUUID()+"/source.pdf";
 await bucket.file(badPath).save(Buffer.from("not-a-pdf"),{contentType:"application/pdf"});
 await deny(registerTrustedHrTemplate(admin,{...draft,storagePath:badPath,
  sha256:createHash("sha256").update("not-a-pdf").digest("hex")},"badPdf"+key),400);
 await deny(listTrustedHrTemplates(rep),403);
 await deny(listTrustedHrTemplates(suspended),403);
 const records=await listTrustedHrTemplates(admin);
 assert(records.some(item=>item.id===receipt.templateId&&item.signedOriginal===false));
 const signed=(await db.collection("hrSignedFormRecords").limit(1).get());
 assert.equal(signed.empty,true,"Uploading a template cannot create completed worker forms");
});
