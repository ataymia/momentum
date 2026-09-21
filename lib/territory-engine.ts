import { arizonaDateKey } from "./date-time";
import { momentumStorage } from "./persistence";
import {
  TERRITORY_STORAGE_KEY,
  activeAssignments as advancedActiveAssignments,
  activeExceptions as advancedActiveExceptions,
  activeTerritories as advancedActiveTerritories,
  normalizeTerritoryState,
  primaryTerritoryForLocation,
  type Territory as ManagedTerritory,
  type TerritoryState,
} from "./territory-management";
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

/**
 * Read the richer territory model when it has been configured.
 *
 * The legacy ZIP suggestions remain a fallback so an existing market never loses routing information
 * merely because the managed-territory module was introduced. New assignments, shared coverage and
 * temporary coverage are authoritative whenever a managed territory covers the location.
 */
function managedState(data:Pick<WorkspaceData,"users">):TerritoryState|null{
  if(typeof window==="undefined")return null;
  const raw=momentumStorage.getItem(TERRITORY_STORAGE_KEY);
  if(!raw)return null;
  try{
    const state=normalizeTerritoryState(JSON.parse(raw) as unknown,data.users);
    return state.territories.length?state:null;
  }catch{
    return null;
  }
}

const assignmentPriority=(role:"Primary"|"Shared"|"Coverage")=>role==="Primary"?0:role==="Shared"?1:2;

function managedOwnerId(state:TerritoryState,territoryId:string,on:string){
  return advancedActiveAssignments(state,on)
    .filter((assignment)=>assignment.territoryId===territoryId)
    .sort((a,b)=>assignmentPriority(a.role)-assignmentPriority(b.role)||a.assignedAt.localeCompare(b.assignedAt))[0]?.userId;
}

function compatibleManagedTerritory(state:TerritoryState,territory:ManagedTerritory,on:string):SalesTerritory{
  return{
    id:territory.id,
    name:territory.name,
    ownerId:managedOwnerId(state,territory.id,on),
    postalCodes:territory.definition.kind==="postalCodes"?territory.definition.postalCodes:[],
    status:territory.status==="Retired"?"Suspended":territory.status,
    notes:territory.notes,
    createdAt:territory.createdAt,
    createdBy:territory.createdBy,
    updatedAt:territory.updatedAt,
    updatedBy:territory.updatedBy,
  };
}

function managedPostalMatch(data:Pick<WorkspaceData,"users">,postalCode:string|undefined){
  const zip=normalizePostalCode(postalCode);
  if(!zip)return undefined;
  const state=managedState(data);
  if(!state)return undefined;
  const on=arizonaDateKey();
  const match=primaryTerritoryForLocation(state,{id:`postal-${zip}`,postalCode:zip},on);
  return match?{state,on,territory:match.territory,compatible:compatibleManagedTerritory(state,match.territory,on)}:undefined;
}

function legacyActiveTerritories(data:Pick<WorkspaceData,"territories">){
  return(data.territories??[]).filter((territory)=>territory.status==="Active");
}

function legacyTerritoryForPostalCode(data:Pick<WorkspaceData,"territories">,postalCode:string|undefined){
  const zip=normalizePostalCode(postalCode);
  if(!zip)return undefined;
  return legacyActiveTerritories(data).find((territory)=>territory.postalCodes.includes(zip));
}

export function activeTerritories(data:Pick<WorkspaceData,"users"|"territories">){
  const state=managedState(data);
  const on=arizonaDateKey();
  const managed=state?advancedActiveTerritories(state,on).map((territory)=>compatibleManagedTerritory(state,territory,on)):[];
  const ids=new Set(managed.map((territory)=>territory.id));
  return[...managed,...legacyActiveTerritories(data).filter((territory)=>!ids.has(territory.id))];
}

export function territoryForPostalCode(data:Pick<WorkspaceData,"users"|"territories">,postalCode:string|undefined){
  return managedPostalMatch(data,postalCode)?.compatible??legacyTerritoryForPostalCode(data,postalCode);
}

export function territoryForAccount(data:Pick<WorkspaceData,"users"|"territories">,account:Pick<Account,"postalCode">){
  return territoryForPostalCode(data,account.postalCode);
}

