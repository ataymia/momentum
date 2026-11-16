import type {HrTemplateFieldHint} from "./firebase-hr-template-library";

/** Read existing uncompressed AcroForm fields locally; never send PDF bytes to detection services.
 * Scanned pages, compressed object streams and drawn signature lines need manual mapping.
 */
export function discoverHrPdfFields(bytes:Uint8Array):HrTemplateFieldHint[]{
  if(bytes.length<8||bytes.length>12*1024*1024||
    String.fromCharCode(...bytes.subarray(0,5))!=="%PDF-")
    throw new Error("Choose a valid blank PDF under 12 MB.");
  const source=new TextDecoder("latin1").decode(bytes);
  const results:HrTemplateFieldHint[]=[];
  const seen=new Set<string>();
  const objects=source.match(/(?:^|[\r\n])\s*\d+\s+\d+\s+obj\b[\s\S]*?endobj/gm)??[];
  for(const chunk of objects){
    if(results.length>=120)break;
    const type=chunk.match(/\/FT\s*\/(Tx|Btn|Sig|Ch)\b/)?.[1];
    const name=chunk.match(/\/T\s*\(((?:\\.|[^\\)]){1,140})\)/)?.[1];
    if(!type||!name)continue;
    const fieldName=name.replace(/\\([\\()])/g,"$1").trim();
    if(!fieldName||fieldName.length>100||/[\x00-\x1f]/.test(fieldName)||seen.has(fieldName))continue;
    seen.add(fieldName);
    const label=fieldName.replace(/[_\-]+/g," ").replace(/([a-z])([A-Z])/g,"$1 $2").trim();
    if(label.length<2)continue;
    const normalized=label.toLowerCase();
    const fieldType:HrTemplateFieldHint["type"]=
      type==="Sig"||/\b(sign|signature|signed by)\b/.test(normalized)?"Signature":
      /\b(initial|initials)\b/.test(normalized)?"Initials":
      type==="Btn"?"Checkbox":/\bdate\b/.test(normalized)?"Date":"Text";
    const signer:HrTemplateFieldHint["signer"]=
      /\b(employer|company|manager|supervisor|hr representative|authorized officer)\b/.test(normalized)?"Company":"Worker";
    results.push({id:"detected-"+(results.length+1),label:label.slice(0,100),
      pdfFieldName:fieldName,type:fieldType,signer,
      required:fieldType==="Signature"||fieldType==="Initials"});
  }
  return results;
}
