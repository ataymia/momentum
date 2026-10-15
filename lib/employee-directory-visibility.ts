import type { WorkspaceUser } from "./types";
import type { AccountAccessState } from "./identity-provisioning";

/** Separated employees remain in permanent HR, payroll and audit records, not the active directory.
 * A local HR status never suspends an authorized Active account.
 */
export function visibleActiveEmployees(
 users:readonly WorkspaceUser[],
 firebaseStates?:Readonly<Record<string,{accountState:AccountAccessState}>>,
):WorkspaceUser[]{
 return users.filter(user=>{
  if(user.role==="Customer")return false;
  const status=firebaseStates?.[user.id]?.accountState;
  if(status==="Separated")return false;
  if(status==="Active")return true; // Authoritative active access overrides stale HR status.
  return user.employmentStatus!=="Separated";
 });
}
