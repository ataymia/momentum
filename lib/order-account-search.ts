import type { Account } from "./types";

/** Only rank the accounts already visible in the current user's CRM scope. */
export function orderAccountLabel(account: Pick<Account,"name"|"locationName"|"location">): string {
  const name=account.name.trim();
  const place=(account.locationName||account.location||"").trim();
  return place&&place.toLowerCase()!==name.toLowerCase()?name+" · "+place:name;
}

const normalize=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();

export function orderAccountSuggestions(accounts: readonly Account[],query:string,limit=8): Account[] {
  const term=normalize(query);
  const tokens=term.split(" ").filter(Boolean);
  return accounts.map((account,index)=>{
    const label=normalize(orderAccountLabel(account));
    const name=normalize(account.name);
    const place=normalize(account.locationName||account.location||"");
    const address=normalize([account.streetAddress,account.city,account.postalCode].filter(Boolean).join(" "));
    const searchable=[name,place,address].join(" ");
    if(tokens.some((token)=>!searchable.includes(token)))return null;
    const rank=!term?5:name===term||label===term?0:name.startsWith(term)?1:place.startsWith(term)?2:name.includes(term)?3:4;
    return {account,index,rank};
  }).filter((entry):entry is {account:Account;index:number;rank:number}=>entry!==null)
    .sort((a,b)=>a.rank-b.rank||a.account.name.localeCompare(b.account.name)||a.index-b.index)
    .slice(0,Math.max(0,limit)).map(({account})=>account);
}
