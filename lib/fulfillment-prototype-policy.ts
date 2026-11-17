import type {DeliveryTask} from "./delivery-engine";
import type {Order,Role} from "./types";

/**
 * UI readiness only. The canonical inventory and delivery engines remain the
 * final authorities over role, order status, inventory and task transitions.
 */
export type FulfillmentPrototypeContext={
  isDemo:boolean;
  persistenceMode:"local"|"firestore";
  hasFirebaseSession:boolean;
  role?:Role;
};

export function canMutatePrototypeFulfillment(context:FulfillmentPrototypeContext):boolean{
  return context.isDemo && context.persistenceMode==="local" &&
    !context.hasFirebaseSession && ["Administrator","Operations"].includes(context.role??"");
}

export type ShipmentNextStep="assign"|"reserve"|"load"|"depart"|"recipient-proof"|"complete"|"review";

export function nextShipmentStep(order:Pick<Order,"status">,task?:Pick<DeliveryTask,"status">):ShipmentNextStep{
  if(!task||task.status==="Cancelled")return ["Approved","Allocated"].includes(order.status)?"assign":"review";
  if(task.status==="Delivered")return "complete";
  if(task.status==="In transit")return "recipient-proof";
  if(task.status==="Loaded")return "depart";
  if(task.status==="Accepted"){
    if(order.status==="Approved")return "reserve";
    if(order.status==="Allocated")return "load";
  }
  return "review";
}

export const shipmentStepDescription:Record<ShipmentNextStep,string>={
  assign:"Assign an eligible delivery driver",
  reserve:"Reserve the complete SKU mix before loading",
  load:"Verify and transfer all reserved cases into driver custody",
  depart:"Confirm cases are on the assigned vehicle before departure",
  "recipient-proof":"Recipient signature and delivery posting required",
  complete:"Delivery task marked completed; verify proof and custody",
  review:"Manual operations review required before advancing",
};
