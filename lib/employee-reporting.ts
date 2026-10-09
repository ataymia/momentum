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
