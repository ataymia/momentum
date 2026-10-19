/* eslint-disable max-len, comma-spacing, space-before-blocks, indent, keyword-spacing, curly, key-spacing, brace-style, semi-spacing, operator-linebreak */
import {readFileSync} from "node:fs";
import {join} from "node:path";

export type InvoicePdfLine={
  product:string;
  cases:number;
  pricePerCase:number;
  amount:number;
};
export type InvoicePdfSignature={
  recipientName?:string;
  signedAt:string;
  strokes:Array<Array<[number,number]>>;
};
export type InvoicePdfInput={
  invoiceNumber:string;
  orderNumber:string;
  invoiceDate?:string;
  customerName:string;
  billingEmail:string;
  billToAddress?:string;
  billingContact?:string;
  billingPhone?:string;
  az5000Number?:string;
  shipToName?:string;
  shipToAddress?:string;
  shipToContact?:string;
  shipToPhone?:string;
  placedBy?:string;
  deliveredAt:string;
  terms:string;
  dueDate?:string;
  status?:string;
  total:number;
  paymentsReceived?:number;
  creditsApplied?:number;
  balanceDue?:number;
  lines:InvoicePdfLine[];
  signature?:InvoicePdfSignature;
};

const NAVY=[24/255,52/255,95/255];
const INK=[23/255,32/255,51/255];
const SLATE=[100/255,116/255,139/255];
const PALE=[248/255,250/255,252/255];
const RED=[201/255,48/255,44/255];
const formatMoney=(value:number)=>"$"+(Number.isFinite(value)?value:0).toFixed(2);
const clean=(value?:string)=>String(value??"").trim();
const pdfEscape=(value:string)=>value
  .replace(/[\u2018\u2019]/g,"'")
  .replace(/[\u201c\u201d]/g,'"')
  .replace(/[\u2013\u2014]/g,"-")
  .replace(/\u00a0/g," ")
  .replace(/[^\x20-\x7e]/g,"?")
  .replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)");
const dateLabel=(value?:string,includeTime=false)=>{
  if(!value)return "";
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return value;
  const options:Intl.DateTimeFormatOptions={
    timeZone:"America/Phoenix",month:"2-digit",day:"2-digit",year:"numeric",
  };
  if(includeTime){options.hour="numeric";options.minute="2-digit";}
  return new Intl.DateTimeFormat("en-US",options).format(date);
};
const dueLabel=(terms:string,dueDate?:string)=>{
  if(terms==="COD")return "Due upon delivery";
  if(terms==="Prepaid")return "Due before delivery";
  if(dueDate)return "Due "+dueDate;
  return "Due according to approved terms";
};
const rgb=(v:number[])=>v.map((n)=>n.toFixed(3)).join(" ");
const limit=(value:string,size:number,maxWidth:number)=>{
  const maxChars=Math.max(5,Math.floor(maxWidth/(size*.52)));
  if(value.length<=maxChars)return value;
  return value.slice(0,maxChars-3)+"...";
};
const wrap=(value:string,maxWidth:number,size:number)=>{
  const maxChars=Math.max(10,Math.floor(maxWidth/(size*.52)));
  const words=value.replace(/\s+/g," ").trim().split(" ").filter(Boolean);
  const rows:string[]=[];let current="";
  for(let word of words){
    while(word.length>maxChars){if(current){rows.push(current);current="";}rows.push(word.slice(0,maxChars));word=word.slice(maxChars);}
    if(!word)continue;
    const joined=current?current+" "+word:word;
    if(joined.length>maxChars&&current){rows.push(current);current=word;}else{current=joined;}
  }
  if(current)rows.push(current);
  return rows;
};
const tx=(value:string,x:number,y:number,size=9,bold=false,color=INK)=> 
  "BT /"+(bold?"F2":"F1")+" "+size+" Tf "+rgb(color)+
  " rg 1 0 0 1 "+x.toFixed(2)+" "+y.toFixed(2)+
  " Tm ("+pdfEscape(value)+") Tj ET\n";
const line=(x1:number,y1:number,x2:number,y2:number,color=SLATE,width=.65)=>
  rgb(color)+" RG "+width+" w "+x1+" "+y1+" m "+x2+" "+y2+" l S\n";
const box=(x:number,y:number,w:number,h:number,fill:number[],stroke?:number[])=>
  rgb(fill)+" rg "+(stroke?rgb(stroke)+" RG ":"")+
  x+" "+y+" "+w+" "+h+" re "+(stroke?"B":"f")+"\n";
