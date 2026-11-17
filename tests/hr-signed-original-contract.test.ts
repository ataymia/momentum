import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const load=(path:string)=>readFileSync(path,"utf8");

test("R43-R49: secured signed originals are separate from blank templates and cannot impersonate e-sign",()=>{
 const server=load("functions/src/trusted-hr-signed-original.ts");
 const index=load("functions/src/index.ts");
 const client=load("lib/firebase-hr-signed-original.ts");
 const ui=load("components/hcm/hr-signed-original-archive-panel.tsx");
 const firestore=load("firestore.rules");
 const storage=load("storage.rules");
 assert(server.includes("archiveTrustedHrSignedOriginal"));
 assert(server.includes('status:"Pending independent HR review"'));
 assert(server.includes("independentlyVerified:false,complianceApproved:false"));
 assert(server.includes("signedOriginalVerified:false"));
 assert(server.includes("ifGenerationMatch:0"));
 assert(server.includes('file.download()'));
 assert(server.includes("hrOriginalArchiveRequests"));
 assert(server.includes("hrOriginalIntakeAudit/"));
 assert(server.includes("hrOriginalIntakeRecords/"));
 assert(index.includes("readTrustedHrOriginal"));
 assert(index.includes("decideTrustedHrOriginalReview"));
 const review=load("functions/src/trusted-hr-original-review.ts");
 const read=load("functions/src/trusted-hr-original-read.ts");
 assert(review.includes("Record evidence inspection"));
 assert(review.includes("Return for correction"));
 assert(review.includes("hrOriginalIntakeReadAudit/"));
 assert(review.includes("hrOriginalReviewKeys/"));
 assert(review.includes("hrOriginalReviewAudit/"));
 assert(review.includes("signatureVerified:false,legalApproved:false,i9Examined:false"));
 assert(read.includes("readAuditId:auditId"));
 assert(review.includes("Quarantine misfiled original"));
 assert(review.includes("Quarantined; access revoked"));
 assert(read.includes("Unverified original intake is restricted to active HR Administrators."));
 assert(server.includes('if(!administrator&&!ownWorker)'));
 assert(read.includes('if(!active||role!=="Administrator")'));
 assert(firestore.includes('allow get, list: if isAdmin();'));
 assert(ui.includes("Quarantine misfiled or incorrectly assigned original"));

 assert(client.includes("reviewHrOriginal"));
 assert(ui.includes("Record restricted HR review"));
 assert(ui.includes("matchingInspection"));
 assert(firestore.includes("match /hrOriginalReviewKeys/{requestId}"));
 assert(firestore.includes("match /hrOriginalReviewAudit/{eventId}"));

 assert(client.includes("downloadHrOriginalBytes"));
 assert(ui.includes("Download original"));
 assert(ui.includes("Certificate"));
 assert(firestore.includes("match /hrOriginalIntakeReadAudit/{eventId}"));
 assert(server.includes('role==="Administrator"'));
 assert(server.includes('ownWorker=actorUid===incoming.employeeUid'));
 assert(server.includes('accountState==="Active"'));
 assert(server.includes('txt(workerSnap.data()?.role)==="Customer"'));
 assert(client.includes('firebaseFunctionUrl("hrSignedOriginalArchive")'));
 assert(!client.includes("getDownloadURL"));
 assert(!client.includes("localStorage"));
 assert(ui.includes("HrSignedOriginalArchivePanel"));
 assert(ui.includes("Pending independent HR review"));
 assert(ui.includes("worker classification"));
 assert(index.includes("export const hrSignedOriginalArchive="));
 assert(index.includes("verifyIdToken(token,true)"));
 assert(firestore.includes("match /hrOriginalArchiveRequests/{requestId}"));
 assert(firestore.includes("match /hrOriginalIntakeRecords/{recordId}"));
 assert(storage.includes("match /hr-private/{employeeUid}/{formKey}/{artifactId}/{fileName}"));
 assert(storage.includes("allow get, list, create, update, delete: if false;"));
 assert(!storage.includes("request.auth.uid == employeeUid"));
 assert(client.includes("downloadHrOriginalBytes"));
 assert(index.includes("export const hrSignedOriginalArchive="));
});

