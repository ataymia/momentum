/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";
const {test,after}=require("node:test");
const assert=require("node:assert/strict");
const {createHash,randomUUID}=require("node:crypto");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getFirestore}=require("firebase-admin/firestore");
const {getStorage}=require("firebase-admin/storage");

if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_STORAGE_EMULATOR_HOST)
 throw new Error("Signed original tests require Firestore and Storage emulators");
const app=initializeApp({
 projectId:"momentum-rules-test",
 storageBucket:"momentum-rules-test.firebasestorage.app",
});
const db=getFirestore(app),bucket=getStorage(app).bucket();
const {archiveTrustedHrSignedOriginal,listTrustedHrSignedOriginals,
 HrOriginalArchiveError}=require("../lib/trusted-hr-signed-original.js");
const {readTrustedHrOriginal}=require("../lib/trusted-hr-original-read.js");
const {decideTrustedHrOriginalReview}=require("../lib/trusted-hr-original-review.js");
const suffix=randomUUID().replaceAll("-","").slice(0,12);
const admin="hr-original-admin-"+suffix;
const worker="hr-original-worker-"+suffix;
const other="hr-original-other-"+suffix;
const customer="hr-original-customer-"+suffix;
const suspended="hr-original-suspended-"+suffix;
const pdf=Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
const cert=Buffer.from("%PDF-1.7\n2 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
const checksum=value=>createHash("sha256").update(value).digest("hex");
const archiveKey="archived"+suffix+"abcdefghijklmnop";
const original={
 employeeUid:worker,kind:"W9",sourceType:"External e-sign result",
 reference:"PROVIDER-ENVELOPE-TEST",
 pdfBase64:pdf.toString("base64"),sha256:checksum(pdf),
 certificateBase64:cert.toString("base64"),certificateSha256:checksum(cert),
};
const deny=(promise,status)=>assert.rejects(promise,
 e=>e instanceof HrOriginalArchiveError&&e.status===status);
after(async()=>{await deleteApp(app);});

test("signed originals: trusted admin, immutable source/certificate, replay, authorization and no false compliance",async()=>{
 await Promise.all([
  db.doc("userAccess/"+admin).set({role:"Administrator",accountState:"Active"}),
  db.doc("userAccess/"+worker).set({role:"Sales Representative",accountState:"Active"}),
  db.doc("userAccess/"+other).set({role:"Operations",accountState:"Active"}),
  db.doc("userAccess/"+customer).set({role:"Customer",accountState:"Active"}),
  db.doc("userAccess/"+suspended).set({role:"Administrator",accountState:"Suspended"}),
 ]);
 await deny(archiveTrustedHrSignedOriginal(worker,original,"worker"+archiveKey),403);
 await deny(archiveTrustedHrSignedOriginal(suspended,original,"suspended"+archiveKey),403);
 await deny(archiveTrustedHrSignedOriginal(admin,{...original,employeeUid:customer},"customer"+archiveKey),404);
 await deny(archiveTrustedHrSignedOriginal(admin,{...original,sha256:"a".repeat(64)},"wrongHash"+archiveKey),409);
 await deny(archiveTrustedHrSignedOriginal(admin,{...original,kind:"UNSUPPORTED"},"wrongKind"+archiveKey),400);
 await deny(archiveTrustedHrSignedOriginal(admin,{...original,accountState:"Approved"},"forgedStatus"+archiveKey),400);
 await deny(archiveTrustedHrSignedOriginal(admin,{...original,reference:"x"},"shortEvidence"+archiveKey),400);
 await deny(archiveTrustedHrSignedOriginal(admin,{...original,
  sourceType:"Paper signed scan"},"incorrectCertificate"+archiveKey),400);
 const receipt=await archiveTrustedHrSignedOriginal(admin,original,archiveKey);
 assert.equal(receipt.kind,"W9");
 assert.equal(receipt.employeeUid,worker);
 assert.equal(receipt.sha256,checksum(pdf));
 assert.equal(receipt.status,"Pending independent HR review");
 assert.equal(receipt.replayed,false);
 assert(receipt.originalPath.startsWith("hr-private/"+worker+"/W9/"));
 const [originalBytes]=(await bucket.file(receipt.originalPath).download());
 const [certBytes]=(await bucket.file(receipt.certificatePath).download());
 assert.equal(checksum(originalBytes),checksum(pdf));
 assert.equal(checksum(certBytes),checksum(cert));
 const saved=(await db.doc("hrOriginalIntakeRecords/"+receipt.recordId).get()).data();
 assert.equal(saved.employeeUid,worker);
 assert.equal(saved.complianceApproved,false);
 assert.equal(saved.independentlyVerified,false);
 assert.equal(saved.signedOriginalVerified,false);
 assert.equal(saved.status,"Pending independent HR review");
 assert(!("tin" in saved));
 assert(!("pdfBase64" in saved));
 const audit=(await db.doc("hrOriginalIntakeAudit/"+receipt.recordId).get()).data();
 assert.equal(audit.actorUid,admin);
 assert.equal(audit.sha256,checksum(pdf));
 const replay=await archiveTrustedHrSignedOriginal(admin,original,archiveKey);
 assert.equal(replay.recordId,receipt.recordId);
 assert.equal(replay.replayed,true);
 const [afterReplayMetadata]=(await bucket.file(receipt.originalPath).getMetadata());
 const [afterReplayCertificateMetadata]=(await bucket.file(receipt.certificatePath).getMetadata());
 assert.equal(String(afterReplayMetadata.generation),receipt.generation,
  "An idempotent retry must not rewrite the signed original");
 assert.equal(checksum((await bucket.file(receipt.originalPath).download())[0]),checksum(pdf));
 assert.equal(checksum((await bucket.file(receipt.certificatePath).download())[0]),checksum(cert));
 assert(afterReplayCertificateMetadata.generation,
  "Completion certificate must remain available after replay");
 await deny(archiveTrustedHrSignedOriginal(admin,{...original,reference:"DIFFERENT-SOURCE"} ,archiveKey),409);
 const adminView=await listTrustedHrSignedOriginals(admin,worker);
 assert(adminView.some(item=>item.id===receipt.recordId&&item.hasCertificate));
 await deny(listTrustedHrSignedOriginals(worker,undefined),403);
 // Pending originals are not released to the worker before lawful review.
 await deny(listTrustedHrSignedOriginals(other,worker),403);
 await deny(listTrustedHrSignedOriginals(customer,worker),403);
 await deny(listTrustedHrSignedOriginals(suspended,worker),403);
 await deny(listTrustedHrSignedOriginals(worker,customer),403);
 const retrieved=await readTrustedHrOriginal(admin,{recordId:receipt.recordId,artifact:"Original"});
 assert.equal(retrieved.sha256,checksum(pdf));
 assert.equal(retrieved.pdfBase64,pdf.toString("base64"));
 assert.equal(retrieved.status,"Pending independent HR review");
 await deny(readTrustedHrOriginal(worker,{recordId:receipt.recordId,artifact:"Original"}),403);
 const forgedWorkerAuditId=randomUUID();
 await db.doc("hrOriginalIntakeReadAudit/"+forgedWorkerAuditId).create({
  auditId:forgedWorkerAuditId,recordId:receipt.recordId,
  employeeUid:worker,actorUid:worker,artifact:"Original",
  sha256:checksum(pdf),viewedAt:new Date().toISOString(),
 });
 const proof=await readTrustedHrOriginal(admin,{recordId:receipt.recordId,artifact:"Certificate"});
 assert.equal(proof.sha256,checksum(cert));
 await deny(readTrustedHrOriginal(other,{recordId:receipt.recordId,artifact:"Original"}),403);
 await deny(readTrustedHrOriginal(customer,{recordId:receipt.recordId,artifact:"Original"}),403);
 await deny(readTrustedHrOriginal(suspended,{recordId:receipt.recordId,artifact:"Original"}),403);
 await deny(readTrustedHrOriginal(admin,{recordId:receipt.recordId,artifact:"Forged"}),400);
 await deny(readTrustedHrOriginal(admin,{recordId:receipt.recordId,artifact:"Original",status:"Approved"}),400);
 const reads=await db.collection("hrOriginalIntakeReadAudit")
  .where("recordId","==",receipt.recordId).get();
 assert.equal(reads.docs.length,3);
 assert(reads.docs.every(doc=>!doc.data().pdfBase64&&!doc.data().reference));

 const reviewKey="sourceReview"+suffix+"abcdefghijklmnop";
 const pendingIntent={
  recordId:receipt.recordId,expectedStatus:"Pending independent HR review",
  decision:"Record evidence inspection",readAuditId:retrieved.readAuditId,
  sha256:checksum(pdf),reason:"Administrator inspected completed source PDF; legal verification remains outstanding.",
 };
 await deny(decideTrustedHrOriginalReview(worker,pendingIntent,"worker"+reviewKey),403);
 await deny(decideTrustedHrOriginalReview(suspended,pendingIntent,"suspended"+reviewKey),403);
 await deny(decideTrustedHrOriginalReview(admin,{
  ...pendingIntent,readAuditId:forgedWorkerAuditId,
 },"wrongInspector"+reviewKey),409);
 await deny(decideTrustedHrOriginalReview(admin,{
  ...pendingIntent,decision:"Approve legal signature",
 },"fakeApproval"+reviewKey),400);
 await deny(decideTrustedHrOriginalReview(admin,{
  ...pendingIntent,sha256:"a".repeat(64),
 },"fakeHash"+reviewKey),409);
 const reviewed=await decideTrustedHrOriginalReview(admin,pendingIntent,reviewKey);
 assert.equal(reviewed.status,"Evidence inspected; compliance verification pending");
 assert.equal(reviewed.replayed,false);
 assert.equal((await db.doc("hrOriginalIntakeRecords/"+receipt.recordId).get()).data().complianceApproved,false);
 const repeated=await decideTrustedHrOriginalReview(admin,pendingIntent,reviewKey);
 assert.equal(repeated.status,reviewed.status);
 assert.equal(repeated.replayed,true);
 await deny(decideTrustedHrOriginalReview(admin,{
  ...pendingIntent,decision:"Return for correction",
 },reviewKey),409);
 await deny(decideTrustedHrOriginalReview(admin,pendingIntent,"stale"+reviewKey),409);
 await deny(decideTrustedHrOriginalReview(admin,{
  ...pendingIntent,expectedStatus:"Evidence inspected; compliance verification pending",
  decision:"Return for correction",
 },"reusedRead"+reviewKey),409);
 const reread=await readTrustedHrOriginal(admin,{
  recordId:receipt.recordId,artifact:"Original",
 });
 assert.equal(reread.status,"Evidence inspected; compliance verification pending");
 const returnIntent={
  ...pendingIntent,expectedStatus:"Evidence inspected; compliance verification pending",
  decision:"Return for correction",readAuditId:reread.readAuditId,
  reason:"Source PDF requires a corrected document; original remains archived.",
 };
 const returned=await decideTrustedHrOriginalReview(admin,returnIntent,"return"+reviewKey);
 assert.equal(returned.status,"Requires correction");
 const afterReview=(await db.doc("hrOriginalIntakeRecords/"+receipt.recordId).get()).data();
 assert.equal(afterReview.status,"Requires correction");
 assert.equal(afterReview.independentlyVerified,false);
 assert.equal(afterReview.signedOriginalVerified,false);
 assert.equal(afterReview.complianceApproved,false);
 const decisions=(await db.collection("hrOriginalReviewAudit")
  .where("recordId","==",receipt.recordId).get()).docs;
 assert.equal(decisions.length,2);
 assert(decisions.every(doc=>doc.data().legalApproved===false&&doc.data().signatureVerified===false));
 await deny(decideTrustedHrOriginalReview(admin,{
  ...returnIntent,expectedStatus:"Requires correction",
 },"illegalReopen"+reviewKey),400);

 const freshInspection=await readTrustedHrOriginal(admin,{
  recordId:receipt.recordId,artifact:"Original",
 });
 const quarantine=await decideTrustedHrOriginalReview(admin,{
  ...pendingIntent,expectedStatus:"Requires correction",
  decision:"Quarantine misfiled original",
  readAuditId:freshInspection.readAuditId,
  reason:"Original may have been assigned to an incorrect worker. Revoke access pending HR investigation.",
 },"quarantine"+reviewKey);
 assert.equal(quarantine.status,"Quarantined; access revoked");
 const quarantinedSource=(await db.doc("hrOriginalIntakeRecords/"+receipt.recordId).get()).data();
 assert.equal(quarantinedSource.status,"Quarantined; access revoked");
 assert.equal(quarantinedSource.complianceApproved,false);
 await deny(readTrustedHrOriginal(worker,{recordId:receipt.recordId,artifact:"Original"}),403);
 await deny(listTrustedHrSignedOriginals(worker),403);
 const afterQuarantineAdmin=await listTrustedHrSignedOriginals(admin,worker);
 assert(afterQuarantineAdmin.some(item=>item.id===receipt.recordId&&
  item.status==="Quarantined; access revoked"));
 const auditCount=(await db.collection("hrOriginalReviewAudit")
  .where("recordId","==",receipt.recordId).get()).docs.length;
 assert.equal(auditCount,3);


 await bucket.file(receipt.originalPath).save(Buffer.from(
  "%PDF-1.7\n1 0 obj\n<< /Type /Tampered >>\nendobj\n%%EOF\n"
 ),{contentType:"application/pdf",resumable:false});
 await deny(readTrustedHrOriginal(admin,{recordId:receipt.recordId,artifact:"Original"}),409);
});

