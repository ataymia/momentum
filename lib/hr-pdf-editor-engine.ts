import {
 PDFDocument,PDFTextField,PDFCheckBox,PDFDropdown,PDFRadioGroup,PDFOptionList,
 StandardFonts,rgb,
} from "pdf-lib";

export type PdfFieldType="Text"|"Checkbox"|"Dropdown"|"Radio"|"List"|"Other";
export type PdfDetectedField={name:string;type:PdfFieldType;options:string[];suggestedRole:"Worker"|"Company";suggestedKind:"Text"|"Date"|"Initials"|"Signature"|"Checkbox"};
export type PdfPageInfo={page:number;width:number;height:number};
export type PdfInfo={pages:PdfPageInfo[];fields:PdfDetectedField[]};
export type PdfOverlay={
 page:number;kind:"Text"|"Date"|"Initials"|"Signature";
 x:number;y:number;width:number;height:number;
 text?:string;pngDataUrl?:string;fontSize?:number;
};
const max=12*1024*1024;
const text=(v:unknown)=>typeof v==="string"?v.trim():"";
const bytes=(input:Uint8Array|ArrayBuffer)=>input instanceof Uint8Array?input:new Uint8Array(input);
const validate=(input:Uint8Array|ArrayBuffer)=>{
 const b=bytes(input);
 if(b.length<16||b.length>max||new TextDecoder("latin1").decode(b.subarray(0,5))!=="%PDF-")
  throw new Error("Choose a valid PDF under 12 MB.");
 return b;
};
const getType=(field:ReturnType<ReturnType<PDFDocument["getForm"]>["getFields"]>[number]):PdfFieldType=>{
 if(field instanceof PDFTextField)return "Text";
 if(field instanceof PDFCheckBox)return "Checkbox";
 if(field instanceof PDFDropdown)return "Dropdown";
 if(field instanceof PDFRadioGroup)return "Radio";
 if(field instanceof PDFOptionList)return "List";
 return "Other";
};
const inferred=(name:string)=>{
 const lowered=name.toLowerCase().replace(/[_\-.]/g," ");
 const suggestedKind:PdfDetectedField["suggestedKind"]=
  /\b(initial|initials)\b/.test(lowered)?"Initials":
  /\b(signature|sign here|signed by)\b/.test(lowered)?"Signature":
  /\b(date|dated)\b/.test(lowered)?"Date":
  /\b(check|accept|agree|consent)\b/.test(lowered)?"Checkbox":"Text";
 const suggestedRole:PdfDetectedField["suggestedRole"]=
  /\b(employer|company|manager|supervisor|hr representative)\b/.test(lowered)?"Company":"Worker";
 return{suggestedKind,suggestedRole};
};

/** Find fields in compressed or uncompressed AcroForm PDFs without OCR or remote uploads. */
export async function inspectHrPdf(input:Uint8Array|ArrayBuffer):Promise<PdfInfo>{
 const doc=await PDFDocument.load(validate(input));
 const pages=doc.getPages().map((page,index)=>({
  page:index+1,width:page.getWidth(),height:page.getHeight(),
 }));
 const fields=doc.getForm().getFields().slice(0,250).map(field=>{
  const name=field.getName(),type=getType(field);
  const options=field instanceof PDFDropdown||field instanceof PDFOptionList?
   field.getOptions():field instanceof PDFRadioGroup?field.getOptions():[];
  return{name,type,options,...inferred(name)};
 });
 return{pages,fields};
}
export type HrPdfFields=Record<string,string|boolean>;

/** Embed AcroForm values and optional precisely placed text or drawn marks.
 * This makes an edited PDF; it never proves identity, consent or legal signature validity.
 */
export async function fillHrPdf(
 input:Uint8Array|ArrayBuffer,values:HrPdfFields,overlays:PdfOverlay[],flatten=false,
):Promise<Uint8Array>{
 const original=validate(input),doc=await PDFDocument.load(original);
 const form=doc.getForm(),fields=new Map(form.getFields().map(field=>[field.getName(),field]));
 for(const [name,value] of Object.entries(values)){
  const field=fields.get(name);
  if(!field)throw new Error("PDF field missing: "+name);
  if(field instanceof PDFTextField){
   if(typeof value!=="string")throw new Error("Text required for "+name);
   field.setText(value);
  }else if(field instanceof PDFCheckBox){
   if(typeof value!=="boolean")throw new Error("Checkmark required for "+name);
   value?field.check():field.uncheck();
  }else if(field instanceof PDFDropdown||field instanceof PDFRadioGroup||
   field instanceof PDFOptionList){
   if(typeof value!=="string"||!field.getOptions().includes(value))
    throw new Error("Choose an available PDF option for "+name);
   field.select(value);
  }else throw new Error("This PDF field requires manual placement: "+name);
 }
 const pages=doc.getPages(),font=await doc.embedFont(StandardFonts.Helvetica);
 if(Object.keys(values).length)form.updateFieldAppearances(font);
 for(const overlay of overlays){
  if(!Number.isSafeInteger(overlay.page)||overlay.page<1||overlay.page>pages.length||
   !["Text","Date","Initials","Signature"].includes(overlay.kind)||
   ![overlay.x,overlay.y,overlay.width,overlay.height].every(Number.isFinite)||
   overlay.x<0||overlay.y<0||overlay.width<5||overlay.height<5||
   overlay.x+overlay.width>pages[overlay.page-1].getWidth()+0.5||
   overlay.y+overlay.height>pages[overlay.page-1].getHeight()+0.5)
   throw new Error("Manual PDF field is outside the selected page.");
  const page=pages[overlay.page-1];
  if(overlay.pngDataUrl){
   if(overlay.kind!=="Signature"&&overlay.kind!=="Initials")
    throw new Error("Only signature or initials marks may use an image.");
   if(!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(overlay.pngDataUrl)||
    overlay.pngDataUrl.length>2_000_000)
    throw new Error("Drawn mark must be a small PNG image.");
   const image=await doc.embedPng(overlay.pngDataUrl);
   page.drawImage(image,{x:overlay.x,y:overlay.y,width:overlay.width,height:overlay.height});
  }else{
   const value=text(overlay.text);
   if(!value||value.length>160||/[\u0000-\u001f\u007f]/.test(value))
    throw new Error("Enter a valid visible text value for the PDF field.");
   const fontSize=overlay.fontSize??11;
   if(!Number.isFinite(fontSize)||fontSize<5||fontSize>24)
    throw new Error("PDF text size must be between 5 and 24.");
   if(font.widthOfTextAtSize(value,fontSize)>overlay.width)
    throw new Error("Text is too wide for the selected PDF rectangle.");
   page.drawText(value,{x:overlay.x,y:overlay.y+Math.max(0,(overlay.height-fontSize)/2),
    size:fontSize,font,color:rgb(0,0,0)});
  }
 }
 if(flatten)form.flatten();
 const output=await doc.save({useObjectStreams:false});
 const verified=await PDFDocument.load(output);
 if(verified.getPageCount()!==pages.length)
  throw new Error("PDF page count changed during editing.");
 return output;
}
