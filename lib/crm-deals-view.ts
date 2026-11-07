import type {Opportunity} from "./crm-engine";

export type DealSort="updated"|"name"|"location"|"stage"|"status"|"owner"|"nextAction"|"cases";
export type DealFilters={
  query?:string; stage?:string; ownerId?:string; status?:string;
  sort?:DealSort; ascending?:boolean;
  accountNames?:ReadonlyMap<string,string>; representativeNames?:ReadonlyMap<string,string>;
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
    const field=(d:Opportunity):string|number=>{
      if(sort==="name")return d.name;
      if(sort==="location")return filters.accountNames?.get(d.locationId)??d.locationId;
      if(sort==="stage")return d.stage;
      if(sort==="status")return d.status;
      if(sort==="owner")return filters.representativeNames?.get(d.ownerId)??d.ownerId;
      if(sort==="nextAction")return d.nextActionDate;
      if(sort==="cases")return d.estimatedCases??0;
      return d.updatedAt;
    };
    const av=field(a),bv=field(b);
    const compare=typeof av==="number"&&typeof bv==="number"?av-bv:String(av).localeCompare(String(bv),undefined,{numeric:true});
    return direction*(compare||a.id.localeCompare(b.id));
  });
}
