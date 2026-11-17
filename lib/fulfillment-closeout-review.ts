/**
 * E05 read-only consistency evaluation for driver and Operations views.
 * A task status, signature, administrator override, or ledger movement alone
 * is never sufficient to claim a delivery is fully reconciled.
 * This cannot authorize a delivery write or substitute for cloud confirmation.
 */
import {deliveryReconciliationIssue} from "./delivery-reconciliation";
import type {DeliveryTask} from "./delivery-engine";
import type {Order} from "./types";

export type DeliveryCloseoutEvidence={
  order:Pick<Order,"status"|"cases">;
  task?:DeliveryTask;
  deliveredCases:number;
  outboundCases:number;
  administratorOverride:boolean;
};
export type DeliveryCloseoutReview={
  terminalOrder:boolean;
  recipientProofRecorded:boolean;
  complete:boolean;
  issues:string[];
  issueText?:string;
};

export function reviewDeliveryCloseout(e:DeliveryCloseoutEvidence):DeliveryCloseoutReview{
  const {order,task,deliveredCases,outboundCases,administratorOverride}=e;
  const terminalOrder=["Delivered","Paid"].includes(order.status);
  const signature=task?.signature;
  const recipientProofRecorded=Boolean(signature?.signedAt&&signature.capturedBy&&
    signature.strokes.some(stroke=>stroke.length>=2)&&
    task?.history.some(event=>event.type==="Delivered"&&event.actorId===signature?.capturedBy));
  const issues:string[]=[];
  const add=(issue?:string)=>{if(issue&&!issues.includes(issue))issues.push(issue);};
  if(!Number.isSafeInteger(order.cases)||order.cases<=0)add("Order has invalid cases; cannot reconcile closeout.");
  if(!Number.isFinite(deliveredCases)||deliveredCases<0)add("Delivered stock posting is invalid.");
  if(!Number.isFinite(outboundCases)||outboundCases<0)add("Warehouse outbound stock posting is invalid.");
  if(deliveredCases>order.cases+0.005)add("Delivered inventory exceeds the ordered cases.");
  if(outboundCases>order.cases+0.005)add("Warehouse outbound exceeds ordered cases.");
  if(administratorOverride&&!terminalOrder)add("Administrator override recorded but the order is not terminal.");
  add(deliveryReconciliationIssue(order,task,deliveredCases,administratorOverride));
  if(task?.status==="Delivered"&&!recipientProofRecorded&&!administratorOverride)
    add("Delivered task has no matched recipient signature and completion event.");
  if(task&&["Loaded","In transit","Delivered"].includes(task.status)&&outboundCases+0.005<order.cases)
    add("Loaded or departed without full recorded warehouse outbound.");
  const complete=issues.length===0&&terminalOrder&&deliveredCases>=order.cases&&
    deliveredCases<=order.cases+0.005&&
    (administratorOverride||task?.status==="Delivered"&&recipientProofRecorded);
  return {terminalOrder,recipientProofRecorded,complete,issues,issueText:issues.length?issues.join("; "):undefined};
}
