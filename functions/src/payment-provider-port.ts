/** Provider-neutral server payment boundary.
 * An adapter is installed only after an approved merchant account, credentials,
 * hosted tokenization/mandate and webhook validation are ready.
 * This module is NOT a gateway or an instruction to collect card/bank credentials.
 */
export type PaymentRail="Card"|"ACH";
export type PaymentCadence="once"|"monthly"|"quarterly";
export type PaymentProviderName="helcim"|"stripe"|"other";
export type CheckoutIntent={
 requestId:string;customerUid:string;accountId:string;invoiceId:string;
 amountCents:number;currency:"USD";rail:PaymentRail;cadence:PaymentCadence;
 earliestChargeDate:string;customerConsentRecordId?:string;
};
export type HostedCheckout={
 provider:PaymentProviderName;providerSessionId:string;
 checkoutUrl:string;expiresAt:string;status:"Awaiting customer authorization";
};
export type VerifiedProcessorEvent={
 provider:PaymentProviderName;providerEventId:string;providerSessionId:string;
 providerTransactionId:string;eventType:"authorized"|"captured"|"settled"|
  "declined"|"returned"|"refunded"|"disputed";
 verifiedSignature:true;receivedAt:string;
};
export type ProcessorSettlement={
 providerTransactionId:string;status:"pending"|"settled"|"failed"|"returned"|"reversed";
 amountCents:number;currency:"USD";accountReference:string;invoiceReference:string;
};
export type ProviderMandate={
 provider:string;providerMandateId:string;customerConsentRecordId:string;
 method:"Card"|"ACH";schedule:"monthly"|"quarterly";
};
export interface PaymentProviderPort{
 readonly name:PaymentProviderName;
 readonly rails:ReadonlyArray<PaymentRail>;
 readonly cadences:ReadonlyArray<PaymentCadence>;
 /**
  * Must use a provider-hosted payment form. Returns an authorization URL only.
  * Never treat a redirect as payment evidence.
  */
 createHostedCheckout(intent:CheckoutIntent):Promise<HostedCheckout>;
 /** Verify provider-signed webhook using server-held verifier secret. */
 verifyWebhook(body:Buffer,headers:Readonly<Record<string,string|undefined>>):Promise<VerifiedProcessorEvent>;
 /** Authoritative server-to-provider settlement lookup before posting cash. */
 retrieveSettlement(providerTransactionId:string):Promise<ProcessorSettlement>;
 /** Recurring agreements require separate consent and provider-held method token. */
 createRecurringMandate(intent:CheckoutIntent,providerMethodToken:string):Promise<ProviderMandate>;
}
export class ProviderNotReadyError extends Error{
 constructor(message="Payment service is not configured."){super(message);}
}
const ident=/^[A-Za-z0-9_-]{1,128}$/;
const retry=/^[A-Za-z0-9_-]{16,80}$/;
const date=/^\d{4}-\d{2}-\d{2}$/;

/** Keep all payment credentials, PAN, CVV, bank routing and webhook secrets off the client. */
export function validateCheckoutIntent(value:unknown):CheckoutIntent{
 if(!value||typeof value!=="object"||Array.isArray(value))
  throw new Error("Invalid payment request.");
 const v=value as Record<string,unknown>;
 const allowed=["requestId","customerUid","accountId","invoiceId","amountCents",
  "currency","rail","cadence","earliestChargeDate","customerConsentRecordId"];
 if(Object.keys(v).some(key=>!allowed.includes(key)))
  throw new Error("Payment requests cannot include card, bank or authorization data.");
 if(typeof v.requestId!=="string"||!retry.test(v.requestId)||
   ["customerUid","accountId","invoiceId"].some(k=>typeof v[k]!=="string"||!ident.test(v[k] as string))||
   typeof v.amountCents!=="number"||!Number.isSafeInteger(v.amountCents)||
   v.amountCents<1||v.amountCents>100000000||
   v.currency!=="USD"||!["Card","ACH"].includes(String(v.rail))||
   !["once","monthly","quarterly"].includes(String(v.cadence))||
   typeof v.earliestChargeDate!=="string"||!date.test(v.earliestChargeDate)||
   Number.isNaN(Date.parse(v.earliestChargeDate))||
   (v.customerConsentRecordId!==undefined&&
    (typeof v.customerConsentRecordId!=="string"||!ident.test(v.customerConsentRecordId)))||
   (v.cadence!=="once"&&!v.customerConsentRecordId))
  throw new Error("Payment request is missing verified amount, schedule or consent.");
 return v as CheckoutIntent;
}
export function assertProviderCapabilities(port:PaymentProviderPort|undefined,intent:CheckoutIntent):PaymentProviderPort{
 if(!port)throw new ProviderNotReadyError();
 if(!port.rails.includes(intent.rail)||!port.cadences.includes(intent.cadence))
  throw new ProviderNotReadyError("Chosen payment method or schedule is not enabled by this provider.");
 return port;
}
/** Validate payment URL rather than allowing a provider integration to redirect elsewhere. */
export function checkHostedCheckout(checkout:HostedCheckout,provider:PaymentProviderName):HostedCheckout{
 if(checkout.provider!==provider||!checkout.providerSessionId.trim()||
  checkout.status!=="Awaiting customer authorization")throw new Error("Invalid checkout session.");
 const target=new URL(checkout.checkoutUrl);
 if(target.protocol!=="https:"||!target.hostname||
  target.username||target.password||target.hostname==="localhost"||
  target.hostname.endsWith(".localhost"))throw new Error("Unsafe payment checkout URL.");
 if(!Number.isFinite(Date.parse(checkout.expiresAt)))throw new Error("Checkout expiration missing.");
 return checkout;
}
/** Posting is a separate finance action. Signed webhook alone is not cleared cash. */
export function settlementMatchesInvoice(
 event:VerifiedProcessorEvent,settlement:ProcessorSettlement,
 expected:{invoiceId:string;accountId:string;amountCents:number;currency:"USD"},
):boolean{
 return event.verifiedSignature===true&&event.eventType==="settled"&&
  event.providerTransactionId===settlement.providerTransactionId&&
  settlement.status==="settled"&&
  settlement.invoiceReference===expected.invoiceId&&
  settlement.accountReference===expected.accountId&&
  settlement.amountCents===expected.amountCents&&
  settlement.currency===expected.currency;
}