export function territoryOverlap(data:Pick<WorkspaceData,"users"|"territories">,postalCodes:string[],ignoreId?:string){
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
    if(!draft.ownerId)return{ok:false,message:"An active territory needs a suggested sales representative.",postalCodes};
    const owner=data.users.find((user)=>user.id===draft.ownerId);
    if(!owner||owner.role!=="Sales Representative")return{ok:false,message:"Active territory suggestions can only point to a Sales Representative.",postalCodes};
    if(postalCodes.length===0)return{ok:false,message:"An active territory needs at least one ZIP code.",postalCodes};
    const overlap=territoryOverlap(data,postalCodes,draft.id);
    if(overlap)return{ok:false,message:`ZIP ${overlap.postalCode} is already active in ${overlap.territory.name}. Keep one geographic suggestion per ZIP so exceptions remain clear.`,postalCodes};
  }else if(draft.ownerId){
    const owner=data.users.find((user)=>user.id===draft.ownerId);
    if(!owner||owner.role!=="Sales Representative")return{ok:false,message:"Suggested territory owner must be a Sales Representative.",postalCodes};
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

export function territorySystemEnabled(data:Pick<WorkspaceData,"users"|"territories">){
  return activeTerritories(data).length>0;
}

/**
 * Territory coverage remains advisory in the commercial workflow. A deviation requires a documented reason
 * and management review, but geography alone never rewrites ownership, sales credit or historical records.
 */
export function canSalesRepWorkAccount(_data:Pick<WorkspaceData,"territories">,_user:WorkspaceUser,_account:Pick<Account,"postalCode">){
  return true;
}

/** Territory coverage does not lock dispatch or manual responsibility assignment. */
export function canAssignRepToAccountTerritory(_data:Pick<WorkspaceData,"territories">,_account:Pick<Account,"postalCode">,_repId:string){
  return true;
}

/**
 * A managed Primary, Shared or in-force Coverage assignment all count as valid territory access.
 * Approved territory-wide exceptions do too. Location-specific exceptions remain handled by the existing
 * account-linked approval workflow because this compatibility call receives a ZIP, not an account id.
 */
export function isTerritoryDeviation(data:Pick<WorkspaceData,"users"|"territories">,postalCode:string|undefined,repId:string){
  const managed=managedPostalMatch(data,postalCode);
  if(managed){
    const assigned=advancedActiveAssignments(managed.state,managed.on).some((assignment)=>assignment.territoryId===managed.territory.id&&assignment.userId===repId);
    if(assigned)return false;
    const excepted=advancedActiveExceptions(managed.state,managed.on).some((exception)=>exception.userId===repId&&exception.scope==="Territory"&&exception.requestedTerritoryId===managed.territory.id);
    return !excepted;
  }
  const legacy=legacyTerritoryForPostalCode(data,postalCode);
  return Boolean(territorySystemEnabled(data)&&(!legacy||legacy.ownerId!==repId));
}

export function accountTerritoryState(data:Pick<WorkspaceData,"users"|"territories">,account:Pick<Account,"postalCode"|"ownerId">):AccountTerritoryState{
  const zip=normalizePostalCode(account.postalCode);
  if(!zip)return"Unresolved";
  const managed=managedPostalMatch(data,zip);
  if(managed){
    const assigned=advancedActiveAssignments(managed.state,managed.on).some((assignment)=>assignment.territoryId===managed.territory.id&&assignment.userId===account.ownerId);
    return assigned?"Owned":"Owner mismatch";
  }
  if(!territorySystemEnabled(data))return"Unresolved";
  const territory=legacyTerritoryForPostalCode(data,zip);
  if(!territory)return"Outside coverage";
  return territory.ownerId===account.ownerId?"Owned":"Owner mismatch";
}

export function territoryAccounts(data:Pick<WorkspaceData,"accounts"|"users"|"territories">,territoryId:string){
  const territory=activeTerritories(data).find((item)=>item.id===territoryId);
  if(!territory)return[];
  const coverage=new Set(territory.postalCodes);
  return data.accounts.filter((account)=>coverage.has(normalizePostalCode(account.postalCode)));
}
