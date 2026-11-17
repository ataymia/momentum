import type {DeliveryTask} from "./delivery-engine";
import {orderDeliveryQuantity,type InventoryLedgerState} from "./inventory-ledger";
import type {Order} from "./types";

/** Detect a discrepancy without declaring that delivery or payment failed. */
export function hasRecordedDeliveryPostingGap(
  task:Pick<DeliveryTask,"status"|"orderId">,
  order:Pick<Order,"id"|"cases">,
  ledger:InventoryLedgerState,
):boolean{
  return task.status==="Delivered"&&task.orderId===order.id&&
    Number.isInteger(order.cases)&&order.cases>0&&orderDeliveryQuantity(ledger,order.id)<order.cases;
}

/** Recorded evidence only, not cloud-confirmed signature or a settled payment. */
export function hasRecordedRecipientAndInventoryEvidence(
  task:DeliveryTask,order:Pick<Order,"id"|"cases">,ledger:InventoryLedgerState,
):boolean{
  if(task.status!=="Delivered"||task.orderId!==order.id||!task.signature?.strokes?.length||
    !task.signature.signedAt||!task.signature.capturedBy)return false;
  const signedAt=new Date(task.signature.signedAt).getTime();
  if(!Number.isFinite(signedAt))return false;
  const matching=task.history.some(event=>event.type==="Delivered"&&
    event.actorId===task.signature?.capturedBy&&
    Number.isFinite(new Date(event.at).getTime())&&
    Math.abs(new Date(event.at).getTime()-signedAt)<=60_000);
  return matching&&!hasRecordedDeliveryPostingGap(task,order,ledger)&&
    Number.isInteger(order.cases)&&order.cases>0;
}
