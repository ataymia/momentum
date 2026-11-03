import type {Account} from "./types";

/**
 * Read-only duplicate candidates for administrator review.
 * Similar names are a discovery signal, never proof of common ownership,
 * and this module deliberately cannot merge or modify account records.
 */
export type ConsolidationCandidate={
  key:string;
  name:string;
  locations:Account[];
  existingCustomerIds:string[];
  distinctPostalCodes:string[];
  sameAddressPairs:readonly [string,string][];
  conflicts:string[];
};

export function normalizedBusinessName(value:string):string{
  return value.toLocaleLowerCase("en-US").normalize("NFKC")
    .replace(/\s+#\s*\d+\s*$/,"")
    .replace(/[^\p{L}\p{N}]+/gu," ")
    .trim().replace(/\s+/g," ");
}
function addressKey(account:Account):string {
  const street=(account.streetAddress??"").toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
  const zip=(account.postalCode??"").trim();
  return street&&zip?street+"|"+zip:"";
}
export function consolidationCandidates(accounts:readonly Account[]):ConsolidationCandidate[]{
  const byName=new Map<string,Account[]>();
  for(const account of accounts){
    const key=normalizedBusinessName(account.name);
    if(!key)continue;
    byName.set(key,[...(byName.get(key)??[]),account]);
  }
  return [...byName.entries()].filter(([,locs])=>locs.length>1).map(([key,locations])=>{
    const ordered=[...locations].sort((a,b)=>a.name.localeCompare(b.name)||a.location.localeCompare(b.location)||a.id.localeCompare(b.id));
    const parents=[...new Set(ordered.map(a=>a.customerId).filter((s):s is string=>Boolean(s)))];
    const postalCodes=[...new Set(ordered.map(a=>a.postalCode).filter((s):s is string=>Boolean(s)))];
    const sameAddressPairs:[string,string][]=[];
    for(let i=0;i<ordered.length;i++)for(let j=i+1;j<ordered.length;j++){
      const a=addressKey(ordered[i]),b=addressKey(ordered[j]);
      if(a&&a===b)sameAddressPairs.push([ordered[i].id,ordered[j].id]);
    }
    const conflicts:string[]=[];
    if(parents.length>1)conflicts.push("Different existing parent-customer IDs");
    if(new Set(ordered.map(a=>a.ownerId).filter(Boolean)).size>1)conflicts.push("Multiple assigned representatives");
    if(sameAddressPairs.length)conflicts.push("Possible duplicate location address");
    if(ordered.some(a=>!a.streetAddress))conflicts.push("Some street addresses are missing");
    return {key,name:ordered[0].name,locations:ordered,existingCustomerIds:parents,distinctPostalCodes:postalCodes,sameAddressPairs,conflicts};
  }).sort((a,b)=>b.locations.length-a.locations.length||a.name.localeCompare(b.name));
}

/**
 * Build a review proposal from explicit administrator-selected IDs, even when
 * the businesses have entirely different names. Matching suggestions are
 * optional; selected IDs are the sole source of membership.
 *
 * This function NEVER writes parent associations or mutates account records.
 */
export function manualConsolidationCandidate(
  accounts:readonly Account[],
  selectedIds:readonly string[],
):ConsolidationCandidate|null {
  const ids=new Set(selectedIds.filter(id=>typeof id==="string"&&id.length>0));
  if(ids.size<2)return null;
  const matching=accounts.filter(account=>ids.has(account.id));
  if(matching.length!==ids.size)return null; // No silent missing/unauthorized IDs.
  const locations=[...matching].sort((a,b)=>a.name.localeCompare(b.name)||a.location.localeCompare(b.location)||a.id.localeCompare(b.id));
  const parents=[...new Set(locations.map(a=>a.customerId).filter((x):x is string=>Boolean(x)))];
  const postalCodes=[...new Set(locations.map(a=>a.postalCode).filter((x):x is string=>Boolean(x)))];
  const sameAddressPairs:[string,string][]=[];
  for(let i=0;i<locations.length;i++)for(let j=i+1;j<locations.length;j++){
    const first=addressKey(locations[i]),second=addressKey(locations[j]);
    if(first&&first===second)sameAddressPairs.push([locations[i].id,locations[j].id]);
  }
  const conflicts:string[]=[];
  if(new Set(locations.map(a=>normalizedBusinessName(a.name))).size>1)
    conflicts.push("Different business names: verify common legal/billing ownership");
  if(parents.length>1)conflicts.push("Different existing parent-customer IDs");
  if(new Set(locations.map(a=>a.ownerId).filter(Boolean)).size>1)
    conflicts.push("Multiple assigned representatives: preserve historic rep credit");
  if(sameAddressPairs.length)
    conflicts.push("Possible duplicate physical location: review before making separate locations");
  if(locations.some(a=>!a.streetAddress))
    conflicts.push("Some street addresses are missing");
  return {
    key:"manual:"+locations.map(a=>a.id).sort().join("|"),
    name:locations[0].name,
    locations,
    existingCustomerIds:parents,
    distinctPostalCodes:postalCodes,
    sameAddressPairs,
    conflicts,
  };
}