test("Contractor and employee forms remain isolated, with no implied completed compliance",()=>{
 const server=load("functions/src/trusted-hr-template.ts");
 const packageUi=load("components/hcm/hr-signed-original-archive-panel.tsx");
 const status=load("lib/hr-compliance-readiness.ts");
 assert(server.includes('W9:{title:"IRS Form W-9",classification:"Contractor"'));
 assert(server.includes('I9:{title:"USCIS Form I-9",classification:"Employee"'));
 assert(status.includes('if(classification==="Contractor")return ["W-9"]'));
 assert(status.includes('if(classification==="Hourly"||classification==="Salary")'));
 assert(status.includes('productionReady:false'));
 assert(packageUi.includes("In-app drawn marks are not provider-verified signatures"));
 assert(packageUi.includes('setSourceType("In-app prepared PDF (unverified)")'));
 assert(packageUi.includes("Every mark requires independent identity and consent review"));
 assert(packageUi.includes("does not change a worker's onboarding or compliance status"));
});

test("authenticated employee can only submit and list their own unverified PDF through HR review queue",()=>{
 const service=load("functions/src/trusted-hr-signed-original.ts");
 const worker=load("components/hcm/hr-worker-document-submission.tsx");
 const onboarding=load("components/hcm/onboarding-portal.tsx");
 const client=load("lib/firebase-hr-signed-original.ts");
 assert.match(worker,/archiveHrOriginal\(session/);
 assert.match(worker,/employeeUid:session\.uid/);
 assert.match(worker,/attestedByWorker:true/);
 assert.match(worker,/listHrOriginals\(session\)/);
 assert.match(worker,/HrPdfEditor source=\{file\}/);
 assert.match(onboarding,/HrWorkerDocumentSubmission/);
 assert.match(service,/ownWorker=actorUid===incoming\.employeeUid/);
 assert.match(service,/incoming\.attestedByWorker===true/);
 assert.match(service,/if\(!administrator&&!ownWorker\)/);
 assert.match(client,/Employee-submitted PDF \(unverified\)/);
});

test("worker HR PDF assignments cannot submit unedited blank source or stale form type",()=>{
 const ui=load("components/hcm/hr-worker-document-submission.tsx");
 assert.match(ui,/if\(\(selectedAssignment\|\|needsEdited\)&&!completed\)/);
 assert.match(ui,/disabled=\{!file\|\|!attested\|\|busy\|\|opening\|\|Boolean\(\(selectedAssignment\|\|needsEdited\)&&!completed\)\}/);
 assert.match(ui,/setKind\(event.target.value as HrTemplateKind\);setSelectedAssignment\(null\)/);
 assert.match(ui,/setFile\(null\);setCompleted\(null\)/);
 assert.match(ui,/if\(filePicker.current\)filePicker.current.value=""/);
});


test("worker edits invalidate prior attestation and source history is isolated by authenticated identity",()=>{
 const worker=load("components/hcm/hr-worker-document-submission.tsx");
 const archive=load("functions/src/trusted-hr-signed-original.ts");
 assert.match(worker,/WorkerHrDocumentSubmissionSession key=\{session\.uid\}/);
 assert.match(worker,/setCompleted\(null\);setNeedsEdited\(true\);reset\(\)/);
 assert.match(worker,/setLoaded\(false\);setRecords\(\[\]\);setOriginalsError\(true\)/);
 assert.match(archive,/txt\(assignmentSnap\.data\(\)\?\.sha256\)===incoming\.sha256/);
 assert.match(archive,/txt\(assignment\.data\(\)\?\.sha256\)===incoming\.sha256/);
});
