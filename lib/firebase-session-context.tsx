"use client";

import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { EMPLOYEE_DIRECTORY_COLLECTION, PLATFORM_BOOTSTRAP_DOCUMENT, PLATFORM_META_DOCUMENT, USER_ACCESS_COLLECTION, buildPersistenceScope, directoryDocument, normalizeDirectoryEntry, normalizeUserAccess, userAccessDocument, type UserAccessRecord } from "./firebase-access";
import { ProvisioningError, createFirebaseIdentityAsAdministrator, deleteEmployeeIdentity, lookupProvisioningStatus, type CreatedFirebaseIdentity } from "./firebase-admin-provisioning";
import { isProvisionableRole, type ProvisionEmployeeProfile, type ProvisioningStage, type ProvisioningStatusSuccess } from "./provisioning-contract";
import { FirebaseAuthSession, currentFirebaseSession, lookupFirebaseAccount, refreshFirebaseSession, requestPasswordResetByUsername, requestUsernameReminder, sendFirebaseEmailVerification, signInWithUsername, signOutFirebase, updateFirebasePassword } from "./firebase-auth-rest";
import { SIGN_IN_REJECTED } from "./auth-contract";
import { firebaseConfigurationStatus } from "./firebase-config";
import { FirestoreRequestError, commitFirestoreWrites, getFirestoreSnapshot, getFirestoreSnapshots, listFirestoreSnapshots, type FirestoreWrite } from "./firebase-firestore-rest";
import { EMPLOYEE_DIRECTORY_META_KEY, metaVersionKey, userDocPath } from "./firestore-domains";
import type { AccountAccessState, IdentityProvisioningRecord } from "./identity-provisioning";
import { attachFirestorePersistence, detachFirestorePersistence, momentumStorage, updateFirestoreScope } from "./persistence";
import type { Role, Team, WorkspaceUser } from "./types";
import { normalizeUsername, usernameProblem } from "./username";

export type FirebaseSessionStatus="unconfigured"|"initializing"|"signed-out"|"no-access"|"loading-workspace"|"ready"|"error";
export type ActionResult={ok:boolean;message?:string};
export type CreateEmployeeAccountInput={user:Omit<WorkspaceUser,"id">;temporaryPassword:string};
/** `stage` tells the Administrator which step failed; `outcome` distinguishes a new hire from a recovered one. */
export type CreateEmployeeAccountResult=ActionResult&{uid?:string;stage?:ProvisioningStage;outcome?:CreatedFirebaseIdentity["outcome"]};
export type UserAccessPatch=Partial<Pick<UserAccessRecord,"role"|"team"|"managerId"|"managedTeams">>&{title?:string};

export type FirebaseSessionValue={
  configured:boolean;
  projectId?:string;
  status:FirebaseSessionStatus;
  error?:string;
  session:FirebaseAuthSession|null;
  access:UserAccessRecord|null;
  emailVerified:boolean;
  directory:WorkspaceUser[];
  /** Administrator-only: every access record, keyed by uid. */
  accessRecords:Record<string,UserAccessRecord>;
  signIn:(username:string,password:string)=>Promise<ActionResult>;
  signOut:()=>Promise<void>;
  retry:()=>Promise<void>;
  changePassword:(newPassword:string)=>Promise<ActionResult>;
  /** Forgot password: resolves the recovery address from a username and reveals only a masked form. */
  sendPasswordReset:(username:string)=>Promise<ActionResult>;
  /** Forgot username: files an Administrator task. Answers identically whether or not the e-mail matches. */
  recoverUsername:(email:string)=>Promise<ActionResult>;
  sendVerificationEmail:()=>Promise<ActionResult>;
  refreshVerification:()=>Promise<boolean>;
  claimAdministrator:(profile:{name:string;title:string})=>Promise<ActionResult>;
  createEmployeeAccount:(input:CreateEmployeeAccountInput)=>Promise<CreateEmployeeAccountResult>;
  /** Administrator-only: is there an orphan Firebase identity for this address that can be recovered? */
  provisioningStatus:(email:string)=>Promise<ProvisioningStatusSuccess|null>;
  /** Administrator-only: permanently remove an identity and free its work e-mail for re-use. */
  deleteEmployeeAccount:(uid:string)=>Promise<ActionResult>;
  setAccountState:(uid:string,state:AccountAccessState)=>Promise<ActionResult>;
  updateUserAccess:(uid:string,patch:UserAccessPatch)=>Promise<ActionResult>;
  grantAdministrator:(uid:string)=>Promise<ActionResult>;
};

