import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {HR_TEMPLATE_CHOICES} from "../lib/firebase-hr-template-library";
import {requiredTemplateKinds} from "../lib/document-template-engine";
import {requiredForms} from "../lib/hr-compliance-readiness";

test("contractor and W-2 document packages never silently overlap",()=>{
 assert.deepEqual(requiredForms("Contractor"),["W-9"]);
 assert.deepEqual(requiredForms("Hourly"),["I-9","W-4","Arizona A-4"]);
 assert.deepEqual(requiredTemplateKinds("Contractor"),[
  "Independent contractor agreement","Compensation notice","Form W-9"]);
 assert.deepEqual(requiredTemplateKinds("Salary"),[
  "Employment agreement","Compensation notice","Form I-9","Form W-4","Arizona Form A-4"]);
 assert.deepEqual(requiredTemplateKinds("Not configured"),[]);
});
test("signed-form and uploaded-template catalogs have matching official source categories",()=>{
 const server=readFileSync("functions/src/trusted-hr-template.ts","utf8");
 const kinds=Array.from(server.matchAll(/^ ([A-Z0-9_]+):\{title:/gm)).map(match=>match[1]);
 assert.deepEqual(kinds.sort(),HR_TEMPLATE_CHOICES.map(row=>row.kind).sort());
 for(const choice of HR_TEMPLATE_CHOICES){
  assert(server.includes("kind:"+choice.kind)||
   server.includes(" "+choice.kind+":{title:"),"server kind "+choice.kind);
 }
});
test("template upload never writes signed originals or implicitly approves e-sign compliance",()=>{
 const server=readFileSync("functions/src/trusted-hr-template.ts","utf8");
 const screen=readFileSync("components/hcm/hr-template-upload-panel.tsx","utf8");
 const session=readFileSync("lib/firebase-hr-template-library.ts","utf8");
 const storage=readFileSync("storage.rules","utf8");
 const uploader=readFileSync("functions/src/trusted-hr-template-upload.ts","utf8");
 assert(server.includes("getStorage().bucket().file(storagePath)"));
 assert(server.includes('createHash("sha256").update(bytes)'));
 assert(server.includes('status:"Pending HR form and signer review"'));
 assert(server.includes("signedOriginal:false"));
 assert(server.includes("tx.create(db.doc(\"hrTemplateAudit/\"+templateId)"));
 assert(!server.includes('tx.create(db.doc("hrSignedFormRecords/'));
 assert(screen.includes("uploadBlankHrTemplate"));
 assert(screen.includes("registerHrTemplate"));
 assert(screen.includes("Pending HR form and signer review"));
 assert(session.includes('String.fromCharCode(...new Uint8Array(buffer.slice(0,5)))!=="%PDF-"'));
 assert(storage.includes("allow create, list, update, delete: if false;"));
 assert(!session.includes("firebasestorage.googleapis.com"));
 assert(session.includes('firebaseFunctionUrl("uploadHrBlankTemplate")'));
 assert(uploader.includes("preconditionOpts:{ifGenerationMatch:0}"));
 assert(uploader.includes("file.download()"));
 assert(uploader.includes("hrTemplateUploadRequests"));
 assert(!uploader.includes("hrSignedFormRecords"));
});

import {discoverHrPdfFields} from "../lib/hr-pdf-field-discovery";

test("local HR PDF field discovery suggests text, signature, initials, checkbox and company date",()=>{
 const pdf="%PDF-1.7\n"+
  "1 0 obj << /FT /Tx /T (EmployeeName) /Rect [0 0 100 20] >> endobj\n"+
  "2 0 obj << /FT /Sig /T (Worker_Signature) >> endobj\n"+
  "3 0 obj << /FT /Tx /T (Employee_Initials) >> endobj\n"+
  "4 0 obj << /FT /Btn /T (Consent_Check) >> endobj\n"+
  "5 0 obj << /FT /Tx /T (Employer_Date) >> endobj\n";
 const fields=discoverHrPdfFields(new TextEncoder().encode(pdf));
 assert.deepEqual(fields.map(row=>row.type),["Text","Signature","Initials","Checkbox","Date"]);
 assert.deepEqual(fields.map(row=>row.signer),["Worker","Worker","Worker","Worker","Company"]);
 assert.equal(fields[1].required,true);
 assert.equal(fields[0].pdfFieldName,"EmployeeName");
});
test("PDF field discovery rejects non-PDF and deduplicates repeated form field names",()=>{
 assert.throws(()=>discoverHrPdfFields(new TextEncoder().encode("not a pdf")));
 const pdf="%PDF-1.7\n1 0 obj << /FT /Tx /T (FirstName) >> endobj\n"+
 "2 0 obj << /FT /Tx /T (FirstName) >> endobj\n";
 assert.equal(discoverHrPdfFields(new TextEncoder().encode(pdf)).length,1);
});
