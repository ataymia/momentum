import type {Invoice} from "./commerce-engine";

/**
 * Inform a viewer of missing invoice information without ever denying browser printing.
 * This helper must only be used for a preprint confirmation, not for invoice artwork.
 */
export type InvoicePrintReview={
 orderNumber?:string;
 billingName?:string;
 billingAddress?:string;
 deliveryAddress?:string;
 lines:ReadonlyArray<{product?:string;cases?:number;pricePerCase?:number;amount?:number}>;
 issuerDetailsApproved:boolean;
};
const present=(value?:string)=>Boolean(value?.trim());
const validDate=(value?:string)=>Boolean(value&&!Number.isNaN(Date.parse(value)));

export function invoicePrintWarnings(
 invoice:Pick<Invoice,"number"|"issuedAt"|"status"|"terms"|"total">,
 context:InvoicePrintReview,
):string[]{
 const issues:string[]=[];
 if(invoice.status==="Draft")issues.push("Invoice is still a draft.");
 if(invoice.status==="Void")issues.push("Invoice is void.");
 if(!context.issuerDetailsApproved)
  issues.push("Issuer name, address and contact details have not been approved for customer-facing issuance.");
 if(!present(invoice.number))issues.push("Invoice number is missing.");
 if(!validDate(invoice.issuedAt))issues.push("Invoice date is missing or invalid.");
 if(!present(context.orderNumber))issues.push("Linked order number is missing.");
 if(!present(context.billingName))issues.push("Customer/bill-to name is missing.");
 if(!present(context.billingAddress))issues.push("Bill-to address is missing.");
 if(!present(context.deliveryAddress))issues.push("Ship-to address is missing.");
 if(!present(invoice.terms))issues.push("Payment terms are missing.");
 if(context.lines.length===0)issues.push("Itemized products and quantities are missing.");
 else if(context.lines.some(line=>!present(line.product)||!Number.isFinite(line.cases)||
  (line.cases??0)<=0||!Number.isFinite(line.pricePerCase)||
  (line.pricePerCase??-1)<0||!Number.isFinite(line.amount)||
  (line.amount??-1)<0))
  issues.push("One or more invoice lines have missing or invalid descriptions, quantities, or prices.");
 if(!Number.isFinite(invoice.total)||invoice.total<0)issues.push("Invoice total is missing or invalid.");
 else if(context.lines.length>0&&context.lines.every(line=>Number.isFinite(line.amount)&&Number.isFinite(line.cases)&&Number.isFinite(line.pricePerCase))&&
  Math.abs(context.lines.reduce((sum,line)=>sum+(line.amount??0),0)-invoice.total)>0.005)
  issues.push("Itemized line amounts do not reconcile to the saved invoice total.");
 return issues;
}

/** Browser-confirm text is never appended to the printable invoice DOM. */
export function invoicePrintConfirmationMessage(
 invoices:ReadonlyArray<{number:string;issues:readonly string[]}>,
):string{
 const warnings=invoices.filter(row=>row.issues.length);
 const detail=warnings.map(row=>"Invoice "+(row.number.trim()||"(unnumbered)")+
  ":\n"+row.issues.map(issue=>"- "+issue).join("\n")).join("\n\n");
 return "Invoice printing warning\n\n"+
  (warnings.length>0?detail+"\n\n":"")+
  "Do you understand these issues and want to print anyway? "+
  "This will print locally only. It will NOT email or issue an invoice to the customer. "+
  "These warnings will NOT appear on the printed invoice.";
}
