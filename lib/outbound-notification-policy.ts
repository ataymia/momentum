import { notificationPolicyById } from "./notification-policy-registry";
import type { WorkspaceData, WorkspaceUser } from "./types";

export type OutboundEmailDecision={send:boolean;reason:string};

export function outboundEmailDecision(user:WorkspaceUser,policyId:string):OutboundEmailDecision{
  if(user.employmentStatus==="Separated")return{send:false,reason:"Employee access has been revoked."};
  const policy=notificationPolicyById(policyId);
  if(!policy)return{send:false,reason:"No approved notification policy exists for this event."};
  if(!policy.channels.email)return{send:false,reason:"This event is in-app only by current policy."};
  if(!policy.emailRoles?.includes(user.role))return{send:false,reason:"This role is not an approved email recipient for this event."};
  return{send:true,reason:"Approved by the canonical notification policy."};
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
