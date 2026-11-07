import type {CrmContact} from "./crm-engine";

export type ContactSort="name"|"role"|"business"|"decisionRole"|"email"|"phone"|"active"|"created";
export type ContactFilters={query?:string;active?:string;decisionRole?:string;sort?:ContactSort;ascending?:boolean};
export function visibleCrmContacts(contacts:readonly CrmContact[],allowedLocations:ReadonlySet<string>,allowedCustomers:ReadonlySet<string>,businessNames:ReadonlyMap<string,string>,filters:ContactFilters={}):CrmContact[]{
  const q=(filters.query??"").toLowerCase().trim();
  const sort=filters.sort??"name",sign=filters.ascending===false?-1:1;
  return contacts.filter(c=>(c.scope==="Location"?Boolean(c.locationId&&allowedLocations.has(c.locationId)):allowedCustomers.has(c.customerId))
    &&(filters.active==="all"||!filters.active||String(c.active)===filters.active)
    &&(filters.decisionRole==="all"||!filters.decisionRole||c.decisionRole===filters.decisionRole)
    &&(!q||[c.name,c.role,c.email,c.phone,c.decisionRole,businessNames.get(c.locationId??"")].some(v=>(v??"").toLowerCase().includes(q))))
    .sort((a,b)=>{
      const value=(c:CrmContact)=>{
        if(sort==="role")return c.role;
        if(sort==="created")return c.createdAt;
        if(sort==="decisionRole")return c.decisionRole;
        if(sort==="email")return c.email??"";
        if(sort==="phone")return c.phone??"";
        if(sort==="active")return c.active?"Active":"Inactive";
        if(sort==="business")return businessNames.get(c.locationId??"")??"";
        return c.name;
      };
      return sign*(value(a).localeCompare(value(b),undefined,{numeric:true})||a.id.localeCompare(b.id));
    });
}
