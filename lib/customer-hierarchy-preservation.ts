import type {WorkspaceData} from "./types";

/**
 * Preserve verified customer/location relationships. A matching display name is
 * not evidence that two store records share a billing owner or legal entity.
 *
 * This is intentionally a read-time normalization, not a data migration:
 * never assign a new parent, invent a creation date, reset sales attribution,
 * or set "responsibility started" to the time the browser refreshed.
 */
export function preserveExplicitCustomerHierarchy(data:WorkspaceData):WorkspaceData {
  const known=new Set((data.customers??[]).map(customer=>customer.id));
  const locationParent=new Map(data.accounts
    .filter(account=>Boolean(account.customerId&&known.has(account.customerId)))
    .map(account=>[account.id,account.customerId!]));
  let changed=false;
  const appointments=data.appointments.map(item=>{
    if(item.customerId || !locationParent.has(item.accountId))return item;
    changed=true;
    return {...item,customerId:locationParent.get(item.accountId)};
  });
  return changed ? {...data,appointments} : data;
}
