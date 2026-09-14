import type { FirebaseAuthSession } from "./firebase-auth-rest";
import {
  PROVISIONING_STATUS_PATH,
  PROVISION_EMPLOYEE_PATH,
  temporaryPasswordProblem,
  type ProvisionEmployeeRequest,
  type ProvisionEmployeeSuccess,
  type ProvisioningStage,
  type ProvisioningStatusSuccess,
} from "./provisioning-contract";

/**
 * Administrator-only identity creation.
 *
 * Momentum never exposes public self-signup, and the browser can no longer create Firebase identities at
 * all. It asks the Cloudflare Worker at `/api/admin/*`, which verifies the Administrator's Firebase ID
 * token, confirms `userAccess/{caller}` is an Active Administrator, and only then uses the Firebase
 * service account to create the account and write its access records atomically.
 *
 * A freshly created Authentication user has no `userAccess/{uid}` document until that same privileged step
 * writes it, so Security Rules deny it everything in the meantime.
 */

export type CreatedFirebaseIdentity = { uid: string; email: string; outcome: ProvisionEmployeeSuccess["outcome"] };

/** Carries the failing stage so the UI can tell an Administrator whether to retry, recover, or escalate. */
export class ProvisioningError extends Error {
  readonly stage: ProvisioningStage;
  constructor(stage: ProvisioningStage, message: string) {
    super(message);
    this.name = "ProvisioningError";
    this.stage = stage;
  }
}

const TEMP_PASSWORD_ALPHABET="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

/** Random, human-transcribable temporary password (no ambiguous glyphs). */
export function generateTemporaryPassword(length=14){
  const bytes=new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let output="";
  for(const byte of bytes)output+=TEMP_PASSWORD_ALPHABET[byte%TEMP_PASSWORD_ALPHABET.length];
  return `${output.slice(0,4)}-${output.slice(4,9)}-${output.slice(9)}`;
}

export function validateTemporaryPassword(password:string){
  return temporaryPasswordProblem(password);
}

async function callAdminEndpoint<T extends {ok:true}>(path:string,session:FirebaseAuthSession,body:unknown):Promise<T>{
  let response:Response;
  try{
    response=await fetch(path,{
      method:"POST",
      headers:{"content-type":"application/json",authorization:`Bearer ${session.idToken}`},
      body:JSON.stringify(body),
    });
  }catch{
    throw new ProvisioningError("service","Could not reach the provisioning service. Check your connection and try again.");
  }
  const payload=await response.json().catch(()=>null) as (T|{ok:false;stage:ProvisioningStage;message:string})|null;
  if(!payload)throw new ProvisioningError("service",`The provisioning service returned an unreadable response (${response.status}).`);
  if(payload.ok!==true)throw new ProvisioningError(payload.stage,payload.message);
  return payload;
}

/**
 * Creates the Firebase identity *and* its Momentum access records in one privileged, atomic step.
 *
 * Re-running this for the same address is safe: the Worker adopts an orphan identity left by a previous
 * partial attempt rather than creating a duplicate, and reports `already-provisioned` when there is
 * nothing left to do.
 */
export async function createFirebaseIdentityAsAdministrator(session:FirebaseAuthSession,request:ProvisionEmployeeRequest):Promise<CreatedFirebaseIdentity>{
  const invalid=validateTemporaryPassword(request.temporaryPassword);
  if(invalid)throw new ProvisioningError("request",invalid);
  const result=await callAdminEndpoint<ProvisionEmployeeSuccess>(PROVISION_EMPLOYEE_PATH,session,request);
  return{uid:result.uid,email:result.email,outcome:result.outcome};
}

/** Lets the provisioning queue show whether a stuck hire can be recovered before anything is created. */
export async function lookupProvisioningStatus(session:FirebaseAuthSession,email:string):Promise<ProvisioningStatusSuccess>{
  return callAdminEndpoint<ProvisioningStatusSuccess>(PROVISIONING_STATUS_PATH,session,{email});
}
