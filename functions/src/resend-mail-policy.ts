/* eslint-disable max-len, comma-spacing, no-control-regex, space-before-blocks, indent, keyword-spacing, curly, switch-colon-spacing, key-spacing, brace-style, semi-spacing */
import {createHash,createHmac,timingSafeEqual} from "node:crypto";

export type MailStatus=
  "Approved"|"Attempting"|"Provider accepted"|"Delivered"|
  "Deferred"|"Bounced"|"Complained"|"Suppressed"|"Failed"|"Review required";
export type MailAttachment={
  filename:string;
  content:string;
  contentType:string;
};
export type ServerMail={
  id:string;
  kind:string;
  policyId?:string;
  authorizationType?:"Human Administrator"|"Trusted system";
  sourcePath:string;
  sourceRecordId:string;
  eventId:string;
  templateVersion:number;
  approvedBy:string;
  approvedAt:string;
  to:string;
  recipientUid?:string;
  subject:string;
  text:string;
  attachments?:MailAttachment[];
  idempotencyKey:string;
  status:MailStatus;
  createdAt:string;
};
export const safeMail=(value:string)=>value.length<=254&&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)&&!/[\r\n]/.test(value);
export const safeText=(value:string,max:number)=>value.length>0&&
  value.length<=max&&!/[\x00-\x08\x0b-\x1f\x7f]/.test(value);
export function validMailToSend(value:ServerMail,cutoff:string){
 if(value.status!=="Approved")return "Not approved for transport.";
 if(!Number.isFinite(Date.parse(cutoff))||!Number.isFinite(Date.parse(value.createdAt))||
   Date.parse(value.createdAt)<Date.parse(cutoff))return "Historical or unapproved activation window.";
 if(!safeMail(value.to)||!safeText(value.subject,190)||/[\r\n]/.test(value.subject)||!safeText(value.text,5000))
   return "Unsafe or missing delivery fields.";
 if(!safeText(value.idempotencyKey,256)||!safeText(value.eventId,200)||
    !safeText(value.sourcePath,220)||!safeText(value.sourceRecordId,220)||
    !safeText(value.approvedBy,150)||!Number.isFinite(Date.parse(value.approvedAt)))
   return "Missing trusted approval/source identity.";
 if(value.attachments){
   if(!Array.isArray(value.attachments)||value.attachments.length>3)
     return "Invalid attachment set.";
   for(const attachment of value.attachments){
     if(!attachment||!safeText(attachment.filename,180)||
       attachment.contentType!=="application/pdf"||
       typeof attachment.content!=="string"||
       attachment.content.length<16||attachment.content.length>8_000_000||
       !/^[A-Za-z0-9+/=]+$/.test(attachment.content))
       return "Invalid attachment.";
   }
 }
 return null;
}
export const emailHash=(value:string)=>createHash("sha256")
  .update(value.trim().toLowerCase()).digest("hex");

/** Resend webhook header signing follows the Svix standard; raw bytes are required. */
export function verifyResendWebhook(
 payload:string,headerId:string,headerTime:string,headerSignature:string,
 secret:string,now=Date.now(),
):boolean{
 if(!headerId||!/^[0-9]+$/.test(headerTime)||!headerSignature||
   !secret.startsWith("whsec_"))return false;
 const when=Number(headerTime)*1000;
 if(!Number.isFinite(when)||Math.abs(now-when)>5*60*1000)return false;
 const key=Buffer.from(secret.slice(6),"base64");
 if(key.length<16)return false;
 const digest=createHmac("sha256",key)
   .update(`${headerId}.${headerTime}.${payload}`,"utf8").digest();
 return headerSignature.split(" ").some((signature)=>{
   const [version,signed]=signature.split(",");
   if(version!=="v1"||!signed)return false;
   const bytes=Buffer.from(signed,"base64");
   return bytes.length===digest.length&&timingSafeEqual(bytes,digest);
 });
}
export function providerStatus(event:string):MailStatus|null{
 switch(event){
 case "email.delivered":return "Delivered";
 case "email.delivery_delayed":return "Deferred";
 case "email.bounced":return "Bounced";
 case "email.complained":return "Complained";
 case "email.failed":return "Failed";
 case "email.suppressed":return "Suppressed";
 case "email.sent":return "Provider accepted";
 default:return null;
 }
}
export function nextMailStatus(current:MailStatus,event:string):MailStatus|null{
 const incoming=providerStatus(event);
 if(!incoming)return null;
 if(["Bounced","Complained","Suppressed","Delivered"].includes(current))return null;
 if(current==="Provider accepted"&&incoming==="Provider accepted")return null;
 if(current==="Failed"&&incoming==="Provider accepted")return null;
 return incoming;
}
