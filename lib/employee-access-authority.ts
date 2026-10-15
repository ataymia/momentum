import type { AccountAccessState } from "./identity-provisioning";

/**
 * Production authority is the Firebase userAccess record. Onboarding is employee workflow
 * evidence and MUST NOT independently disable a person an Administrator activated.
 * Missing authority remains unavailable: no unknown identity is implicitly activated.
 */
export type EmployeeEntryDecision = "Workspace" | "Onboarding" | "Unavailable";
export function employeeEntryDecision(input:{
 production:boolean;
 role:string;
 firebaseAccountState?:AccountAccessState;
 onboardingState?:AccountAccessState;
}):EmployeeEntryDecision{
 if(input.role==="Customer")return "Workspace";
 const access=input.production?input.firebaseAccountState:input.onboardingState;
 if(access==="Active")return "Workspace";
 if(access==="Suspended"||access==="Separated"||access===undefined)return "Unavailable";
 return "Onboarding";
}

/** Human Administrator authorization is required to revoke a working user's platform access. */
export function mayTransitionAccountState(input:{
 currentState:AccountAccessState;
 nextState:AccountAccessState;
 adminInitiated:boolean;
}):boolean{
 if(input.currentState==="Active"&&input.nextState!=="Active")return input.adminInitiated&&
   (input.nextState==="Suspended"||input.nextState==="Separated");
 return true;
}
