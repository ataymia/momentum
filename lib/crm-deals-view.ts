import type {Opportunity} from "./crm-engine";

export type DealSort="updated"|"name"|"nextAction"|"cases";
export type DealFilters={
  query?:string; stage?:string; ownerId?:string; status?:string;
  sort?:DealSort; ascending?:boolean;
};

/** Deny foreign-location records before any search, count, sort or export. */
export function visibleDeals(deals:readonly Opportunity[], allowedLocationIds:ReadonlySet<string>, filters:DealFilters={}):Opportunity[]{
  const query=(filters.query??"").trim().toLowerCase();
  const sorted=deals.filter(deal=>allowedLocationIds.has(deal.locationId)
    &&(!filters.stage||filters.stage==="all"||deal.stage===filters.stage)
    &&(!filters.status||filters.status==="all"||deal.status===filters.status)
    &&(!filters.ownerId||filters.ownerId==="all"||deal.ownerId===filters.ownerId)
    &&(!query||[deal.name,deal.stage,deal.nextAction,deal.id].some(value=>value.toLowerCase().includes(query))));
  const sort=filters.sort??"updated";
  const direction=filters.ascending===true?1:-1;
  return sorted.sort((a,b)=>{
    const av=sort==="name"?a.name:sort==="nextAction"?a.nextActionDate:sort==="cases"?(a.estimatedCases??0):a.updatedAt;
    const bv=sort==="name"?b.name:sort==="nextAction"?b.nextActionDate:sort==="cases"?(b.estimatedCases??0):b.updatedAt;
    const compare=typeof av==="number"&&typeof bv==="number"?av-bv:String(av).localeCompare(String(bv),undefined,{numeric:true});
    return direction*(compare||a.id.localeCompare(b.id));
  });
}
