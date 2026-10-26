import type { DeliveryTask } from "./delivery-engine";
import type { Order } from "./types";

/** Read-only discrepancy detection: never changes delivery or inventory evidence. */
export function deliveryReconciliationIssue(
  order: Pick<Order,"status"|"cases">,
  task: Pick<DeliveryTask,"status"|"signature">|undefined,
  postedCases:number,
  administratorOverride=false,
):string|undefined {
  const terminal=["Delivered","Paid"].includes(order.status);
  if(administratorOverride){
    return terminal&&postedCases<order.cases?"Administrator override is missing the recorded delivery inventory movements.":undefined;
  }
  if(terminal&&task?.status!=="Delivered")return "Order is terminal but the delivery task is not completed.";
  if(!terminal&&task?.status==="Delivered")return "Delivery task is completed but the order remains open.";
  if(terminal&&task?.status==="Delivered"){
    if(postedCases<order.cases)return "Signed delivery lacks full posted inventory evidence.";
    if(!task.signature?.strokes?.some(stroke=>stroke.length>=2))return "Completed delivery is missing recipient signature evidence.";
  }
  if(!terminal&&postedCases>0&&task?.status!=="Delivered")return "Inventory was posted as delivered before the task was completed.";
  return undefined;
}
