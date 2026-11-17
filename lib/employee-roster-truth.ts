import type {EmploymentRecord} from "./hcm-engine";
import type {WorkspaceUser} from "./types";
import type {AccountAccessState} from "./identity-provisioning";
export type RosterStatus="Active"|"Leave"|"Prehire"|"Separated"|"Suspended"|"Onboarding"|"Unverified";
export type RosterTruth={status:RosterStatus;needsReconciliation:boolean;issue?:string};
/** Read-only HR and IAM reconciliation. Never silently changes personnel status or access. */
export function employeeRosterTruth(
 user:Pick<WorkspaceUser,"employmentStatus">,
 employment?:Pick<EmploymentRecord,"status">,
 access?:{accountState:AccountAccessState},
 connected=false,
):RosterTruth{
 const iam=access?.accountState;
 const hr=employment?.status;
 if(user.employmentStatus==="Separated"||hr==="Separated"||iam==="Separated"){
  const mismatch=iam==="Active"||hr==="Active"&&iam==="Separated";
  return{status:"Separated",needsReconciliation:Boolean(mismatch),
   ...(mismatch?{issue:"Separated employment and active identity do not agree. Review access revocation."}:{})};
 }
 if(iam==="Suspended")return{status:"Suspended",needsReconciliation:hr==="Active",
  ...(hr==="Active"?{issue:"HR is Active but identity is suspended."}:{})};
 if(connected&&!access)return{status:"Unverified",needsReconciliation:true,
  issue:"Missing identity access authority; do not count as Active."};
 if(iam&&iam!=="Active")return{status:"Onboarding",needsReconciliation:hr==="Active",
  ...(hr==="Active"?{issue:"HR Active but identity is still onboarding."}:{})};
 if(hr==="Prehire")return{status:"Prehire",needsReconciliation:iam==="Active",
  ...(iam==="Active"?{issue:"Identity Active while HR is Prehire."}:{})};
 if(hr==="Active"||hr==="Leave")return{status:hr,needsReconciliation:false};
 return{status:"Unverified",needsReconciliation:true,
  issue:"No verified active HR record; check workforce classification and access."};
}
