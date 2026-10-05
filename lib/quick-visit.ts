import type { Account } from "./types";

export const QUICK_VISIT_LOCATION_PREFIX="quick-visit:";

export type QuickVisitSampleRow={product:string;quantity:number};

const normalize=(value:string)=>value.trim().toLowerCase().replace(/\s+/g," ");
const clean=(value:string|undefined)=>value?.trim()??"";

export function quickVisitBusinessLabel(account:Account){
  const name=clean(account.locationName)||clean(account.name)||"Unnamed business";
  const place=clean(account.streetAddress)||clean(account.location);
  return place&&normalize(place)!==normalize(name)?`${name} · ${place}`:name;
}

function accountSearchText(account:Account){
  return [account.locationName,account.name,account.streetAddress,account.location,account.phone,account.email,account.channel]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function quickVisitSuggestions(accounts:Account[],query:string,limit=6){
  const q=normalize(query);
  if(!q)return [];
  const tokens=q.split(" ").filter(Boolean);
  return accounts
    .filter((account)=>tokens.every((token)=>accountSearchText(account).includes(token)))
    .sort((a,b)=>{
      const aName=normalize(a.locationName??a.name);
      const bName=normalize(b.locationName??b.name);
      const aStarts=aName.startsWith(q)?0:1;
      const bStarts=bName.startsWith(q)?0:1;
      return aStarts-bStarts||aName.localeCompare(bName);
    })
    .slice(0,Math.max(1,limit));
}

export function matchQuickVisitAccount(accounts:Account[],input:string){
  const q=normalize(input);
  if(!q)return undefined;
  const labelMatches=accounts.filter((account)=>normalize(quickVisitBusinessLabel(account))===q);
  if(labelMatches.length===1)return labelMatches[0];
  const nameMatches=accounts.filter((account)=>normalize(account.locationName??account.name)===q||normalize(account.name)===q);
  return nameMatches.length===1?nameMatches[0]:undefined;
}

function hashText(value:string){
  let hash=2166136261;
  for(let index=0;index<value.length;index++){
    hash^=value.charCodeAt(index);
    hash=Math.imul(hash,16777619);
  }
  return (hash>>>0).toString(36);
}

export function quickVisitLocationId(businessName:string){
  const normalized=normalize(businessName);
  const slug=normalized.replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,64)||"business";
  return `${QUICK_VISIT_LOCATION_PREFIX}${slug}-${hashText(normalized)}`;
}

export function isQuickVisitLocationId(locationId:string|undefined){
  return Boolean(locationId?.startsWith(QUICK_VISIT_LOCATION_PREFIX));
}

export function normalizeQuickVisitSamples(rows:QuickVisitSampleRow[]){
  const totals=new Map<string,number>();
  for(const row of rows){
    const product=row.product.trim();
    const quantity=Math.floor(Number(row.quantity));
    if(!product||!Number.isFinite(quantity)||quantity<=0)continue;
    totals.set(product,(totals.get(product)??0)+quantity);
  }
  return [...totals.entries()].map(([product,quantity])=>({product,quantity}));
}
