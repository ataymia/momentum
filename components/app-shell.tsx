"use client";

import { useEffect, useRef } from "react";
import { EMPLOYEE_DIRECTORY_COLLECTION, directoryDocument } from "../lib/firebase-access";
import { commitFirestoreWrites } from "../lib/firebase-firestore-rest";
import { useFirebaseSessionOptional } from "../lib/firebase-session-context";
import type { WorkspaceUser } from "../lib/types";
import { useWorkspace } from "../lib/workspace-context";
import { DeliveryDriverShell } from "./delivery-driver-shell";
import { AppShell as BaseAppShell } from "./app-shell-v4";

const FOUNDER_PROFILES:Record<string,{name:string;firstName:string;initials:string;title:string;accent:string}>={
  "vixarynholdings@gmail.com":{name:"Ataymia Murray",firstName:"Ataymia",initials:"AM",title:"Director of Operations",accent:"#e49e13"},
  "momentumdistributioninc@gmail.com":{name:"Florim Ymeri",firstName:"Florim",initials:"FY",title:"General Manager",accent:"#0b2e92"},
};

/**
 * The founding accounts can pre-date their employeeDirectory profile because they are allowed to bootstrap
 * Firebase access before HR provisioning exists. Repair that one-time gap from the authenticated identity so
 * the production UI never falls back to displaying an e-mail address as a person's name.
 */
function FoundingProfileRepair(){
  const firebase=useFirebaseSessionOptional();
  const {currentUser}=useWorkspace();
  const attempted=useRef(false);

  useEffect(()=>{
    if(attempted.current)return;
    const session=firebase?.session;
    const access=firebase?.access;
    if(!session||!access||access.role!=="Administrator"||access.accountState!=="Active")return;
    const profile=FOUNDER_PROFILES[session.email.toLowerCase()];
    if(!profile)return;
    const existing=firebase.directory.find((user)=>user.id===session.uid);
    if(existing&&existing.name===profile.name&&existing.firstName===profile.firstName&&existing.title===profile.title)return;

    attempted.current=true;
    const repaired:WorkspaceUser={
      id:session.uid,
      name:profile.name,
      firstName:profile.firstName,
      email:session.email,
      initials:profile.initials,
      title:profile.title,
      role:"Administrator",
      team:"Leadership",
      managerId:existing?.managerId??currentUser?.managerId,
      managedTeams:existing?.managedTeams??currentUser?.managedTeams,
      accountIds:existing?.accountIds??currentUser?.accountIds,
      accent:profile.accent,
    };

    let cancelled=false;
    void commitFirestoreWrites([{kind:"set",path:`${EMPLOYEE_DIRECTORY_COLLECTION}/${session.uid}`,data:directoryDocument(repaired)}]).then((result)=>{
      if(!cancelled&&result.ok)window.location.reload();
    });
    return()=>{cancelled=true;};
  },[currentUser,firebase]);

  return null;
}

export function AppShell(){
  const {currentUser}=useWorkspace();
  return <><FoundingProfileRepair/>{currentUser?.role==="Delivery Driver"?<DeliveryDriverShell/>:<BaseAppShell/>}</>;
}
