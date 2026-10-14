import type { WorkspaceData, WorkspaceUser } from "./types";

export type OutboundEmailDecision={send:boolean;reason:string};

export function outboundEmailDecision(user:WorkspaceUser,sourceEventId:string):OutboundEmailDecision{
  if(user.employmentStatus==="Separated")return{send:false,reason:"Employee access has been revoked."};
  if(["Administrator","Operations","Warehouse","Delivery Driver","Brand Ambassador"].includes(user.role))return{send:false,reason:"This role uses in-app notifications only by current policy."};

  if(user.role==="Customer"){
    const allowed=["order-confirmed:","order-out-for-delivery:","order-delivered-customer:","payment-received:","program-pricing-expiry:"];
    return allowed.some(prefix=>sourceEventId.startsWith(prefix))
      ?{send:true,reason:"Approved customer transaction/status email."}
      :{send:false,reason:"Customer event is in-app only unless specifically approved."};
  }

  if(user.role==="Sales Representative"){
    const allowed=["action:approval-returned:","action:timecard-returned:","action:expense-returned:","expense-approved:","weekly-sunday-reminder:","program-pricing-expiry:"];
    return allowed.some(prefix=>sourceEventId.startsWith(prefix))
      ?{send:true,reason:"Approved Sales Representative action/reminder email."}
      :{send:false,reason:"Sales Representative event is in-app only by current policy."};
  }

  if(user.role==="Sales Manager"){
    const allowed=["action:rep-weekly-overdue:","weekly-sunday-reminder:","program-pricing-expiry:"];
    return allowed.some(prefix=>sourceEventId.startsWith(prefix))
      ?{send:true,reason:"Approved Sales Manager exception/reminder email."}
      :{send:false,reason:"Sales Manager event is in-app only by current policy."};
  }

  return{send:false,reason:"No external email policy exists for this event."};
}

function customerForOrder(data:WorkspaceData,orderId:string){
  const order=data.orders.find(item=>item.id===orderId);
  const account=order?data.accounts.find(item=>item.id===order.accountId):undefined;
  const customer=account?.customerId?(data.customers??[]).find(item=>item.id===account.customerId):undefined;
  return{order,account,customer};
}

/** General customer status messages prefer A/P, then billing, then the location's primary account e-mail. */
export function customerStatusEmail(data:WorkspaceData,orderId:string){
  const{account,customer}=customerForOrder(data,orderId);
  return customer?.accountsPayableEmail?.trim()||customer?.billingEmail?.trim()||account?.email?.trim()||undefined;
}

/** Invoices are intentionally stricter: the invoice goes to the billing e-mail and does not silently fall back. */
export function customerInvoiceEmail(data:WorkspaceData,orderId:string){
  const{customer}=customerForOrder(data,orderId);
  return customer?.billingEmail?.trim()||undefined;
}
