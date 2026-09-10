import assert from "node:assert/strict";
import test from "node:test";
import {
  activeTemplateForKind,
  createDocumentTemplateSeed,
  createSignatureEvidence,
  missingRequiredTemplateKinds,
  normalizeDocumentTemplateState,
  requiredTemplateKinds,
} from "../lib/document-template-engine";

test("employee and contractor tax-form packages route to the correct reusable templates", () => {
  assert.deepEqual(requiredTemplateKinds("Hourly"), ["Employment agreement", "Compensation notice", "Form I-9", "Form W-4", "Arizona Form A-4"]);
  assert.deepEqual(requiredTemplateKinds("Salary"), ["Employment agreement", "Compensation notice", "Form I-9", "Form W-4", "Arizona Form A-4"]);
  assert.deepEqual(requiredTemplateKinds("Contractor"), ["Employment agreement", "Compensation notice", "Form W-9"]);
});

test("latest active applicable template wins without deleting older versions", () => {
  const state = normalizeDocumentTemplateState({ version: 1, templates: [
    { id:"w4-v1", kind:"Form W-4", title:"W-4 v1", applicability:"Employees", originalFileName:"w4-v1.pdf", storagePath:"templates/w4-v1.pdf", version:1, active:true, fields:[], uploadedBy:"usr-mia", uploadedAt:"2026-09-01T12:00:00.000Z" },
    { id:"w4-v2", kind:"Form W-4", title:"W-4 v2", applicability:"Employees", originalFileName:"w4-v2.pdf", storagePath:"templates/w4-v2.pdf", version:2, active:true, fields:[], uploadedBy:"usr-mia", uploadedAt:"2026-09-10T12:00:00.000Z" },
    { id:"w4-contractor", kind:"Form W-4", title:"Wrong audience", applicability:"Contractors", originalFileName:"wrong.pdf", storagePath:"templates/wrong.pdf", version:99, active:true, fields:[], uploadedBy:"usr-mia", uploadedAt:"2026-09-10T12:00:00.000Z" },
  ], packets:[] });
  assert.equal(activeTemplateForKind(state, "Form W-4", "Hourly")?.id, "w4-v2");
  assert.equal(activeTemplateForKind(state, "Form W-4", "Contractor")?.id, "w4-contractor");
});

test("missing required template detection makes onboarding automation fail visibly", () => {
  const missing = missingRequiredTemplateKinds(createDocumentTemplateSeed(), "Contractor");
  assert.deepEqual(missing, ["Employment agreement", "Compensation notice", "Form W-9"]);
});

test("typed and drawn signatures require signer identity and valid signature evidence", () => {
  const typed = createSignatureEvidence("Typed", "Jamie Employee", "Jamie Employee", "2026-09-10T12:00:00.000Z");
  const drawn = createSignatureEvidence("Drawn", "Jamie Employee", "data:image/png;base64,abc", "2026-09-10T12:00:00.000Z");
  assert.equal(typed?.method, "Typed");
  assert.equal(typed?.typedValue, "Jamie Employee");
  assert.equal(drawn?.method, "Drawn");
  assert.match(drawn?.drawnDataUrl ?? "", /^data:image\//);
  assert.equal(createSignatureEvidence("Typed", "", "Jamie Employee"), null);
  assert.equal(createSignatureEvidence("Drawn", "Jamie Employee", "not-an-image"), null);
});
