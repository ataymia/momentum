import type {PdfInfo} from "./hr-pdf-editor-engine";
import type {HrTemplateFieldHint} from "./firebase-hr-template-library";

/** Translate embedded PDF AcroForm fields into administrator-reviewable signer hints.
 * Detection is a suggestion only. Graphics-only marks have no AcroForm field.
 * Fields beyond the template's 80-field registration limit are not registered.
 */
export function mapHrPdfFields(info:PdfInfo):{
 hints:HrTemplateFieldHint[];total:number;omitted:number;
}{
 const hints:HrTemplateFieldHint[]=[];
 const seen=new Set<string>();
 for(const field of info.fields){
  const pdfFieldName=field.name.trim();
  if(!pdfFieldName||pdfFieldName.length>120||seen.has(pdfFieldName))continue;
  seen.add(pdfFieldName);
  if(hints.length===80)continue;
  const label=pdfFieldName
   .replace(/[_.-]+/g," ")
   .replace(/([a-z])([A-Z])/g,"$1 $2")
   .trim().slice(0,100);
  if(label.length<2)continue;
  const kind=field.type==="Checkbox"?"Checkbox":
   field.suggestedKind==="Signature"?"Signature":
   field.suggestedKind==="Initials"?"Initials":
   field.suggestedKind==="Date"?"Date":"Text";
  hints.push({
   id:"detected-"+(hints.length+1),
   label,pdfFieldName,type:kind,
   signer:field.suggestedRole,
   required:kind==="Signature"||kind==="Initials",
  });
 }
 return{hints,total:seen.size,omitted:Math.max(0,seen.size-hints.length)};
}
