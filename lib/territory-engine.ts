import type { Account, SalesTerritory, TerritoryStatus, WorkspaceData, WorkspaceUser } from "./types";

export type TerritoryDraft = {
  id?:string;
  name:string;
  ownerId?:string;
  postalCodes:string[];
  status:TerritoryStatus;
  notes?:string;
};

export type TerritoryValidation = {ok:boolean;message?:string;postalCodes:string[]};
export type AccountTerritoryState = "Owned"|"Unresolved"|"Outside coverage"|"Owner mismatch";

const ZIP=/^\d{5}$/;
const validInstant=(value:string)=>!Number.isNaN(new Date(value).getTime());

export function normalizePostalCode(value:string|undefined|null){
  const raw=(value??"").trim();
  const match=raw.match(/^(\d{5})(?:-\d{4})?$/);
  return match?.[1]??"";
}

export function normalizePostalCodes(values:string[]){
  const unique=new Set<string>();
  for(const value of values){const zip=normalizePostalCode(value);if(zip)unique.add(zip);}
  return [...unique].sort();
}

export function activeTerritories(data:Pick<WorkspaceData,"territories">){
  return (data.territories??[]).filter((territory)=>territory.status==="Active");
}

export function territoryForPostalCode(data:Pick<WorkspaceData,"territories">,postalCode:string|undefined){
  const zip=normalizePostalCode(postalCode);
  if(!zip)return undefined;
  return activeTerritories(data).find((territory)=>territory.postalCodes.includes(zip));
}

export function territoryForAccount(data:Pick<WorkspaceData,"territories">,account:Pick<Account,"postalCode">){
  return territoryForPostalCode(data,account.postalCode);
}

export function territoryOverlap(data:Pick<WorkspaceData,"territories">,postalCodes:string[],ignoreId?:string){
  const wanted=new Set(normalizePostalCodes(postalCodes));
  for(const territory of activeTerritories(data)){
    if(territory.id===ignoreId)continue;
    const conflict=territory.postalCodes.find((zip)=>wanted.has(zip));
    if(conflict)return{territory,postalCode:conflict};
  }
  return undefined;
}

export function validateTerritoryDraft(data:Pick<WorkspaceData,"territories"|"users">,draft:TerritoryDraft):TerritoryValidation{
  const name=draft.name.trim();
  if(!name)return{ok:false,message:"Territory name is required.",postalCodes:[]};
  const raw=draft.postalCodes.map((value)=>value.trim()).filter(Boolean);
  const invalid=raw.find((value)=>!ZIP.test(value)&&!/^\d{5}-\d{4}$/.test(value));
  if(invalid)return{ok:false,message:`Invalid ZIP code: ${invalid}.`,postalCodes:[]};
  const postalCodes=normalizePostalCodes(raw);
  if(draft.status==="Active"){
    if(!draft.ownerId)return{ok:false,message:"An active territory needs a sales representative.",postalCodes};
    const owner=data.users.find((user)=>user.id===draft.ownerId);
    if(!owner||owner.role!=="Sales Representative")return{ok:false,message:"Active territories can only be assigned to a Sales Representative.",postalCodes};
    if(postalCodes.length===0)return{ok:false,message:"An active territory needs at least one ZIP code.",postalCodes};
    const overlap=territoryOverlap(data,postalCodes,draft.id);
    if(overlap)return{ok:false,message:`ZIP ${overlap.postalCode} is already active in ${overlap.territory.name}.`,postalCodes};
  }else if(draft.ownerId){
    const owner=data.users.find((user)=>user.id===draft.ownerId);
    if(!owner||owner.role!=="Sales Representative")return{ok:false,message:"Territory owner must be a Sales Representative.",postalCodes};
  }
  return{ok:true,postalCodes};
}

export function normalizeTerritories(input:unknown,users:WorkspaceUser[]):SalesTerritory[]{
  if(!Array.isArray(input))return[];
  const repIds=new Set(users.filter((user)=>user.role==="Sales Representative").map((user)=>user.id));
  const actorIds=new Set(users.filter((user)=>user.role!=="Customer").map((user)=>user.id));
  const seenIds=new Set<string>();
  const claimedActiveZips=new Set<string>();
  const result:SalesTerritory[]=[];
  for(const raw of input){
    if(!raw||typeof raw!=="object")continue;
    const value=raw as Partial<SalesTerritory>;
    const id=typeof value.id==="string"?value.id.trim():"";
    const name=typeof value.name==="string"?value.name.trim():"";
    const status=value.status;
    const ownerId=typeof value.ownerId==="string"?value.ownerId.trim():undefined;
    const createdBy=typeof value.createdBy==="string"?value.createdBy.trim():"";
    const updatedBy=typeof value.updatedBy==="string"?value.updatedBy.trim():"";
    const createdAt=typeof value.createdAt==="string"?value.createdAt:"";
    const updatedAt=typeof value.updatedAt==="string"?value.updatedAt:"";
    if(!id||seenIds.has(id)||!name||!["Draft","Active","Suspended"].includes(status??"")||!createdBy||!updatedBy||!actorIds.has(createdBy)||!actorIds.has(updatedBy)||!validInstant(createdAt)||!validInstant(updatedAt))continue;
    const postalCodes=normalizePostalCodes(Array.isArray(value.postalCodes)?value.postalCodes.filter((item):item is string=>typeof item==="string"):[]);
    if(ownerId&&!repIds.has(ownerId))continue;
    if(status==="Active"&&(!ownerId||postalCodes.length===0||postalCodes.some((zip)=>claimedActiveZips.has(zip))))continue;
    if(status==="Active")postalCodes.forEach((zip)=>claimedActiveZips.add(zip));
    seenIds.add(id);
    result.push({id,name,ownerId,postalCodes,status:status as TerritoryStatus,notes:typeof value.notes==="string"&&value.notes.trim()?value.notes.trim():undefined,createdAt,createdBy,updatedAt,updatedBy});
  }
  return result;
}

export function territorySystemEnabled(data:Pick<WorkspaceData,"territories">){return activeTerritories(data).length>0;}

export function canSalesRepWorkAccount(data:Pick<WorkspaceData,"territories">,user:WorkspaceUser,account:Pick<Account,"postalCode">){
  if(user.role!=="Sales Representative")return true;
  if(!territorySystemEnabled(data))return true;
  const territory=territoryForAccount(data,account);
  return Boolean(territory?.ownerId===user.id);
}

export function canAssignRepToAccountTerritory(data:Pick<WorkspaceData,"territories">,account:Pick<Account,"postalCode">,repId:string){
  if(!territorySystemEnabled(data))return true;
  const territory=territoryForAccount(data,account);
  return Boolean(territory?.ownerId===repId);
}

export function accountTerritoryState(data:Pick<WorkspaceData,"territories">,account:Pick<Account,"postalCode"|"ownerId">):AccountTerritoryState{
  if(!territorySystemEnabled(data))return"Unresolved";
  const zip=normalizePostalCode(account.postalCode);
  if(!zip)return"Unresolved";
  const territory=territoryForPostalCode(data,zip);
  if(!territory)return"Outside coverage";
  return territory.ownerId===account.ownerId?"Owned":"Owner mismatch";
}

export function territoryAccounts(data:Pick<WorkspaceData,"accounts"|"territories">,territoryId:string){
  const territory=(data.territories??[]).find((item)=>item.id===territoryId&&item.status==="Active");
  if(!territory)return[];
  const coverage=new Set(territory.postalCodes);
  return data.accounts.filter((account)=>coverage.has(normalizePostalCode(account.postalCode)));
}
