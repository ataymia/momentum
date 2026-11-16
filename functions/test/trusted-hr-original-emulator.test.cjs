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
 const saved=(await db.doc("hrSignedFormRecords/"+receipt.recordId).get()).data();
 assert.equal(saved.employeeUid,worker);
 assert.equal(saved.complianceApproved,false);
 assert.equal(saved.independentlyVerified,false);
 assert.equal(saved.signedOriginalVerified,false);
 assert.equal(saved.status,"Pending independent HR review");
 assert(!("tin" in saved));
 assert(!("pdfBase64" in saved));
 const audit=(await db.doc("hrSignedFormAudit/"+receipt.recordId).get()).data();
 assert.equal(audit.actorUid,admin);
 assert.equal(audit.sha256,checksum(pdf));
 const replay=await archiveTrustedHrSignedOriginal(admin,original,archiveKey);
 assert.equal(replay.recordId,receipt.recordId);
 assert.equal(replay.replayed,true);
 await deny(archiveTrustedHrSignedOriginal(admin,{...original,reference:"DIFFERENT-SOURCE"} ,archiveKey),409);
 const adminView=await listTrustedHrSignedOriginals(admin,worker);
 assert(adminView.some(item=>item.id===receipt.recordId&&item.hasCertificate));
 const workerView=await listTrustedHrSignedOriginals(worker,undefined);
 assert(workerView.some(item=>item.id===receipt.recordId));
 assert(workerView.every(item=>item.employeeUid===worker));
 assert(workerView.every(item=>!("originalPath" in item)&&!("reference" in item)));
 await deny(listTrustedHrSignedOriginals(other,worker),403);
 await deny(listTrustedHrSignedOriginals(customer,worker),403);
 await deny(listTrustedHrSignedOriginals(suspended,worker),403);
 await deny(listTrustedHrSignedOriginals(worker,customer),403);
});
