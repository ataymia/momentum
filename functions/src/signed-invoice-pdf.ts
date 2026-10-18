/* eslint-disable max-len, comma-spacing, no-control-regex, space-before-blocks, indent, keyword-spacing, curly, key-spacing, brace-style, semi-spacing */
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
  customerName:string;
  billingEmail:string;
  billToAddress?:string;
  shipToAddress?:string;
  deliveredAt:string;
  terms:string;
  dueDate?:string;
  total:number;
  lines:InvoicePdfLine[];
  signature?:InvoicePdfSignature;
  adminOverride?:boolean;
};

const ascii=(value:string)=>value
  .replace(/[^\x20-\x7e]/g,"?")
  .replace(/\\/g,"\\\\")
  .replace(/\(/g,"\\(")
  .replace(/\)/g,"\\)");

const money=(value:number)=>"$"+value.toFixed(2);

const text=(value:string,x:number,y:number,size=10,bold=false)=>
  `BT /${bold?"F2":"F1"} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${ascii(value)}) Tj ET\n`;

const line=(x1:number,y1:number,x2:number,y2:number)=>
  `${x1} ${y1} m ${x2} ${y2} l S\n`;

const wrap=(value:string,max=72)=>{
  const words=value.trim().split(/\s+/).filter(Boolean);
  const result:string[]=[];
  let current="";
  for(const word of words){
    const next=current?current+" "+word:word;
    if(next.length>max&&current){
      result.push(current);
      current=word;
    }else{
      current=next;
    }
  }
  if(current)result.push(current);
  return result;
};

const pdfDate=(value:string)=>{
  const date=new Date(value);
  return Number.isNaN(date.getTime())?value:date.toISOString().slice(0,10);
};

const signatureCommands=(signature:InvoicePdfSignature)=>{
  const left=72;
  const bottom=88;
  const width=468;
  const height=74;
  let out="0.8 w 0 G\n"+`${left} ${bottom} ${width} ${height} re S\n`;
  for(const stroke of signature.strokes.slice(0,80)){
    if(stroke.length<2)continue;
    const first=stroke[0];
    const sx=left+(first[0]/1000)*width;
    const sy=bottom+height-(first[1]/300)*height;
    out+=`${sx.toFixed(2)} ${sy.toFixed(2)} m\n`;
    for(const point of stroke.slice(1,300)){
      const x=left+(point[0]/1000)*width;
      const y=bottom+height-(point[1]/300)*height;
      out+=`${x.toFixed(2)} ${y.toFixed(2)} l\n`;
    }
    out+="S\n";
  }
  return out;
};

const buildPdf=(stream:string)=>{
  const objects:string[]=[];
  objects[1]="1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
  objects[2]="2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n";
  objects[3]="3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n";
  objects[4]="4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n";
  objects[5]="5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n";
  objects[6]=`6 0 obj\n<< /Length ${Buffer.byteLength(stream,"latin1")} >>\nstream\n${stream}endstream\nendobj\n`;

  let output="%PDF-1.4\n%Momentum\n";
  const offsets:number[]=[0];
  for(let index=1;index<=6;index++){
    offsets[index]=Buffer.byteLength(output,"latin1");
    output+=objects[index];
  }
  const xref=Buffer.byteLength(output,"latin1");
  output+="xref\n0 7\n0000000000 65535 f \n";
  for(let index=1;index<=6;index++){
    output+=String(offsets[index]).padStart(10,"0")+" 00000 n \n";
  }
  output+=`trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output,"latin1");
};

/**
 * Render the delivered invoice as a compact signed PDF attachment.
 * @param {InvoicePdfInput} input Verified delivery, invoice and customer data.
 * @return {Buffer} Complete PDF bytes.
 */
export function buildSignedInvoicePdf(input:InvoicePdfInput):Buffer{
  let stream="1 w 0 G\n";
  stream+=text("MOMENTUM DISTRIBUTION INC.",72,744,18,true);
  stream+=text("SIGNED DELIVERY INVOICE",72,720,13,true);
  stream+=text("Invoice # "+input.invoiceNumber,390,744,10,true);
  stream+=text("Order # "+input.orderNumber,390,728,9);
  stream+=text("Delivered "+pdfDate(input.deliveredAt),390,712,9);
  stream+=line(72,700,540,700);

  stream+=text("BILL TO",72,680,9,true);
  stream+=text(input.customerName,72,665,10,true);
  stream+=text(input.billingEmail,72,650,9);
  let billY=635;
  for(const row of wrap(input.billToAddress??"",55).slice(0,3)){
    stream+=text(row,72,billY,8);
    billY-=12;
  }

  stream+=text("SHIP TO",330,680,9,true);
  let shipY=665;
  for(const row of wrap(input.shipToAddress??"Same as business address",42).slice(0,4)){
    stream+=text(row,330,shipY,8);
    shipY-=12;
  }

  stream+=text("Terms: "+input.terms,330,615,9);
  stream+=text("Due: "+(input.dueDate??(input.terms==="COD"?"On delivery":"Per invoice terms")),330,600,9);
  stream+=line(72,585,540,585);

  stream+=text("Product",72,566,8,true);
  stream+=text("Cases",356,566,8,true);
  stream+=text("Price/case",408,566,8,true);
  stream+=text("Amount",492,566,8,true);
  stream+=line(72,558,540,558);

  let y=542;
  for(const item of input.lines.slice(0,24)){
    const product=item.product.length>46?item.product.slice(0,43)+"...":item.product;
    stream+=text(product,72,y,7);
    stream+=text(String(item.cases),365,y,7);
    stream+=text(money(item.pricePerCase),420,y,7);
    stream+=text(money(item.amount),492,y,7);
    y-=12;
  }
  if(input.lines.length>24){
    stream+=text("Additional order lines remain in the Momentum order record.",72,y,7);
    y-=12;
  }
  const totalY=Math.max(y-8,205);
  stream+=line(360,totalY+20,540,totalY+20);
  stream+=text("INVOICE TOTAL",400,totalY,10,true);
  stream+=text(money(input.total),492,totalY,10,true);

  stream+=text("DELIVERY CONFIRMATION",72,182,9,true);
  if(input.signature){
    stream+=signatureCommands(input.signature);
    stream+=text(
      "Signed by: "+(input.signature.recipientName??"Recipient"),
      72,72,8,
    );
    stream+=text("Signed: "+pdfDate(input.signature.signedAt),330,72,8);
  }else if(input.adminOverride){
    stream+=text(
      "Delivery confirmed by authorized Administrator override.",
      72,135,9,true,
    );
    stream+=text("Confirmed: "+pdfDate(input.deliveredAt),72,118,8);
  }
  stream+=text(
    "This invoice was issued from Momentum's recorded delivered order.",
    72,42,7,
  );
  return buildPdf(stream);
}
