import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PDFDocument} from "pdf-lib";
import {inspectHrPdf,fillHrPdf,hasHrPdfChanges,updateHrPdfDraft} from "../lib/hr-pdf-editor-engine";

test("PDF editor detects compressed AcroForm and writes visible field values",async()=>{
 const original=await PDFDocument.create(),page=original.addPage([612,792]);
 const form=original.getForm();
 form.createTextField("Employee_FullName").addToPage(page,{x:40,y:650,width:300,height:24});
 form.createCheckBox("Worker_Consent").addToPage(page,{x:40,y:600,width:15,height:15});
 const bytes=await original.save();
 const inspected=await inspectHrPdf(bytes);
 assert.equal(inspected.pages[0].width,612);
 assert.equal(inspected.fields.find(row=>row.name==="Employee_FullName")?.type,"Text");
 assert.equal(inspected.fields.find(row=>row.name==="Worker_Consent")?.type,"Checkbox");
 const completed=await fillHrPdf(bytes,{
  Employee_FullName:"Example Worker",Worker_Consent:true,
 },[{page:1,kind:"Initials",x:40,y:550,width:70,height:24,text:"EW"}],false);
 const reopened=await PDFDocument.load(completed);
 assert.equal(reopened.getForm().getTextField("Employee_FullName").getText(),"Example Worker");
 assert.equal(reopened.getForm().getCheckBox("Worker_Consent").isChecked(),true);
 assert.equal(reopened.getPageCount(),1);
});
test("PDF editor refuses invented field names and off-page annotations",async()=>{
 const original=await PDFDocument.create();original.addPage([200,200]);
 const pdf=await original.save();
 await assert.rejects(fillHrPdf(pdf,{nonsense:"value"},[]),/field missing/);
 await assert.rejects(fillHrPdf(pdf,{},[{page:1,kind:"Text",x:190,y:50,width:100,height:20,text:"test"}]),/outside/);
 await assert.rejects(inspectHrPdf(new Uint8Array([1,2,3])),/valid PDF/);
});

test("PDF editor preview is permitted by Firebase Hosting CSP",()=>{
 const hosting=JSON.parse(readFileSync("firebase.json","utf8"));
 const headers=hosting.hosting.headers[0].headers;
 const csp=headers.find((h:{key:string;value:string})=>h.key==="Content-Security-Policy")?.value;
 assert.match(csp,/frame-src 'self' blob:/);
});


test("prefilled PDF values are visible and preserving an original choice does not create a fake edit",async()=>{
 const original=await PDFDocument.create(),page=original.addPage([400,400]);
 const form=original.getForm();
 const existing=form.createTextField("Employee Name");
 existing.setText("Already filled");existing.addToPage(page,{x:10,y:300,width:200,height:20});
 const checkbox=form.createCheckBox("Consent");
 checkbox.check();checkbox.addToPage(page,{x:10,y:260,width:15,height:15});
 const dropdown=form.createDropdown("Election");dropdown.addOptions(["First","Second"]);
 dropdown.select("First");dropdown.addToPage(page,{x:10,y:220,width:150,height:20});
 const pdf=await original.save();
 const fields=(await inspectHrPdf(pdf)).fields;
 const name=fields.find(f=>f.name==="Employee Name")!,consent=fields.find(f=>f.name==="Consent")!,
 election=fields.find(f=>f.name==="Election")!;
 assert.equal(name.initialValue,"Already filled");
 assert.equal(consent.initialValue,true);
 assert.deepEqual(election.selectedValues,["First"]);
 assert.equal(hasHrPdfChanges({},[]),false);
 assert.deepEqual(updateHrPdfDraft({},name,"Already filled"),{});
 assert.deepEqual(updateHrPdfDraft({},consent,true),{});
 assert.deepEqual(updateHrPdfDraft({Election:"Second"},election,undefined),{});
 assert.deepEqual(updateHrPdfDraft({},election,"First"),{});
 const draft=updateHrPdfDraft(updateHrPdfDraft({},name,""),consent,false);
 assert.equal(hasHrPdfChanges(draft,[]),true);
 const reopened=await PDFDocument.load(await fillHrPdf(pdf,draft,[],false));
 assert.equal(reopened.getForm().getTextField("Employee Name").getText()??"","");
 assert.equal(reopened.getForm().getCheckBox("Consent").isChecked(),false);
 assert.deepEqual(reopened.getForm().getDropdown("Election").getSelected(),["First"]);
});

test("PDF creation cannot publish a stale async completion after a source switch",()=>{
 const editor=readFileSync("components/hcm/hr-pdf-editor.tsx","utf8");
 assert.match(editor,/readySource!==source/);
 assert.match(editor,/generation\.current!==attempt/);
 assert.match(editor,/!hasHrPdfChanges\(values,overlays\)/);
 assert.match(editor,/fieldset disabled=\{busy\|\|disabled\}/);
});
