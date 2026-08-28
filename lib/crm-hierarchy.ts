import type { Account, CustomerAccount, WorkspaceData } from "./types";

const slug=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const inferredParentName=(name:string)=>name.replace(/\s+#\d+\s*$/,"").trim()||name;

export function customerForLocation(data:WorkspaceData,location:Account):CustomerAccount{
  const id=location.customerId??`cust-${slug(inferredParentName(location.name))}`;
  return data.customers?.find((customer)=>customer.id===id)??{
    id,
    name:inferredParentName(location.name),
    accountType:inferredParentName(location.name)!==location.name?"Chain / franchise":"Independent",
    billingContactName:location.contactName,
    billingEmail:location.email,
    billingPhone:location.phone,
    createdAt:new Date().toISOString(),
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
