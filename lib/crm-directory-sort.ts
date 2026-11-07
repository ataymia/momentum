import type {Account} from "./types";

/** Shared deterministic CRM ordering: missing values always sort last, regardless
 * of direction; real dates, numeric values and business stages are compared by
 * their own semantics, with record IDs breaking ties.
 */
export type DirectorySortValue=string|number|boolean|null|undefined;
export type DirectorySortType="natural"|"text"|"date"|"number"|"boolean"|"postal"|"stage";
export type AccountDirectorySort="name"|"location"|"contactName"|"stage"|"postalCode"|"ownerId"|"nextActionDate";
const stages:ReadonlyArray<Account["stage"]>=["Prospect","Qualified","Sampled","Opening order","Placed","Reordered","At risk"];
const collator=new Intl.Collator("en-US",{numeric:true,sensitivity:"base",ignorePunctuation:false});
const textCollator=new Intl.Collator("en-US",{numeric:false,sensitivity:"base"});

const empty=(value:DirectorySortValue)=>value===null||value===undefined||typeof value==="string"&&value.trim().length===0;
function compareValue(left:DirectorySortValue,right:DirectorySortValue,type:DirectorySortType):number{
  if(type==="number"){
    const a=Number(left),b=Number(right);
    return Number.isFinite(a)&&Number.isFinite(b)?a-b:collator.compare(String(left),String(right));
  }
  if(type==="boolean")return Number(Boolean(left))-Number(Boolean(right));
  if(type==="stage"){
    const a=stages.indexOf(String(left) as Account["stage"]),b=stages.indexOf(String(right) as Account["stage"]);
    if(a!==-1&&b!==-1)return a-b;
  }
  // ISO date keys sort chronologically; unknown dates still remain last.
  if(type==="date")return String(left).localeCompare(String(right));
  if(type==="postal")return textCollator.compare(String(left).trim(),String(right).trim());
  return collator.compare(String(left).trim(),String(right).trim());
}

export function compareDirectoryValues(
  a:DirectorySortValue,b:DirectorySortValue,
  type:DirectorySortType,ascending:boolean,idA:string,idB:string,
):number{
  const aMissing=empty(a),bMissing=empty(b);
  if(aMissing!==bMissing)return aMissing?1:-1;
  const direction=ascending?1:-1;
  if(aMissing)return direction*idA.localeCompare(idB);
  const cmp=compareValue(a,b,type);
  return direction*(cmp||idA.localeCompare(idB));
}

export function sortAccountsDirectory(
  records:readonly Account[],field:AccountDirectorySort,
  ascending:boolean,repNames:ReadonlyMap<string,string>,
):Account[]{
  const type:DirectorySortType=field==="nextActionDate"?"date":field==="postalCode"?"postal":field==="stage"?"stage":"natural";
  const value=(account:Account):DirectorySortValue=>{
    if(field==="ownerId")return repNames.get(account.ownerId)??null;
    return account[field]??null;
  };
  return [...records].sort((a,b)=>compareDirectoryValues(value(a),value(b),type,ascending,a.id,b.id));
}
