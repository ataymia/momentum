import type { AccountAccessState } from "./identity-provisioning";
import type { Role, Team, WorkspaceUser } from "./types";

/**
 * Firestore identity documents.
 *
 * `userAccess/{uid}` is the authority Security Rules consult for role, reporting line, and account state.
 * Only Administrators may write it (the first Administrator is bootstrapped under a rules-controlled path).
 *
 * `employeeDirectory/{uid}` is the workspace-facing profile every active employee may read. It mirrors the
 * `WorkspaceUser` shape the client engines already consume.
 */

export const USER_ACCESS_COLLECTION="userAccess";
export const EMPLOYEE_DIRECTORY_COLLECTION="employeeDirectory";
export const PLATFORM_BOOTSTRAP_DOCUMENT="platform/bootstrap";
export const PLATFORM_META_DOCUMENT="platform/meta";

export const EMPLOYEE_ROLES:Role[]=["Administrator","Sales Manager","Sales Representative","Operations","Warehouse"];
const roles=new Set<string>(["Administrator","Sales Manager","Sales Representative","Operations","Warehouse","Customer"]);
const teams=new Set<string>(["Leadership","Sales","Operations","Customer"]);
const accountStates=new Set<string>(["Password change required","Onboarding","Pending approval","Active","Suspended","Separated"]);

export type UserAccessRecord={
  uid:string;
  email:string;
  role:Role;
  team:Team;
  managerId?:string;
  managedTeams?:Team[];
  accountState:AccountAccessState;
  updatedAt:string;
  updatedBy:string;
};

export type EmployeeDirectoryRecord=WorkspaceUser&{updatedAt:string};

const text=(value:unknown)=>typeof value==="string"?value.trim():"";
const optionalText=(value:unknown)=>text(value)||undefined;
const teamList=(value:unknown):Team[]|undefined=>{
  if(!Array.isArray(value))return undefined;
  const list=[...new Set(value.filter((item):item is Team=>typeof item==="string"&&teams.has(item)))];
  return list.length?list:undefined;
};

export function normalizeUserAccess(uid:string,input:unknown):UserAccessRecord|null{
  if(!input||typeof input!=="object")return null;
  const raw=input as Record<string,unknown>;
  const role=text(raw.role);const team=text(raw.team);const accountState=text(raw.accountState);const email=text(raw.email).toLowerCase();
  if(!roles.has(role)||!teams.has(team)||!accountStates.has(accountState)||!email.includes("@"))return null;
  return{uid,email,role:role as Role,team:team as Team,managerId:optionalText(raw.managerId),managedTeams:teamList(raw.managedTeams),accountState:accountState as AccountAccessState,updatedAt:text(raw.updatedAt)||new Date(0).toISOString(),updatedBy:text(raw.updatedBy)||"unknown"};
}

export function normalizeDirectoryEntry(uid:string,input:unknown):WorkspaceUser|null{
  if(!input||typeof input!=="object")return null;
  const raw=input as Record<string,unknown>;
  const name=text(raw.name);const email=text(raw.email).toLowerCase();const role=text(raw.role);const team=text(raw.team);
  if(!name||!email.includes("@")||!roles.has(role)||!teams.has(team))return null;
  const parts=name.split(/\s+/).filter(Boolean);
  return{
    id:uid,
    name,
    firstName:text(raw.firstName)||parts[0]||name,
    email,
    initials:text(raw.initials)||(parts.length>1?`${parts[0][0]}${parts.at(-1)![0]}`:name.slice(0,2)).toUpperCase(),
    title:text(raw.title)||role,
    role:role as Role,
    team:team as Team,
    managerId:optionalText(raw.managerId),
    managedTeams:teamList(raw.managedTeams),
    accountIds:Array.isArray(raw.accountIds)?raw.accountIds.filter((item):item is string=>typeof item==="string"):undefined,
    accent:text(raw.accent)||"#53657d",
  };
}

export function directoryDocument(user:WorkspaceUser,updatedAt=new Date().toISOString()):Record<string,unknown>{
  return{
    name:user.name,firstName:user.firstName,email:user.email.toLowerCase(),initials:user.initials,title:user.title,
    role:user.role,team:user.team,managerId:user.managerId??null,managedTeams:user.managedTeams??[],accountIds:user.accountIds??[],accent:user.accent,updatedAt,
  };
}

export function userAccessDocument(record:Omit<UserAccessRecord,"uid">):Record<string,unknown>{
  return{email:record.email.toLowerCase(),role:record.role,team:record.team,managerId:record.managerId??null,managedTeams:record.managedTeams??[],accountState:record.accountState,updatedAt:record.updatedAt,updatedBy:record.updatedBy};
}

/** Scope the browser uses to decide which per-user Firestore shards to load and write. Mirrors `manages()` in firestore.rules. */
export type PersistenceScope={
  uid:string;
  role:Role;
  accountState:AccountAccessState;
  /** Users whose private shards this actor may read (always includes self). */
  readableUserIds:Set<string>;
  /** Users this actor manages (direct reports and explicitly managed teams). Excludes self. */
  managedUserIds:Set<string>;
};

export function buildPersistenceScope(access:UserAccessRecord,directory:WorkspaceUser[]):PersistenceScope{
  const managed=new Set<string>();
  if(access.role==="Sales Manager"){
    const teamsManaged=new Set(access.managedTeams??[]);
    for(const user of directory){
      if(user.id===access.uid||user.role==="Customer")continue;
      if(user.managerId===access.uid||teamsManaged.has(user.team))managed.add(user.id);
    }
  }
  const readable=new Set<string>([access.uid]);
  if(access.role==="Administrator")for(const user of directory)readable.add(user.id);
  else for(const id of managed)readable.add(id);
  return{uid:access.uid,role:access.role,accountState:access.accountState,readableUserIds:readable,managedUserIds:managed};
}

export const isActiveEmployee=(scope:PersistenceScope)=>scope.accountState==="Active"&&scope.role!=="Customer";
