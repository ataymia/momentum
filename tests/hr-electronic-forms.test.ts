import assert from "node:assert/strict";
import test from "node:test";
import {hrArchiveBlockers,hrSignedArtifactPaths,i9RetentionReviewDate} from "../lib/hr-electronic-forms";

const completed={
 providerEnvelopeId:"docusign-envelope-01",
 providerCompletionVerifiedAt:"2026-10-14T12:00:00.000Z",
 employeeSignedAt:"2026-10-14T11:55:00.000Z",
 pdfSha256:"a".repeat(64),
 certificateSha256:"b".repeat(64),
} as const;

test("archive cannot be marked complete until provider, immutable PDF and certificate are verified",()=>{
 assert.deepEqual(hrArchiveBlockers("AZ_A4",completed),[]);
 assert.ok(hrArchiveBlockers("AZ_A4",{...completed,providerCompletionVerifiedAt:undefined}).length>0);
 assert.ok(hrArchiveBlockers("AZ_A4",{...completed,certificateSha256:undefined}).length>0);
 assert.ok(hrArchiveBlockers("AZ_A4",{...completed,pdfSha256:"not-a-sha"}).length>0);
});

test("I-9 requires signed employer Section 2 and documents examination",()=>{
 assert.ok(hrArchiveBlockers("I9",completed).some(reason=>reason.includes("Section 2")));
 const physical={...completed,employerExamination:{examinerUid:"hr-admin",examinedAt:"2026-10-14T12:00:00Z",section2SignedAt:"2026-10-14T12:01:00Z",method:"In person" as const}};
 assert.deepEqual(hrArchiveBlockers("I9",physical),[]);
 const remote={...physical,employerExamination:{...physical.employerExamination,method:"Approved E-Verify alternative" as const}};
 assert.ok(hrArchiveBlockers("I9",remote).some(reason=>reason.includes("Remote I-9")));
 assert.deepEqual(hrArchiveBlockers("I9",{...remote,employerExamination:{...remote.employerExamination,remoteEligibilityVerified:true}}),[]);
});

test("W-4 requires final signature and penalty-of-perjury acknowledgment",()=>{
 assert.ok(hrArchiveBlockers("W4",completed).length>0);
 assert.deepEqual(hrArchiveBlockers("W4",{...completed,w4FinalSignatureChecked:true,w4PerjuryAcknowledged:true}),[]);
});

test("HR artifact paths never accept traversals, arbitrary filenames or unsupported form kinds",()=>{
 assert.deepEqual(hrSignedArtifactPaths("uid-employee","W4","envelope-123"),{
  signedPdf:"hr-private/uid-employee/W4/envelope-123/signed.pdf",
  certificate:"hr-private/uid-employee/W4/envelope-123/certificate.pdf",
 });
 assert.throws(()=>hrSignedArtifactPaths("../admin","W4","envelope-123"));
 assert.throws(()=>hrSignedArtifactPaths("uid-employee","W4","../other"));
 assert.throws(()=>hrSignedArtifactPaths("uid-employee","FOO" as "W4","envelope-123"));
});

test("I-9 minimum retention depends on hire and termination, not merely upload date",()=>{
 assert.equal(i9RetentionReviewDate("2026-10-14"),"2029-10-14");
 assert.equal(i9RetentionReviewDate("2026-10-14","2027-01-01"),"2029-10-14");
 assert.equal(i9RetentionReviewDate("2026-10-14","2032-01-01"),"2033-01-01");
 assert.throws(()=>i9RetentionReviewDate("2026-02-30"));
});
