import type {WorkspaceUser} from "./types";

/** Resolve a scoped search result into a role-appropriate destination.
 * UI routing is only a convenience; canVisitRoute and backend record scoping
 * are enforced by the caller and destination.
 */
export function globalSearchDestination(
  role: WorkspaceUser["role"],type: string,recordId: string,
): string | null {
  if(!recordId||/[\u0000-\u001f\u007f]/.test(recordId)) return null;
  const id=encodeURIComponent(recordId);
  if(role==="Customer") {
    if(type==="Location")return "/portal/account";
    if(type==="Order")return "/portal/orders/"+id;
    if(type==="Invoice")return "/portal/invoices";
    return null;
  }
  if(type==="Location")return "/sales/customers/"+id;
  if(type==="Contact")return "/crm/contacts/"+id;
  if(type==="Order")return "/sales/orders/"+id;
  if(type==="Invoice")return "/sales/invoices/"+id;
  if(type==="Inventory lot")return "/inventory/lots/"+id;
  if(type==="Person")return role==="Administrator"?"/admin/employee-profiles/"+id:null;
  if(type==="Appointment")return "/operations/legacy-dispatch";
  return null;
}
