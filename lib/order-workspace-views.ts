import { arizonaDateKey } from "./date-time";
import { computedInvoiceStatus, invoiceBalance, type CommerceState } from "./commerce-engine";
import type { Order, WorkspaceData } from "./types";

export type OrderWorkspaceView="Active / Pending"|"Paid & Delivered"|"Hidden / Canceled"|"All Orders";
export type OrderWorkspaceFilters={
  view:OrderWorkspaceView;search?:string;accountId?:string;placedById?:string;managerId?:string;
  placedFrom?:string;placedThrough?:string;dateSort?:"newest"|"oldest";
};
export function placedOrderDate(order:Order):string{
  return /^\d{4}-\d{2}-\d{2}$/.test(order.placedAt)?order.placedAt:arizonaDateKey(order.placedAt);
}
export function orderIsDelivered(order:Order,deliveredTask:boolean):boolean{
  return order.status==="Delivered"||order.status==="Paid"||deliveredTask;
}
export function orderIsFullyPaid(order:Order,commerce:CommerceState):boolean{
  const invoice=commerce.invoices.find((row)=>row.orderId===order.id);
  return Boolean(invoice&&computedInvoiceStatus(commerce,invoice)==="Paid"&&invoiceBalance(commerce,invoice)<=0);
}
export function orderWorkspaceView(order:Order,commerce:CommerceState,deliveredTask:boolean):Exclude<OrderWorkspaceView,"All Orders">{
  if(order.status==="Cancelled")return "Hidden / Canceled";
  if(orderIsDelivered(order,deliveredTask)&&orderIsFullyPaid(order,commerce))return "Paid & Delivered";
  return "Active / Pending";
}
export function filterOrderWorkspace(data:WorkspaceData,orders:readonly Order[],commerce:CommerceState,deliveredTasks:ReadonlySet<string>,options:OrderWorkspaceFilters):Order[]{
  const q=options.search?.trim().toLowerCase()??"";
  const accounts=new Map(data.accounts.map((account)=>[account.id,account]));
  const users=new Map(data.users.map((user)=>[user.id,user]));
  return orders.filter((order)=>{
    const account=accounts.get(order.accountId);
    if(options.view!=="All Orders"&&orderWorkspaceView(order,commerce,deliveredTasks.has(order.id))!==options.view)return false;
    if(options.accountId&&order.accountId!==options.accountId&&account?.customerId!==options.accountId)return false;
    if(options.placedById&&order.ownerId!==options.placedById)return false;
    if(options.managerId){
      const user=users.get(order.ownerId);
      const manager=users.get(user?.managerId??"");
      const responsible=users.get(account?.accountManagerId??"");
      if(!(manager?.role==="Sales Manager"&&manager.id===options.managerId)&&
         !(responsible?.role==="Sales Manager"&&responsible.id===options.managerId))return false;
    }
    const placed=placedOrderDate(order);
    if(options.placedFrom&&placed<options.placedFrom)return false;
    if(options.placedThrough&&placed>options.placedThrough)return false;
    if(q&&![order.number,account?.name,account?.locationName,account?.location,users.get(order.ownerId)?.name,order.status,order.paymentStatus].join(" ").toLowerCase().includes(q))return false;
    return true;
  }).sort((a,b)=>(options.dateSort==="oldest"?1:-1)*(a.placedAt.localeCompare(b.placedAt)||a.id.localeCompare(b.id)));
}
