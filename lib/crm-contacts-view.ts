import type {CrmContact} from "./crm-engine";

export type ContactSort="name"|"role"|"business"|"created";
export type ContactFilters={query?:string;active?:string;decisionRole?:string;sort?:ContactSort;ascending?:boolean};
export function visibleCrmContacts(contacts:readonly CrmContact[],allowedLocations:ReadonlySet<string>,allowedCustomers:ReadonlySet<string>,businessNames:ReadonlyMap<string,string>,filters:ContactFilters={}):CrmContact[]{
  const q=(filters.query??"").toLowerCase().trim();
  const sort=filters.sort??"name",sign=filters.ascending===false?-1:1;
  return contacts.filter(c=>(c.scope==="Location"?Boolean(c.locationId&&allowedLocations.has(c.locationId)):allowedCustomers.has(c.customerId))
    &&(filters.active==="all"||!filters.active||String(c.active)===filters.active)
    &&(filters.decisionRole==="all"||!filters.decisionRole||c.decisionRole===filters.decisionRole)
    &&(!q||[c.name,c.role,c.email,c.phone,c.decisionRole,businessNames.get(c.locationId??"")].some(v=>(v??"").toLowerCase().includes(q))))
    .sort((a,b)=>{
      const value=(c:CrmContact)=>sort==="name"?c.name:sort==="role"?c.role:sort==="created"?c.createdAt:businessNames.get(c.locationId??"")??"";
      return sign*(value(a).localeCompare(value(b),undefined,{numeric:true})||a.id.localeCompare(b.id));
    });
}