const jpegDimensions=(data:Buffer)=>{
  if(data[0]!==0xff||data[1]!==0xd8)throw new Error("Invoice brand is not a JPEG.");
  let offset=2;
  while(offset+10<data.length){
    if(data[offset]!==0xff){offset++;continue;}
    const marker=data[offset+1];
    if([0xc0,0xc1,0xc2].includes(marker)){
      const height=data.readUInt16BE(offset+5);
      const width=data.readUInt16BE(offset+7);
      const components=data[offset+9];
      if(!width||!height||components!==3)throw new Error("Unsupported invoice brand color profile.");
      return {width,height};
    }
    if(marker===0xda||marker===0xd9)break;
    if(marker===0xd8||marker===0x01){offset+=2;continue;}
    const length=data.readUInt16BE(offset+2);
    if(length<2)break;
    offset+=2+length;
  }
  throw new Error("Invoice brand JPEG dimensions were not readable.");
};
const logo=()=>readFileSync(join(__dirname,"../assets/momentum-invoice-brand.jpg"));

type PdfPart=Buffer|string;
const renderPdf=(pages:string[],brand:Buffer)=>{
  const {width,height}=jpegDimensions(brand);
  const objects:Buffer[]=[Buffer.alloc(0)];
  const add=(value:PdfPart)=>{objects.push(Buffer.isBuffer(value)?value:Buffer.from(value,"latin1"));return objects.length-1;};
  const stream=(dictionary:string,bytes:Buffer)=>Buffer.concat([
    Buffer.from("<< "+dictionary+" /Length "+bytes.length+" >>\nstream\n","latin1"),
    bytes,Buffer.from("\nendstream","latin1"),
  ]);
  const imageId=add(stream("/Type /XObject /Subtype /Image /Width "+width+
    " /Height "+height+" /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode",brand));
  const fontId=add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const boldId=add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const alphaId=add("<< /Type /ExtGState /ca 0.10 /CA 0.10 >>");
  const pageIds:number[]=[];
  const contentIds=pages.map((page)=>add(stream("",Buffer.from(page,"latin1"))));
  const pagesId=objects.length+contentIds.length;
  for(const id of contentIds){
    pageIds.push(add("<< /Type /Page /Parent "+pagesId+" 0 R /MediaBox [0 0 612 792] "+
      "/Resources << /Font << /F1 "+fontId+" 0 R /F2 "+boldId+" 0 R >> "+
      "/XObject << /Im1 "+imageId+" 0 R >> /ExtGState << /GS1 "+alphaId+
      " 0 R >> >> /Contents "+id+" 0 R >>"));
  }
  // Pages count is resolved from the objects created above.
  const actualPagesId=add("<< /Type /Pages /Count "+pageIds.length+" /Kids ["+
    pageIds.map((id)=>id+" 0 R").join(" ")+"] >>");
  if(actualPagesId!==pagesId)throw new Error("Invoice PDF page tree allocation failed.");
  const catalogId=add("<< /Type /Catalog /Pages "+actualPagesId+" 0 R >>");
  let position=0;const chunks:Buffer[]=[];
  const push=(bytes:Buffer)=>{chunks.push(bytes);position+=bytes.length;};
  push(Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n","latin1"));
  const positions=[0];
  for(let id=1;id<objects.length;id++){
    positions[id]=position;
    push(Buffer.from(id+" 0 obj\n","latin1"));
    push(objects[id]);
    push(Buffer.from("\nendobj\n","latin1"));
  }
  const xref=position;
  push(Buffer.from("xref\n0 "+objects.length+"\n0000000000 65535 f \n","latin1"));
  for(let id=1;id<objects.length;id++){
    push(Buffer.from(String(positions[id]).padStart(10,"0")+" 00000 n \n","latin1"));
  }
  push(Buffer.from("trailer\n<< /Size "+objects.length+" /Root "+catalogId+
    " 0 R >>\nstartxref\n"+xref+"\n%%EOF\n","latin1"));
  return Buffer.concat(chunks);
};
const brandImage=(x:number,y:number,w:number,h:number)=>
  "q "+w+" 0 0 "+h+" "+x+" "+y+" cm /Im1 Do Q\n";

const signatureInk=(signature:InvoicePdfSignature,x:number,y:number,w:number,h:number)=>{
  let commands="q "+x+" "+y+" "+w+" "+h+" re W n 0.12 0.16 0.25 RG 1.35 w 1 J 1 j\n";
  for(const stroke of signature.strokes.slice(0,80)){
    if(stroke.length<2)continue;
    stroke.slice(0,300).forEach(([pointX,pointY],index)=>{
      const xx=x+Math.max(0,Math.min(1000,pointX))/1000*w;
      const yy=y+h-Math.max(0,Math.min(300,pointY))/300*h;
      commands+=xx.toFixed(2)+" "+yy.toFixed(2)+(index===0?" m\n":" l\n");
    });
    commands+="S\n";
  }
  return commands+"Q\n";
};
const subheading=(label:string,x:number,y:number)=>tx(label,x,y,7.2,true,NAVY);
const details=(rows:string[],x:number,y:number,width:number)=>{
  let out="";let at=y;
  for(const value of rows){
    for(const fragment of wrap(value,width,7.4)){
      if(at<549)break;
      out+=tx(fragment,x,at,7.4,false,INK);at-=10;
    }
    if(at<549)break;
  }
  return out;
};

/**
 * Produce the branded CRM invoice as a PDF, placing captured signature strokes
 * directly on the CRM's Customer signature receipt line.
 * Uses the exact artwork committed under public/momentum-invoice-brand.jpg.
 * Does not substitute an unsigned/generic invoice when the asset is missing.
 * @param {InvoicePdfInput} input Verified persisted invoice and delivery facts.
 * @return {Buffer} Signed invoice PDF attachment.
 */
export function buildSignedInvoicePdf(input:InvoicePdfInput):Buffer{
  const brand=logo();
  if(!clean(input.invoiceNumber)||!clean(input.orderNumber)||!input.lines.length){
    throw new Error("Cannot render an invoice without its saved invoice, order and lines.");
  }
  const totalCases=input.lines.reduce((sum,item)=>sum+item.cases,0);
  const paid=Math.max(0,input.paymentsReceived??0);
  const credits=Math.max(0,input.creditsApplied??0);
  const balance=Math.max(0,input.balanceDue??input.total-paid-credits);
  const status=input.status??(balance<=0?"Paid":balance<input.total?"Partially paid":"Open");
  const perPage=7;
  const groups:InvoicePdfLine[][]=[];
  for(let offset=0;offset<input.lines.length;offset+=perPage){
    groups.push(input.lines.slice(offset,offset+perPage));
  }
  const pages=groups.map((group,index)=>{
    let out="1 w 0 G\n";
    // Same artwork, navy palette and major sections as invoice-print-center.tsx.
    out+="q /GS1 gs "+brandImage(150,245,285,190)+"Q\n";
    out+=brandImage(36,671,152,101);
    out+=tx("MOMENTUM DISTRIBUTION INC.",198,743,10.1,true,NAVY);
    out+=tx("Golden Eagle distribution",198,729,7.7,false,SLATE);
    out+=tx("8550 N 91st Ave. Ste #5",198,717,7.7,false,SLATE);
    out+=tx("Peoria, AZ 85345",198,706,7.7,false,SLATE);
    out+=tx("INVOICE",470,735,19,true,NAVY);
    out+=line(36,681,576,681,NAVY,2.5);
    const cols=[36,224,417];
    const from=[
      "Momentum Distribution Inc.",
      "8550 N 91st Ave. Ste #5",
      "Peoria, AZ 85345",
      "602-500-6811 | Florim Ymeri",
      "sales@momentumdci.com",
    ];
    const bill=[
      input.customerName,
      clean(input.billToAddress),
      input.billingContact?"A/P: "+input.billingContact:"",
      clean(input.billingPhone),
      clean(input.billingEmail),
      input.az5000Number?"AZ-5000: "+input.az5000Number:"",
    ].filter(Boolean);
    const ship=[
      input.shipToName||"Customer location",
      clean(input.shipToAddress),
      clean(input.shipToContact),
      clean(input.shipToPhone),
    ].filter(Boolean);
    for(let i=0;i<3;i++)out+=subheading(["FROM","BILL TO","SHIP TO"][i],cols[i],662);
    out+=details(from,cols[0],647,177);
    out+=details(bill,cols[1],647,184);
    out+=details(ship,cols[2],647,157);
    out+=line(36,539,576,539,[.85,.89,.93],.5);
    const meta=[
      ["INVOICE #",input.invoiceNumber],
      ["INVOICE DATE",dateLabel(input.invoiceDate??input.deliveredAt)],
      ["ORDER #",input.orderNumber],
    ];
    meta.forEach(([label,value],i)=>{
      const x=36+i*182;
      out+=subheading(label,x,525);
      out+=tx(limit(value,9,166),x,511,9,true);
    });
    out+=line(36,501,576,501,[.85,.89,.93],.6);
    const extra=[
      ["TERMS",input.terms],
      ["DUE",dueLabel(input.terms,input.dueDate)],
      ["STATUS",status],
      ["CASES",String(totalCases)],
      ["PLACED BY",input.placedBy||"Not recorded"],
    ];
    extra.forEach(([label,value],i)=>{
      const x=36+i*109;
      out+=box(x,446,104,43,PALE,[.86,.89,.93]);
      out+=subheading(label,x+7,474);
      out+=tx(limit(value,7.6,92),x+7,459,7.6,true);
    });
    out+=box(36,419,540,21,NAVY);
    out+=tx("QTY",44,427,7.5,true,[1,1,1]);
    out+=tx("DESCRIPTION",95,427,7.5,true,[1,1,1]);
    out+=tx("UNIT PRICE",406,427,7.5,true,[1,1,1]);
    out+=tx("AMOUNT",514,427,7.5,true,[1,1,1]);
    group.forEach((item,i)=>{
      const y=404-17*i;
      out+=tx(String(item.cases),48,y,8);
      out+=tx(limit(item.product,8,286),95,y,8);
      out+=tx(formatMoney(item.pricePerCase),407,y,8);
      out+=tx(formatMoney(item.amount),511,y,8);
      out+=line(36,y-5,576,y-5,[.89,.92,.95],.6);
    });
    if(groups.length>1){
      out+=tx("Page "+(index+1)+" of "+groups.length,36,272,8,false,SLATE);
    }
    const last=index===groups.length-1;
    if(last){
      out+=tx("Subtotal",399,278,9);
      out+=tx(formatMoney(input.total),508,278,9,true);
      if(paid>0){
        out+=tx("Payments received",399,265,8);
        out+=tx("-"+formatMoney(paid),508,265,8);
      }
      if(credits>0){
        out+=tx("Credits applied",399,252,8);
        out+=tx("-"+formatMoney(credits),508,252,8);
      }
      out+=line(386,245,576,245,NAVY,1.3);
      out+=tx("TOTAL / BALANCE DUE",386,230,8.5,true,RED);
      out+=tx(formatMoney(balance),510,230,9,true,RED);
      out+=subheading("CUSTOMER SIGNATURE",36,218);
      out+=subheading("PRINTED NAME",314,218);
      out+=subheading("DATE / TIME",463,218);
      if(input.signature){
        out+=signatureInk(input.signature,39,168,252,43);
        out+=line(36,165,299,165,SLATE,.7);
        out+=tx(limit(input.signature.recipientName||"Recipient",8,142),314,183,8,true);
        out+=tx(dateLabel(input.signature.signedAt,true),463,183,7.6,true);
      }else{
        out+=line(36,171,299,171,SLATE,.7);
        out+=tx("Delivery confirmed",314,183,8,true);
        out+=tx(dateLabel(input.deliveredAt,true),463,183,7.6,true);
      }
      out+=subheading("PAYMENT RECEIVED",36,153);
      out+=subheading("METHOD",226,153);
      out+=subheading("REFERENCE / CHECK NO.",403,153);
      out+=line(36,140,208,140,SLATE,.65);
      out+=line(226,140,386,140,SLATE,.65);
      out+=line(403,140,576,140,SLATE,.65);
      out+=box(36,54,540,75,PALE,[.86,.89,.93]);
      out+=subheading("TERMS & CONDITIONS",46,116);
      out+=tx(limit(input.terms+" | "+dueLabel(input.terms,input.dueDate)+".",7.3,508),46,104,7.3);
      out+=tx("Zelle: momentumdistributioninc@gmail.com",46,93,7.3);
      out+=tx("Bank transfer / wire: obtain current remittance instructions from an authorized Momentum representative.",46,82,7.1);
      out+=tx(limit("Reference invoice "+input.invoiceNumber+" with every payment. Sales: sales@momentumdci.com.",7.1,508),46,71,7.1);
      if(input.terms==="COD")out+=tx("COD orders are payable at delivery.",46,61,6.8);
    }else{
      out+=tx("Line items continue on the next page.",36,265,9,true,SLATE);
    }
    out+=line(36,40,576,40,[.86,.89,.93],.6);
    out+=tx("Momentum Distribution Inc. | 602-500-6811",36,28,7,false,SLATE);
    out+=tx("8550 N 91st Ave. Ste #5, Peoria, AZ 85345",290,28,7,false,SLATE);
    out+=tx("Copy 1",548,28,7,false,SLATE);
    return out;
  });
  return renderPdf(pages,brand);
}
