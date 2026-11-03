import type { Account, CustomerAccount, WorkspaceData } from "./types";

const inferredParentName=(name:string)=>name.replace(/\s+#\d+\s*$/,"").trim()||name;

export function customerForLocation(data:WorkspaceData,location:Account):CustomerAccount{
  const existing=location.customerId?data.customers?.find(customer=>customer.id===location.customerId):undefined;
  if(existing)return existing;
  // No unverified name-based link and no invented creation timestamp.
  // A synthetic, view-only identity is deliberately unique to each location.
  return {
    id:"unlinked-location:"+location.id,
    name:inferredParentName(location.name),
    accountType:"Other",
    billingContactName:location.contactName,
    billingEmail:location.email,
    billingPhone:location.phone,
    createdAt:location.createdAt??"",
  };
}

export function locationLabel(location:Account){
  if(location.locationName)return location.locationName;
  const parent=inferredParentName(location.name);
  if(parent!==location.name)return location.name.replace(parent,"").trim()||location.name;
  return location.name;
}

export function customerLocations(data:WorkspaceData,customerId:string,locations=data.accounts){
  return locations.filter((location)=>customerForLocation(data,location).id===customerId);
}

export function customersForLocations(data:WorkspaceData,locations:Account[]){
  const map=new Map<string,CustomerAccount>();
  for(const location of locations){const customer=customerForLocation(data,location);map.set(customer.id,customer);}
  return[...map.values()].sort((a,b)=>a.name.localeCompare(b.name));
}
