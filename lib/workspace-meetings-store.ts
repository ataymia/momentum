"use client";
import {useMemo,useSyncExternalStore} from "react";
import type {Appointment} from "./types";
import {useRuntimeMode} from "./runtime-mode";
import {useWorkspace} from "./workspace-context";
import {momentumStorage} from "./persistence";
import {arizonaDateKey} from "./date-time";
import {
  MEETINGS_DEMO_KEY,EMPTY_MEETINGS,meetingEligibleUsers,meetingVisibleTo,mayOrganize,
  meetingConflicts,normalizeMeetings,validateMeeting,type MeetingInput,type TeamMeeting,type Rsvp,
} from "./workspace-meetings";

const eventName="momentum-demo-meetings-changed";
const subscribe=(listener:()=>void)=>{
  if(typeof window==="undefined")return()=>{};
  const onStorage=(e:StorageEvent)=>{if(e.key===MEETINGS_DEMO_KEY)listener();};
  window.addEventListener("storage",onStorage);
  window.addEventListener(eventName,listener);
  return()=>{window.removeEventListener("storage",onStorage);window.removeEventListener(eventName,listener);};
};
const snapshot=()=>typeof window==="undefined"?null:window.localStorage.getItem(MEETINGS_DEMO_KEY);
const serverSnapshot=()=>null;
type ChangeResult={ok:boolean;message?:string;id?:string};
const uid=()=> "mtg-"+Date.now()+"-"+Math.random().toString(36).slice(2,10);
export function useMeetingWorkspace(){
  const {data,scope,currentUser}=useWorkspace(),runtime=useRuntimeMode();
  const raw=useSyncExternalStore(subscribe,snapshot,serverSnapshot);
  const isLocal=runtime.isDemo&&momentumStorage.mode()==="local";
  const state=useMemo(()=>{
    if(!isLocal)return EMPTY_MEETINGS;
    try{return normalizeMeetings(raw?JSON.parse(raw):null,data.users);}catch{return EMPTY_MEETINGS;}
  },[isLocal,raw,data.users]);
  const meetings=useMemo(()=>state.meetings.filter(m=>meetingVisibleTo(m,currentUser)),[state.meetings,currentUser]);
  const users=useMemo(()=>meetingEligibleUsers(data.users),[data.users]);
  const allowed=Boolean(isLocal&&mayOrganize(currentUser));
  const commit=(change:(all:TeamMeeting[])=>{result:ChangeResult;meetings?:TeamMeeting[]}):ChangeResult=>{
    if(!isLocal||!currentUser||currentUser.employmentStatus==="Separated"||currentUser.role==="Customer")return{ok:false,message:"Staff meeting writes require an active employee in isolated local demonstration mode."};
    // Read immediately before every user mutation, not from a stale render snapshot.
    let persisted=EMPTY_MEETINGS;
    try{persisted=normalizeMeetings(JSON.parse(window.localStorage.getItem(MEETINGS_DEMO_KEY)??"null"),data.users);}catch{/* fail closed to an empty demo state */}
    const update=change(persisted.meetings);
    if(update.result.ok&&update.meetings){
      window.localStorage.setItem(MEETINGS_DEMO_KEY,JSON.stringify({version:1,meetings:update.meetings}));
      window.dispatchEvent(new Event(eventName));
    }
    return update.result;
  };
  const create=(input:MeetingInput):ChangeResult=>commit(all=>{
    const verdict=validateMeeting(input,currentUser,data.users);
    if(!allowed||!verdict.ok)return{result:{ok:false,message:verdict.message??"You may not create meetings."}};
    const collisions=meetingConflicts(all,input,currentUser!.id,undefined,scope.appointments);
    if(collisions.length)return{result:{ok:false,message:collisions.join("; ")}};
    const at=new Date().toISOString(),id=uid(),title=input.title.trim();
    const record:TeamMeeting={...input,id,title,agenda:input.agenda.trim(),location:input.location.trim(),
      attendeeIds:[...input.attendeeIds],organizerId:currentUser!.id,rsvps:Object.fromEntries(input.attendeeIds.map(id=>[id,"Pending" as Rsvp])),
      seenRevision:{[currentUser!.id]:1},revision:1,status:"Scheduled",createdAt:at,updatedAt:at,
      history:[{actorId:currentUser!.id,action:"Created",at,detail:"Meeting created with invited participants."}]};
    return{result:{ok:true,id},meetings:[record,...all]};
  });
  const revise=(id:string,input:MeetingInput):ChangeResult=>commit(all=>{
    const existing=all.find(m=>m.id===id);
    if(!existing||existing.organizerId!==currentUser?.id||existing.status==="Cancelled")return{result:{ok:false,message:"Only the organizer may revise an active meeting."}};
    const verdict=validateMeeting(input,currentUser,data.users);
    if(!verdict.ok)return{result:{ok:false,message:verdict.message}};
    const collisions=meetingConflicts(all,input,currentUser!.id,id,scope.appointments);
    if(collisions.length)return{result:{ok:false,message:collisions.join("; ")}};
    const at=new Date().toISOString(),shifted=input.date!==existing.date||input.startTime!==existing.startTime||input.endTime!==existing.endTime;
    const rsvps:Record<string,Rsvp>={};
    for(const personId of input.attendeeIds)rsvps[personId]=!shifted&&existing.attendeeIds.includes(personId)?existing.rsvps[personId]:"Pending";
    const updated:TeamMeeting={...existing,...input,title:input.title.trim(),agenda:input.agenda.trim(),location:input.location.trim(),
      attendeeIds:[...input.attendeeIds],rsvps,revision:existing.revision+1,updatedAt:at,
      seenRevision:{...existing.seenRevision,[currentUser!.id]:existing.revision+1},
      history:[...existing.history,{actorId:currentUser!.id,action:"Updated" as const,at,detail:"Meeting details or attendee list updated."}].slice(-200)};
    return{result:{ok:true,id},meetings:all.map(m=>m.id===id?updated:m)};
  });
  const cancel=(id:string):ChangeResult=>commit(all=>{
    const m=all.find(m=>m.id===id);
    if(!m||m.organizerId!==currentUser?.id||m.status==="Cancelled")return{result:{ok:false,message:"Only the organizer may cancel a scheduled meeting."}};
    const at=new Date().toISOString();
    const update:TeamMeeting={...m,status:"Cancelled",revision:m.revision+1,updatedAt:at,history:[...m.history,{actorId:currentUser!.id,action:"Cancelled" as const,at,detail:"Meeting cancelled by organizer."}].slice(-200)};
    return{result:{ok:true,id},meetings:all.map(item=>item.id===id?update:item)};
  });
  const rsvp=(id:string,response:Exclude<Rsvp,"Pending">):ChangeResult=>commit(all=>{
    const m=all.find(item=>item.id===id);
    if(!m||m.status!=="Scheduled"||!m.attendeeIds.includes(currentUser!.id)||!["Accepted","Tentative","Declined"].includes(response))return{result:{ok:false,message:"You cannot respond to this meeting."}};
    const at=new Date().toISOString();
    const updated:TeamMeeting={...m,rsvps:{...m.rsvps,[currentUser!.id]:response},revision:m.revision+1,updatedAt:at,
      seenRevision:{...m.seenRevision,[currentUser!.id]:m.revision+1},history:[...m.history,{actorId:currentUser!.id,action:"RSVP" as const,at,detail:response}].slice(-200)};
    return{result:{ok:true,id},meetings:all.map(item=>item.id===id?updated:item)};
  });
  const seen=(id:string):ChangeResult=>commit(all=>{
    const m=all.find(item=>item.id===id);
    if(!m||!meetingVisibleTo(m,currentUser))return{result:{ok:false,message:"Meeting is not visible to this employee."}};
    const revised={...m,seenRevision:{...m.seenRevision,[currentUser!.id]:m.revision}};
    return{result:{ok:true,id},meetings:all.map(item=>item.id===id?revised:item)};
  });
  return{meetings,users,allowed,isLocal,currentUser,appointments:scope.appointments as readonly Appointment[],create,revise,cancel,rsvp,seen};
}
