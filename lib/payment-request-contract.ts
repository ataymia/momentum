import {isValidCalendarDateKey} from "./date-time";
export type ChargeCadence="once"|"monthly"|"quarterly";
export type ChargeRail="ACH"|"Card";
export type RequestDraft={invoiceId:string;accountId:string;currency:"USD";amountCents:number;cadence:ChargeCadence;rail:ChargeRail;firstDate:string;appliesTo:"invoice_balance"|"future_invoices";status:"Draft - never sent"};
export type RequestResult={ok:true;value:RequestDraft}|{ok:false;error:string};
export function shiftBillingMonths(firstDate:string,months:number):string{
  if(!isValidCalendarDateKey(firstDate)||!Number.isInteger(months)||months<1||months>120)throw new Error("Invalid payment schedule.");
  const y=Number(firstDate.slice(0,4)),m=Number(firstDate.slice(5,7)),d=Number(firstDate.slice(8,10));
  const first=new Date(Date.UTC(y,m-1+months,1,12));
  const lastDay=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0,12)).getUTCDate();
  return [first.getUTCFullYear(),String(first.getUTCMonth()+1).padStart(2,"0"),String(Math.min(d,lastDay)).padStart(2,"0")].join("-");
}
export function previewChargeDates(firstDate:string,cadence:ChargeCadence,count=4):string[]{
  if(!isValidCalendarDateKey(firstDate)||!Number.isInteger(count)||count<1||count>12)throw new Error("Invalid preview dates.");
  if(cadence==="once")return[firstDate];
  const step=cadence==="monthly"?1:3;
  return Array.from({length:count},(_,i)=>i===0?firstDate:shiftBillingMonths(firstDate,step*i));
}
export function prepareRequest(
  input:{invoiceId:string;accountId:string;amount:number;rail:ChargeRail;cadence:ChargeCadence;firstDate:string},
  ctx:{actorAuthorized:boolean;invoiceAccountId:string;unpaidBalance:number;invoiceState:string;today:string},
):RequestResult{
  if(!ctx.actorAuthorized||input.accountId!==ctx.invoiceAccountId||!input.invoiceId)
    return{ok:false,error:"Invoice account or employee authorization failed."};
  if(["Void","Draft"].includes(ctx.invoiceState)||ctx.unpaidBalance<=0)
    return{ok:false,error:"An issued invoice with a positive balance is required."};
  if(!isValidCalendarDateKey(ctx.today)||!isValidCalendarDateKey(input.firstDate)||input.firstDate<ctx.today)
    return{ok:false,error:"Choose today or a future date."};
  if(!["ACH","Card"].includes(input.rail)||!["once","monthly","quarterly"].includes(input.cadence))
    return{ok:false,error:"Unsupported payment method or schedule."};
  const cents=Math.round(input.amount*100);
  if(!Number.isFinite(input.amount)||!Number.isSafeInteger(cents)||cents<=0)
    return{ok:false,error:"Amount must be positive and representable in cents."};
  if(input.cadence==="once"&&cents>Math.round(ctx.unpaidBalance*100))
    return{ok:false,error:"One-time request exceeds remaining invoice balance."};
  return{ok:true,value:{invoiceId:input.invoiceId,accountId:input.accountId,
    currency:"USD",amountCents:cents,cadence:input.cadence,rail:input.rail,
    firstDate:input.firstDate,appliesTo:input.cadence==="once"?"invoice_balance":"future_invoices",
    status:"Draft - never sent"}};
}
/** No provider invocation, bank details, payout claims or charge creation is implemented here. */
export const REQUIRED_PAYMENT_ACTIVATION=[
  "Approved provider account and server-held credentials",
  "Authenticated account ownership and customer payment authorization",
  "Hosted token collection or verified ACH mandate before recurring charges",
  "Trusted signed webhook with idempotency and provider-event binding",
  "Bank settlement, failed debits, reversals, credits and refunds reconciliation",
] as const;
