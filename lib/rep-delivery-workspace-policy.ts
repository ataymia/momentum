import type {Order} from "./types";

/** UI projection of the independent server-authorized self-delivery workflow. */
export type RepDeliveryStatus="Unclaimed"|"Accepted"|"Loaded"|"In transit"|"Delivered";
export type RepDeliveryAction="claim"|"pack"|"load"|"depart"|"complete";
export type RepDeliveryReceipt={
  ok?:boolean;message?:string;orderId?:string;orderStatus?:string;
  taskStatus?:RepDeliveryStatus;cloudConfirmed?:boolean;replayed?:boolean;
};
export const repDeliverySteps=["claim","pack","load","depart","complete"] as const;
export const repDeliveryStepLabel:Record<RepDeliveryAction,string>={
  claim:"Claim self-delivery",pack:"Pack and reserve",load:"Confirm custody",
  depart:"Begin delivery",complete:"Capture customer receipt",
};
export function repDeliveryNextStep(record:RepDeliveryReceipt|null,orderId:string):RepDeliveryAction|null{
  if(!record||record.ok!==true||record.cloudConfirmed!==true||record.orderId!==orderId)return null;
  switch(record.taskStatus){
    case "Unclaimed":return record.orderStatus==="Approved"?"claim":null;
    case "Accepted":return record.orderStatus==="Approved"?"pack":record.orderStatus==="Allocated"?"load":null;
    case "Loaded":return record.orderStatus==="Allocated"?"depart":null;
    case "In transit":return record.orderStatus==="Out for delivery"?"complete":null;
    default:return null;
  }
}
export function repDeliveryCandidate(order:Order,repId:string):boolean{
  return Boolean(repId&&!order.testOnly&&order.ownerId===repId&&
    ["Approved","Allocated","Out for delivery","Delivered","Paid"].includes(order.status));
}
export function repDeliveryProofRecorded(record:RepDeliveryReceipt|null,orderId:string):boolean{
  return Boolean(record&&record.ok===true&&record.cloudConfirmed===true&&
    record.orderId===orderId&&record.taskStatus==="Delivered"&&
    ["Delivered","Paid"].includes(record.orderStatus??""));
}

/** Prototype actions are disabled by default, even for signed-in production users.
 * An isolated Firebase staging project must be explicitly selected before QA.
 * This is a UI guard, not a substitute for the server's existing authorization.
 */
export function canExecuteRepDeliveryReviewMutation(input:{
  enabled:boolean;
  currentProjectId?:string;
  approvedStagingProjectId?:string;
  persistenceMode:"local"|"firestore";
}):boolean{
  return input.enabled===true&&input.persistenceMode==="firestore"&&
    Boolean(input.approvedStagingProjectId?.trim())&&
    input.currentProjectId===input.approvedStagingProjectId;
}
