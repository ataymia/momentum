import type { WorkspaceData, WorkspaceUser } from "./types";
const managerRoles=new Set<WorkspaceUser["role"]>(["Administrator","Sales Manager","Operations"]);

/** Reporting contacts are informational, not role grants or compensation recipients. */
export function reportingManagerCandidates(data:WorkspaceData,employeeId:string){
  return data.users.filter((user)=>user.id!==employeeId&&managerRoles.has(user.role)).sort((a,b)=>a.name.localeCompare(b.name));
}

export function validAdditionalManagerIds(input:unknown,data:WorkspaceData,employeeId:string,primaryId?:string):string[]{
  if(!Array.isArray(input))return [];
  const allowed=new Set(reportingManagerCandidates(data,employeeId).map((user)=>user.id));
  return [...new Set(input.filter((id):id is string=>typeof id==="string"&&allowed.has(id)&&id!==primaryId))];
}

/** Select only currently active employees for new reporting assignments. Historical IDs remain readable. */
export function selectableReportingManagerCandidates(data:WorkspaceData,employeeId:string,activeIds:ReadonlySet<string>){
  return reportingManagerCandidates(data,employeeId).filter((user)=>activeIds.has(user.id));
}

/** UI-save validation: never add a former or inactive employee as a new reporting contact. */
export function validSelectableAdditionalManagerIds(input:unknown,data:WorkspaceData,employeeId:string,primaryId:string|undefined,activeIds:ReadonlySet<string>):string[]{
  const selectable=new Set(selectableReportingManagerCandidates(data,employeeId,activeIds).map((user)=>user.id));
  return validAdditionalManagerIds(input,data,employeeId,primaryId).filter((id)=>selectable.has(id));
}
