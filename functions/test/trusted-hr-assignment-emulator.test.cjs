/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";
const {test,after}=require("node:test");
const assert=require("node:assert/strict");
const {createHash,randomUUID}=require("node:crypto");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getFirestore}=require("firebase-admin/firestore");
const {getStorage}=require("firebase-admin/storage");
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_STORAGE_EMULATOR_HOST)
 throw new Error("HR assignment tests require Firestore and Storage emulators");
const app=initializeApp({projectId:"momentum-rules-test",
 storageBucket:"momentum-rules-test.firebasestorage.app"});
const db=getFirestore(app),bucket=getStorage(app).bucket();
const {assignTrustedHrTemplate,listTrustedHrAssignments,readTrustedHrAssignedTemplate,
 HrAssignmentError}=require("../lib/trusted-hr-template-assignment.js");
const {archiveTrustedHrSignedOriginal}=require("../lib/trusted-hr-signed-original.js");
const uid=randomUUID().replaceAll("-").slice(0,12);
const admin="hr-assign-admin-"+uid,worker="hr-assign-worker-"+uid,
 other="hr-assign-other-"+uid,customer="hr-assign-customer-"+uid,
 suspended="hr-assign-suspended-"+uid;
const templateId="hrtemplate-"+randomUUID();
const templatePath="hr-templates/W4/"+randomUUID()+"/source.pdf";
const pdf=Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
const sha256=createHash("sha256").update(pdf).digest("hex");
const key="hrAssignmentRequest"+uid+"abcdefghijklmnop";
const deny=(promise,status)=>assert.rejects(promise,
 err=>err instanceof HrAssignmentError&&err.status===status);
after(async()=>{await deleteApp(app);});
test("administrator assigns immutable template; only intended worker may prepare and submit",async()=>{
 await Promise.all([
  db.doc("userAccess/"+admin).set({role:"Administrator",accountState:"Active"}),
  db.doc("userAccess/"+worker).set({role:"Sales Representative",accountState:"Onboarding"}),
  db.doc("userAccess/"+other).set({role:"Sales Representative",accountState:"Active"}),
  db.doc("userAccess/"+customer).set({role:"Customer",accountState:"Active"}),
  db.doc("userAccess/"+suspended).set({role:"Administrator",accountState:"Suspended"}),
 ]);
 await bucket.file(templatePath).save(pdf,{resumable:false,contentType:"application/pdf"});
 const [metadata]=await bucket.file(templatePath).getMetadata();
 await db.doc("hrTemplateCatalog/"+templateId).set({
  id:templateId,kind:"W4",title:"W-4 employee form",
  edition:"Rev 2026",storagePath:templatePath,sha256,generation:String(metadata.generation),
  status:"Pending HR form and signer review",signedOriginal:false,
 });
 const request={employeeUid:worker,templateId,reviewedForWorkerPreparation:true};
 await deny(assignTrustedHrTemplate(worker,request,"worker"+key),403);
 await deny(assignTrustedHrTemplate(suspended,request,"suspended"+key),403);
 await deny(assignTrustedHrTemplate(admin,{...request,employeeUid:customer},"customer"+key),404);
 await deny(assignTrustedHrTemplate(admin,{...request,reviewedForWorkerPreparation:false},"unreviewed"+key),400);
 const saved=await assignTrustedHrTemplate(admin,request,"create"+key);
 assert.equal(saved.replayed,false);
 assert(saved.assignmentId.startsWith("hrassign-"));
 const proof=(await db.doc("hrDocumentAssignments/"+saved.assignmentId).get()).data();
 assert.equal(proof.employeeUid,worker);
 assert.equal(proof.status,"Assigned");
 assert.equal(proof.sha256,sha256);
 assert.equal((await assignTrustedHrTemplate(admin,request,"create"+key)).replayed,true);
 await deny(assignTrustedHrTemplate(admin,request,"duplicate"+key),409);
 await deny(assignTrustedHrTemplate(admin,{...request,employeeUid:other},"create"+key),409);
 assert((await listTrustedHrAssignments(worker)).some(item=>item.id===saved.assignmentId));
 assert((await listTrustedHrAssignments(admin,worker)).some(item=>item.id===saved.assignmentId));
 await deny(listTrustedHrAssignments(other,worker),403);
 await deny(listTrustedHrAssignments(customer),403);
 await deny(readTrustedHrAssignedTemplate(other,saved.assignmentId),403);
 await deny(readTrustedHrAssignedTemplate(customer,saved.assignmentId),403);
 await deny(readTrustedHrAssignedTemplate(suspended,saved.assignmentId),403);
 const source=await readTrustedHrAssignedTemplate(worker,saved.assignmentId);
 assert.equal(source.sha256,sha256);
 assert.equal(source.pdfBase64,pdf.toString("base64"));
 const original={
  employeeUid:worker,kind:"W4",sourceType:"Employee-submitted PDF (unverified)",
  reference:"Authenticated worker self-service submission",
  pdfBase64:pdf.toString("base64"),sha256,attestedByWorker:true,
  assignmentId:saved.assignmentId,
 };
 const submitted=await archiveTrustedHrSignedOriginal(worker,original,"archive"+key);
 assert.equal(submitted.status,"Pending independent HR review");
 const savedOriginal=(await db.doc("hrOriginalIntakeRecords/"+submitted.recordId).get()).data();
 assert.equal(savedOriginal.assignmentId,saved.assignmentId);
 assert.equal(savedOriginal.complianceApproved,false);
 assert.equal(savedOriginal.employeeAttested,true);
 const after=(await db.doc("hrDocumentAssignments/"+saved.assignmentId).get()).data();
 assert.equal(after.status,"Submitted for HR review");
 assert.equal(after.submittedOriginalId,submitted.recordId);
 assert.equal((await archiveTrustedHrSignedOriginal(worker,original,"archive"+key)).replayed,true);
 await deny(readTrustedHrAssignedTemplate(worker,saved.assignmentId),404);
 assert((await listTrustedHrAssignments(worker)).some(item=>
  item.id===saved.assignmentId&&item.status==="Submitted for HR review"));
});
