import {createHash} from "node:crypto";

/**
 * Phase-1 email event contract. It has no sender, network requests or secrets.
 * Only a trusted backend can later verify a source record and enqueue it.
 * Nothing in the current browser notification ledger is send-authoritative.
 */

export const EMAIL_TEMPLATE_VERSION=1;
export const EMAIL_TRANSPORT_ENABLED=false;

export type EmailEventKind=
  | "employee_onboarding_ready"
  | "order_approved"
  | "order_out_for_delivery"
  | "order_delivered"
  | "invoice_issued"
  | "payment_received"
  | "program_pricing_30_day_warning"
  | "dispatch_exception";

type EmailBase={
  eventId:string;
  sourceRecordId:string;
  occurredAt:string;
  recipientEmail:string;
  recipientName:string;
  /** Verified against userAccess on server before queueing to employees. */
  recipientAccountState?:
    "Active"|"Onboarding"|"Password change required"|
    "Pending approval"|"Suspended"|"Separated";
};

type EmailEventData=
  | {kind:"employee_onboarding_ready"}
  | {kind:"order_approved"|"order_out_for_delivery"|"order_delivered";
    orderNumber:string}
  | {kind:"invoice_issued";invoiceNumber:string}
  | {kind:"payment_received";receiptReference:string}
  | {kind:"program_pricing_30_day_warning";
    accountName:string;expirationDate:string}
  | {kind:"dispatch_exception";caseReference:string};

export type EmailEvent=EmailBase&EmailEventData;
export type PreparedEmail={
  idempotencyKey:string;
  templateVersion:number;
  kind:EmailEventKind;
  to:string;
  subject:string;
  text:string;
  sourceRecordId:string;
  eventId:string;
  occurredAt:string;
};
export type EmailPreparation=
  | {ok:true;email:PreparedEmail}
  | {ok:false;reason:string};

const validDate=(value:string)=>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)&&
  Number.isFinite(Date.parse(value));
const safeToken=(value:unknown,max=100):value is string=>
  typeof value==="string"&&value.length>0&&value.length<=max&&
  !/[\r\n\x00-\x1f\x7f]/.test(value);
const normalizedEmail=(value:string)=>
  typeof value==="string"?value.trim().toLowerCase():"";
const validEmail=(value:string)=>
  value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)&&
  !/[\r\n\x00-\x1f\x7f]/.test(value);

function template(input:EmailEvent):{subject:string;text:string}|null{
  const first=input.recipientName.trim()||"there";
  const greeting=`Hello ${first},\n\n`;
  switch(input.kind){
  case "employee_onboarding_ready":
    return {
      subject:"Your Momentum onboarding is ready",
      text:greeting+
        "Your employee onboarding is ready for review. "+
        "Sign in to the Momentum platform using your assigned credentials. "+
        "Momentum will never ask you to send your password by email.\n\n"+
        "If you need access assistance, contact your company administrator.",
    };
  case "order_approved":
    return {
      subject:`Momentum order ${input.orderNumber} approved`,
      text:greeting+`Order ${input.orderNumber} has been approved. `+
        "Delivery and payment updates will be communicated separately.",
    };
  case "order_out_for_delivery":
    return {
      subject:`Momentum order ${input.orderNumber} is out for delivery`,
      text:greeting+`Order ${input.orderNumber} is out for delivery. `+
        "This notice does not confirm delivery or payment.",
    };
  case "order_delivered":
    return {
      subject:`Momentum delivery recorded for ${input.orderNumber}`,
      text:greeting+`Delivery was recorded for order ${input.orderNumber}. `+
        "Any unpaid balance remains governed by the invoice and payment record.",
    };
  case "invoice_issued":
    return {
      subject:`Momentum invoice ${input.invoiceNumber} issued`,
      text:greeting+`Invoice ${input.invoiceNumber} has been issued. `+
        "View it in your authenticated Momentum account or use the "+
        "separately verified invoice delivery channel. "+
        "Do not send payment card details by email.",
    };
  case "payment_received":
    return {
      subject:"Momentum payment receipt recorded",
      text:greeting+`Payment receipt ${input.receiptReference} was recorded. `+
        "Refer to the authenticated invoice ledger for the cleared balance.",
    };
  case "program_pricing_30_day_warning":
    return {
      subject:"Momentum program pricing review due in 30 days",
      text:greeting+`Program pricing for ${input.accountName} is scheduled to `+
        `expire on ${input.expirationDate}. Review the approved terms `+
        "before the expiration date. Renewal is not automatic.",
    };
  case "dispatch_exception":
    return {
      subject:"Momentum dispatch exception needs review",
      text:greeting+`Dispatch exception ${input.caseReference} requires `+
        "authorized Operations follow-up. Review its source record "+
        "in Momentum before taking action.",
    };
  }
}

/**
 * Pure validated preview. It does not send, queue or validate the source
 * record itself. Only a server-side, authoritative event may call a future
 * dispatcher. Never send old browser "Awaiting integration" notifications.
 */
export function prepareTransactionalEmail(input:EmailEvent):EmailPreparation{
  if(!input||!safeToken(input.eventId)||!safeToken(input.sourceRecordId))
    return {ok:false,reason:"Missing authoritative event/source identity."};
  if(!validDate(input.occurredAt))
    return {ok:false,reason:"Invalid source event timestamp."};
  const to=normalizedEmail(input.recipientEmail??"");
  if(!validEmail(to))
    return {ok:false,reason:"Recipient address is not valid."};
  if(["Separated","Suspended"].includes(input.recipientAccountState??""))
    return {ok:false,reason:"Recipient employee access is disabled."};
  if(!safeToken(input.recipientName??"",150))
    return {ok:false,reason:"Recipient name is invalid."};

  const specifics:unknown[]=[];
  switch(input.kind){
  case "employee_onboarding_ready":
    break;
  case "order_approved":
  case "order_out_for_delivery":
  case "order_delivered":
    specifics.push(input.orderNumber);
    break;
  case "invoice_issued":
    specifics.push(input.invoiceNumber);
    break;
  case "payment_received":
    specifics.push(input.receiptReference);
    break;
  case "program_pricing_30_day_warning":
    specifics.push(input.accountName,input.expirationDate);
    if((!/^\d{4}-\d{2}-\d{2}$/.test(input.expirationDate)||
      !Number.isFinite(Date.parse(input.expirationDate))||
      new Date(input.expirationDate).toISOString().slice(0,10)!==input.expirationDate))
      return {ok:false,reason:"Expiration date is invalid."};
    break;
  case "dispatch_exception":
    specifics.push(input.caseReference);
    break;
  default:
    return {ok:false,reason:"Unsupported email event."};
  }
  if(specifics.some((value)=>typeof value!=="string"||
    !safeToken(value as string,150)))
    return {ok:false,reason:"Template input is invalid."};

  const copy=template(input);
  if(!copy)return {ok:false,reason:"No approved template exists."};
  const digest=createHash("sha256").update(JSON.stringify([
    EMAIL_TEMPLATE_VERSION,input.kind,input.eventId,to,
  ])).digest("hex");
  return {ok:true,email:{
    idempotencyKey:`momentum-email-v${EMAIL_TEMPLATE_VERSION}-${digest}`,
    templateVersion:EMAIL_TEMPLATE_VERSION,
    kind:input.kind,
    to,subject:copy.subject,text:copy.text,
    sourceRecordId:input.sourceRecordId,
    eventId:input.eventId,
    occurredAt:input.occurredAt,
  }};
}
