import type { WorkspaceUser } from "./types";
import type { AccountAccessState } from "./identity-provisioning";

/** This directory shows active employees only. In connected mode, a verified
 * Active access record AND non-separated HR record are required. Suspended,
 * inactive, onboarding and unprovisioned staff remain in permanent HR and
 * audit history, not the operational staff picker or active employee count.
 */
export function visibleActiveEmployees(
 users:readonly WorkspaceUser[],
 firebaseStates?:Readonly<Record<string,{accountState:AccountAccessState}>>,
):WorkspaceUser[]{
 return users.filter(user=>{
  if(user.role==="Customer"||user.employmentStatus==="Separated")return false;
  // An explicitly loaded Firebase directory is authoritative for active access.
  // Missing records must not be silently reclassified as Active.
  if(firebaseStates)return firebaseStates[user.id]?.accountState==="Active";
  return true;
 });
}