const Context=createContext<FirebaseSessionValue|null>(null);
const now=()=>new Date().toISOString();
const versionStamp=()=>`${now()}#${Math.random().toString(36).slice(2,8)}`;
const message=(error:unknown,fallback:string)=>error instanceof Error&&error.message?error.message:fallback;
const directoryMetaWrite=(...extraPaths:string[]):FirestoreWrite=>{
  const stamp=versionStamp();
  const keys=[EMPLOYEE_DIRECTORY_META_KEY,...extraPaths.map(metaVersionKey)];
  return{kind:"merge",path:PLATFORM_META_DOCUMENT,data:{versions:Object.fromEntries(keys.map((key)=>[key,stamp]))},fieldPaths:keys.map((key)=>`versions.${key}`)};
};
const identityRecordsPath=(uid:string)=>userDocPath(uid,"identity","records");

function initials(name:string){
  const parts=name.trim().split(/\s+/).filter(Boolean);
  return (parts.length>1?`${parts[0][0]}${parts.at(-1)![0]}`:name.slice(0,2)).toUpperCase();
}

export function FirebaseSessionProvider({children}:{children:ReactNode}){
  const configuration=firebaseConfigurationStatus();
  const [status,setStatus]=useState<FirebaseSessionStatus>(configuration.configured?"initializing":"unconfigured");
  const [error,setError]=useState<string|undefined>();
  const [session,setSession]=useState<FirebaseAuthSession|null>(null);
  const [access,setAccess]=useState<UserAccessRecord|null>(null);
  const [emailVerified,setEmailVerified]=useState(false);
  const [directory,setDirectory]=useState<WorkspaceUser[]>([]);
  const [accessRecords,setAccessRecords]=useState<Record<string,UserAccessRecord>>({});
  const accessRef=useRef<UserAccessRecord|null>(null);
  useEffect(()=>{accessRef.current=access;},[access]);

  const loadDirectory=useCallback(async(current:UserAccessRecord)=>{
    let users:WorkspaceUser[]=[];
    try{
      const snapshots=await listFirestoreSnapshots(EMPLOYEE_DIRECTORY_COLLECTION);
      users=snapshots.map((item)=>normalizeDirectoryEntry(item.path.split("/").pop()??"",item.data)).filter((item):item is WorkspaceUser=>Boolean(item));
    }catch(caught){
      if(!(caught instanceof FirestoreRequestError&&caught.status===403))throw caught;
      const self=await getFirestoreSnapshot(`${EMPLOYEE_DIRECTORY_COLLECTION}/${current.uid}`);
      const entry=normalizeDirectoryEntry(current.uid,self.data);
      users=entry?[entry]:[];
    }
    if(!users.some((user)=>user.id===current.uid)){
      users=[...users,{id:current.uid,name:current.email,firstName:current.email.split("@")[0],email:current.email,initials:initials(current.email),title:current.role,role:current.role,team:current.team,managerId:current.managerId,managedTeams:current.managedTeams,accent:"#53657d"}];
    }
    setDirectory(users);
    if(current.role==="Administrator"){
      const snapshots=await listFirestoreSnapshots(USER_ACCESS_COLLECTION).catch(()=>[]);
      const records:Record<string,UserAccessRecord>={};
      for(const item of snapshots){const uid=item.path.split("/").pop()??"";const record=normalizeUserAccess(uid,item.data);if(record)records[uid]=record;}
      setAccessRecords(records);
    }
    return users;
  },[]);

  const loadWorkspace=useCallback(async(active:FirebaseAuthSession)=>{
    setStatus("loading-workspace");
    setError(undefined);
    const accessSnapshot=await getFirestoreSnapshot(`${USER_ACCESS_COLLECTION}/${active.uid}`);
    const record=normalizeUserAccess(active.uid,accessSnapshot.data);
    if(!record){
      const info=await lookupFirebaseAccount(active).catch(()=>null);
      setEmailVerified(Boolean(info?.emailVerified));
      setAccess(null);
      setDirectory([]);
      setStatus("no-access");
      return;
    }
    setAccess(record);
    const users=await loadDirectory(record);
    const scope=buildPersistenceScope(record,users);
    await attachFirestorePersistence({scope,onDirectoryChange:()=>{
      const current=accessRef.current??record;
      void loadDirectory(current).then((next)=>updateFirestoreScope(buildPersistenceScope(current,next))).catch(()=>undefined);
    }});
    setStatus("ready");
  },[loadDirectory]);

  const resetToSignedOut=useCallback(async()=>{
    await detachFirestorePersistence();
    signOutFirebase();
    setSession(null);setAccess(null);setDirectory([]);setAccessRecords({});setEmailVerified(false);
    setStatus("signed-out");
  },[]);

  const boot=useCallback(async()=>{
    if(!configuration.configured){setStatus("unconfigured");return;}
    try{
      const active=await currentFirebaseSession();
      if(!active){await resetToSignedOut();return;}
      setSession(active);
      await loadWorkspace(active);
    }catch(caught){
      setError(message(caught,"Firebase could not be reached."));
      setStatus("error");
    }
  },[configuration.configured,loadWorkspace,resetToSignedOut]);

  useEffect(()=>{
    const handle=window.setTimeout(()=>void boot(),0);
    return()=>{window.clearTimeout(handle);void detachFirestorePersistence();};
  },[boot]);

  const signIn=useCallback(async(username:string,password:string):Promise<ActionResult>=>{
    if(!configuration.configured)return{ok:false,message:"Firebase is not configured for this deployment."};
    let active:FirebaseAuthSession|null=null;
    try{
      active=await signInWithUsername(username,password);
      setSession(active);
      await loadWorkspace(active);
      return{ok:true};
    }catch(caught){
      if(active){setError(message(caught,"The workspace could not be loaded."));setStatus("error");}
      return{ok:false,message:message(caught,SIGN_IN_REJECTED)};
    }
  },[configuration.configured,loadWorkspace]);

  const signOut=useCallback(async()=>{await momentumStorage.flush().catch(()=>undefined);await resetToSignedOut();},[resetToSignedOut]);

  const changePassword=useCallback(async(newPassword:string):Promise<ActionResult>=>{
    if(!session)return{ok:false,message:"Sign in first."};
    try{const updated=await updateFirebasePassword(session,newPassword);setSession(updated);return{ok:true};}
    catch(caught){return{ok:false,message:message(caught,"Password change failed.")};}
  },[session]);

  const sendPasswordReset=useCallback(async(username:string):Promise<ActionResult>=>{
    try{
      const {maskedEmail}=await requestPasswordResetByUsername(username);
      // The masked address is the only thing revealed, and only when the username resolved.
      return{ok:true,message:maskedEmail
        ?`A password reset link is on its way to ${maskedEmail}. Open it to set a new password, then sign in with your username.`
        :"If that username exists, a password reset link has been sent to the recovery e-mail on file."};
    }
    catch(caught){return{ok:false,message:message(caught,"Could not start password recovery.")};}
  },[]);

  const recoverUsername=useCallback(async(email:string):Promise<ActionResult>=>{
    try{
      await requestUsernameReminder(email);
      return{ok:true,message:"If that e-mail is on file, an Administrator has been notified and will confirm your username."};
    }
    catch(caught){return{ok:false,message:message(caught,"Could not submit the request.")};}
  },[]);

  const sendVerificationEmail=useCallback(async():Promise<ActionResult>=>{
    if(!session)return{ok:false,message:"Sign in first."};
    try{await sendFirebaseEmailVerification(session);return{ok:true,message:`Verification e-mail sent to ${session.email}.`};}
    catch(caught){return{ok:false,message:message(caught,"Could not send the verification e-mail.")};}
  },[session]);

  const refreshVerification=useCallback(async()=>{
    if(!session)return false;
    try{
      const refreshed=await refreshFirebaseSession(session);
      setSession(refreshed);
      const info=await lookupFirebaseAccount(refreshed);
      setEmailVerified(info.emailVerified);
      return info.emailVerified;
    }catch{return false;}
  },[session]);

  const claimAdministrator=useCallback(async(profile:{name:string;title:string}):Promise<ActionResult>=>{
    if(!session)return{ok:false,message:"Sign in first."};
    const name=profile.name.trim();const title=profile.title.trim()||"Administrator";
    if(name.length<2)return{ok:false,message:"Enter your full name."};
    const at=now();
    const user:WorkspaceUser={id:session.uid,name,firstName:name.split(/\s+/)[0],email:session.email,initials:initials(name),title,role:"Administrator",team:"Leadership",accent:"#e49e13"};
    const record:IdentityProvisioningRecord={id:`access-${session.uid}`,userId:session.uid,state:"Active",source:"Bootstrap admin",provisionedBy:session.uid,provisionedAt:at,firstLoginAt:at,activatedAt:at,activatedBy:session.uid};

    // Stage 1 creates the authority documents using the verified bootstrap claim. The identity audit record
    // cannot be in this same atomic request because its existing rule requires the Administrator access record
    // to already exist. Stage 2 writes that audit record after Firestore can resolve isAdmin() successfully.
    const accessResult=await commitFirestoreWrites([
      {kind:"set",path:PLATFORM_BOOTSTRAP_DOCUMENT,data:{claimedBy:session.uid,email:session.email,claimedAt:at}},
      {kind:"set",path:`${USER_ACCESS_COLLECTION}/${session.uid}`,data:userAccessDocument({email:session.email,role:"Administrator",team:"Leadership",accountState:"Active",updatedAt:at,updatedBy:session.uid}),create:true},
      {kind:"set",path:`${EMPLOYEE_DIRECTORY_COLLECTION}/${session.uid}`,data:directoryDocument(user,at),create:true},
      directoryMetaWrite(),
    ]);
    if(!accessResult.ok){
      if(accessResult.code==="PERMISSION_DENIED"||accessResult.status===403)return{ok:false,message:"Security Rules refused the Administrator claim. Confirm this e-mail is verified and listed in the bootstrap allow-list (firestore.rules)."};
      if(accessResult.code==="ALREADY_EXISTS"||accessResult.code==="FAILED_PRECONDITION")return{ok:false,message:"This Firebase identity already has a Momentum access record. Sign out and sign back in."};
      return{ok:false,message:accessResult.message};
    }

    const identityResult=await commitFirestoreWrites([
      {kind:"set",path:identityRecordsPath(session.uid),data:{items:[record]},create:true},
      directoryMetaWrite(identityRecordsPath(session.uid)),
    ]);
    if(!identityResult.ok&&identityResult.code!=="ALREADY_EXISTS"&&identityResult.code!=="FAILED_PRECONDITION"){
      return{ok:false,message:`Administrator access was created, but the provisioning record could not be finalized (${identityResult.message}). Sign out and sign back in.`};
    }

    try{await loadWorkspace(session);return{ok:true};}
    catch(caught){return{ok:false,message:message(caught,"Access was granted but the workspace could not be loaded. Reload the page.")};}
  },[loadWorkspace,session]);

  const requireAdministrator=useCallback(():ActionResult|null=>{
    if(!session||!access)return{ok:false,message:"Sign in first."};
    if(access.role!=="Administrator"||access.accountState!=="Active")return{ok:false,message:"Only an active Administrator can manage access."};
    return null;
  },[access,session]);

  const createEmployeeAccount=useCallback(async(input:CreateEmployeeAccountInput):Promise<CreateEmployeeAccountResult>=>{
    const denied=requireAdministrator();if(denied)return denied;
    const email=input.user.email.trim().toLowerCase();
    if(directory.some((user)=>user.email.toLowerCase()===email))return{ok:false,message:"That work e-mail already has a Momentum account."};
    if(!isProvisionableRole(input.user.role))return{ok:false,message:"That role cannot be provisioned here. Administrator access is granted separately."};
    const username=normalizeUsername(input.user.username??"");
    const usernameIssue=usernameProblem(username);
    if(usernameIssue)return{ok:false,message:usernameIssue};
    if(directory.some((user)=>user.username===username))return{ok:false,message:`The username ${username} is already taken. Choose another before creating this account.`};
    // The Worker creates the identity AND writes userAccess/employeeDirectory/identity records atomically,
    // so there is no window where an Auth identity exists without its access record.
    let identity:CreatedFirebaseIdentity;
    try{
      identity=await createFirebaseIdentityAsAdministrator(session!,{
        email,
        temporaryPassword:input.temporaryPassword,
        profile:{
          name:input.user.name,firstName:input.user.firstName,initials:input.user.initials,title:input.user.title,
          role:input.user.role,team:input.user.team as ProvisionEmployeeProfile["team"],managerId:input.user.managerId,accent:input.user.accent,
          username,phone:input.user.phone,
        },
      });
    }catch(caught){
      const stage=caught instanceof ProvisioningError?caught.stage:"service";
      return{ok:false,stage,message:message(caught,"Identity creation failed.")};
    }
    const at=now();
    const user:WorkspaceUser={...input.user,id:identity.uid,email,username};
    const accessRecord:UserAccessRecord={uid:identity.uid,email,username,role:user.role,team:user.team,managerId:user.managerId,managedTeams:user.managedTeams,accountState:"Password change required",updatedAt:at,updatedBy:session!.uid};
    const nextDirectory=[...directory.filter((item)=>item.id!==user.id),user];
    setDirectory(nextDirectory);
    setAccessRecords((current)=>({...current,[identity.uid]:accessRecord}));
    if(access)await updateFirestoreScope(buildPersistenceScope(access,nextDirectory)).catch(()=>undefined);
    return{ok:true,uid:identity.uid,outcome:identity.outcome};
  },[access,directory,requireAdministrator,session]);

  const provisioningStatus=useCallback(async(email:string):Promise<ProvisioningStatusSuccess|null>=>{
    if(requireAdministrator()||!session)return null;
    return lookupProvisioningStatus(session,email).catch(()=>null);
  },[requireAdministrator,session]);

  const deleteEmployeeAccount=useCallback(async(uid:string):Promise<ActionResult>=>{
    const denied=requireAdministrator();if(denied)return denied;
    if(uid===session!.uid)return{ok:false,message:"You cannot delete your own Administrator account."};
    let result;
    try{result=await deleteEmployeeIdentity(session!,uid);}
    catch(caught){return{ok:false,message:message(caught,"The account could not be deleted.")};}
    const nextDirectory=directory.filter((item)=>item.id!==uid);
    setDirectory(nextDirectory);
    setAccessRecords((current)=>{const next={...current};delete next[uid];return next;});
    if(access)await updateFirestoreScope(buildPersistenceScope(access,nextDirectory)).catch(()=>undefined);
    return{ok:true,message:`${result.email||"The account"} was deleted${result.authIdentityDeleted?"":" (its Firebase identity was already gone)"}. The work e-mail is free to use again.`};
  },[access,directory,requireAdministrator,session]);

  const writeAccess=useCallback(async(uid:string,accessPatch:Record<string,unknown>,directoryPatch:Record<string,unknown>|null):Promise<ActionResult>=>{
    const denied=requireAdministrator();if(denied)return denied;
    if(uid===session!.uid&&("role" in accessPatch||"accountState" in accessPatch))return{ok:false,message:"Administrators cannot change their own role or account state."};
    const at=now();
    const writes:FirestoreWrite[]=[{kind:"merge",path:`${USER_ACCESS_COLLECTION}/${uid}`,data:{...accessPatch,updatedAt:at,updatedBy:session!.uid},fieldPaths:[...Object.keys(accessPatch),"updatedAt","updatedBy"]}];
    if(directoryPatch)writes.push({kind:"merge",path:`${EMPLOYEE_DIRECTORY_COLLECTION}/${uid}`,data:{...directoryPatch,updatedAt:at},fieldPaths:[...Object.keys(directoryPatch),"updatedAt"]});
    writes.push(directoryMetaWrite());
    const result=await commitFirestoreWrites(writes);
    if(!result.ok)return{ok:false,message:result.message};
    const [accessSnapshot,directorySnapshot]=await getFirestoreSnapshots([`${USER_ACCESS_COLLECTION}/${uid}`,`${EMPLOYEE_DIRECTORY_COLLECTION}/${uid}`]);
    const record=normalizeUserAccess(uid,accessSnapshot?.data??null);
    const entry=normalizeDirectoryEntry(uid,directorySnapshot?.data??null);
    if(record)setAccessRecords((current)=>({...current,[uid]:record}));
    if(entry)setDirectory((current)=>current.map((item)=>item.id===uid?entry:item));
    return{ok:true};
  },[requireAdministrator,session]);

  const setAccountState=useCallback((uid:string,state:AccountAccessState)=>writeAccess(uid,{accountState:state},null),[writeAccess]);

  const updateUserAccess=useCallback((uid:string,patch:UserAccessPatch)=>{
    const accessPatch:Record<string,unknown>={};const directoryPatch:Record<string,unknown>={};
    if(patch.role){accessPatch.role=patch.role;directoryPatch.role=patch.role;}
    if(patch.team){accessPatch.team=patch.team;directoryPatch.team=patch.team;}
    if("managerId" in patch){accessPatch.managerId=patch.managerId??null;directoryPatch.managerId=patch.managerId??null;}
    if("managedTeams" in patch){accessPatch.managedTeams=patch.managedTeams??[];directoryPatch.managedTeams=patch.managedTeams??[];}
    if(patch.title)directoryPatch.title=patch.title;
    return writeAccess(uid,accessPatch,Object.keys(directoryPatch).length?directoryPatch:null);
  },[writeAccess]);

  const grantAdministrator=useCallback((uid:string)=>updateUserAccess(uid,{role:"Administrator" as Role,team:"Leadership" as Team,managerId:undefined,managedTeams:undefined}),[updateUserAccess]);

  const value=useMemo<FirebaseSessionValue>(()=>({
    configured:configuration.configured,projectId:configuration.projectId,status,error,session,access,emailVerified,directory,accessRecords,
    signIn,signOut,retry:boot,changePassword,sendPasswordReset,recoverUsername,sendVerificationEmail,refreshVerification,claimAdministrator,createEmployeeAccount,provisioningStatus,deleteEmployeeAccount,setAccountState,updateUserAccess,grantAdministrator,
  }),[access,accessRecords,boot,changePassword,claimAdministrator,configuration.configured,configuration.projectId,createEmployeeAccount,deleteEmployeeAccount,directory,emailVerified,error,grantAdministrator,provisioningStatus,recoverUsername,refreshVerification,sendPasswordReset,sendVerificationEmail,session,setAccountState,signIn,signOut,status,updateUserAccess]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** Returns null in local demo mode (no Firebase provider mounted). */
export function useFirebaseSessionOptional(){return useContext(Context);}

export function useFirebaseSession(){
  const value=useContext(Context);
  if(!value)throw new Error("useFirebaseSession must be used inside FirebaseSessionProvider");
  return value;
}
