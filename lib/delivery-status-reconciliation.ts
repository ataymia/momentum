import type { DeliveryTask } from "./delivery-engine";
import { orderDeliveryQuantity, planDriverDeliveryPosting, type InventoryLedgerState } from "./inventory-ledger";
import type { Order, OrderStatus, WorkspaceData } from "./types";

/** Never advance an order from a task status alone; require driver custody evidence. */
export function nextVerifiedDeliveryOrderStatus(task:DeliveryTask,order:Order,ledger:InventoryLedgerState,data:WorkspaceData):OrderStatus|undefined{
  if(task.orderId!==order.id||["Cancelled","Paid"].includes(order.status))return;
  if(!["Loaded","In transit","Delivered"].includes(task.status))return;
  if(!planDriverDeliveryPosting(ledger,data,order,task.driverId).ok)return;
  if(order.status==="Approved")return "Allocated";
  if(order.status==="Allocated"&&["In transit","Delivered"].includes(task.status))return "Out for delivery";
  if(order.status==="Out for delivery"&&task.status==="Delivered"&&
     task.signature?.strokes?.length&&orderDeliveryQuantity(ledger,order.id)>=order.cases)return "Delivered";
}
