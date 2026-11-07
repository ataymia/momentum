"use client";
import {createContext,createElement,useContext,useEffect,useMemo,useState,useSyncExternalStore} from "react";
import type {ReactNode} from "react";
import {staffMeetingRequest,type StaffMeetingCommand} from "./staff-meetings-client";
import type {Appointment} from "./types";
import {useRuntimeMode} from "./runtime-mode";
import {useWorkspace} from "./workspace-context";
import {momentumStorage} from "./persistence";
import {
  MEETINGS_DEMO_KEY,EMPTY_MEETINGS,meetingEligibleUsers,meetingVisibleTo,mayOrganize,
  meetingConflicts,meetingHasEnded,normalizeMeetings,validateMeeting,type MeetingInput,type TeamMeeting,type Rsvp,
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
function useLocalMeetingWorkspace(){
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
    const update:TeamMeeting={...m,status:"Cancelled",revision:m.revision+1,seenRevision:{...m.seenRevision,[currentUser!.id]:m.revision+1},updatedAt:at,history:[...m.history,{actorId:currentUser!.id,action:"Cancelled" as const,at,detail:"Meeting cancelled by organizer."}].slice(-200)};
    return{result:{ok:true,id},meetings:all.map(item=>item.id===id?update:item)};
  });
  const rsvp=(id:string,response:Exclude<Rsvp,"Pending">):ChangeResult=>commit(all=>{
    const m=all.find(item=>item.id===id);
    if(!m||m.status!=="Scheduled"||meetingHasEnded(m)||!m.attendeeIds.includes(currentUser!.id)||!["Accepted","Tentative","Declined"].includes(response))return{result:{ok:false,message:"You cannot respond to this meeting."}};
    if(m.rsvps[currentUser!.id]===response)return{result:{ok:true,id},meetings:all};
    const at=new Date().toISOString();
    const updated:TeamMeeting={...m,rsvps:{...m.rsvps,[currentUser!.id]:response},
      seenRevision:{...m.seenRevision,[currentUser!.id]:m.revision},history:[...m.history,{actorId:currentUser!.id,action:"RSVP" as const,at,detail:response}].slice(-200)};
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


type MeetingWorkspace=Omit<ReturnType<typeof useLocalMeetingWorkspace>,"create"|"revise"|"cancel"|"rsvp"|"seen"> & {
  cloudReady:boolean;cloudError:string;
  create:(input:MeetingInput)=>ChangeResult|Promise<ChangeResult>;
  revise:(id:string,input:MeetingInput)=>ChangeResult|Promise<ChangeResult>;
  cancel:(id:string)=>ChangeResult|Promise<ChangeResult>;
  rsvp:(id:string,response:Exclude<Rsvp,"Pending">)=>ChangeResult|Promise<ChangeResult>;
  seen:(id:string)=>ChangeResult|Promise<ChangeResult>;
};
type RemoteState={userId:string;ready:boolean;meetings:TeamMeeting[];error:string};
const MeetingContext=createContext<MeetingWorkspace|null>(null);

/** Single authenticated read/poll source for Home, Calendar, bell and Action Center. */
export function MeetingProvider({children}:{children:ReactNode}){
  const local=useLocalMeetingWorkspace(),{data}=useWorkspace();
  const [remote,setRemote]=useState<RemoteState>({userId:"",ready:false,meetings:[],error:""});
  const userId=local.currentUser?.id??"";
  const cloudReady=!local.isLocal&&Boolean(userId)&&remote.userId===userId&&remote.ready;
  const cloudVisible=useMemo(()=>cloudReady?remote.meetings.filter(m=>meetingVisibleTo(m,local.currentUser)):[],
    [cloudReady,remote.meetings,local.currentUser]);
  useEffect(()=>{
    if(local.isLocal||!userId)return;
    let cancelled=false;
    const refresh=async()=>{
      const result=await staffMeetingRequest({action:"list"});
      if(cancelled)return;
      if(!result.ok){
        setRemote({userId,ready:false,meetings:[],error:result.message??"Meeting service unavailable."});
      }else{
        const meetings=normalizeMeetings({version:1,meetings:result.meetings??[]},data.users).meetings;
        setRemote({userId,ready:true,meetings,error:""});
      }
    };
    void refresh();
    // Avoid charging the company for background-tab polling. Recheck on return,
    // with a modest foreground cadence until push delivery is explicitly approved.
    const onFocus=()=>{if(document.visibilityState==="visible")void refresh();};
    const timer=window.setInterval(onFocus,120000);
    window.addEventListener("focus",onFocus);
    document.addEventListener("visibilitychange",onFocus);
    return()=>{cancelled=true;window.clearInterval(timer);window.removeEventListener("focus",onFocus);document.removeEventListener("visibilitychange",onFocus);};
  },[local.isLocal,userId,data.users]);

  const send=async(command:StaffMeetingCommand):Promise<ChangeResult>=>{
    if(local.isLocal||!cloudReady||!userId)return{ok:false,message:"Secure meeting service is not ready for this employee."};
    const result=await staffMeetingRequest(command);
    if(!result.ok){
      if(/sign-in|expired|authorization|active employee/i.test(result.message??"")){
        setRemote({userId,ready:false,meetings:[],error:result.message??"Employee access denied."});
      }
      return{ok:false,message:result.message??"Meeting action was not confirmed."};
    }
    if(result.meeting){
      const normalized=normalizeMeetings({version:1,meetings:[result.meeting]},data.users).meetings;
      if(!normalized.length)return{ok:false,message:"The meeting was saved but could not be validated. Refresh before retrying."};
      setRemote(previous=>previous.userId===userId?{
        userId,ready:true,error:"",meetings:[normalized[0],...previous.meetings.filter(m=>m.id!==normalized[0].id)],
      }:previous);
    }
    return{ok:true,id:result.meeting?.id};
  };

  const value:MeetingWorkspace=local.isLocal?{...local,cloudReady:false,cloudError:""}:{
    ...local,
    meetings:cloudVisible,
    cloudReady,cloudError:remote.userId===userId?remote.error:"",
    allowed:cloudReady&&mayOrganize(local.currentUser),
    create:(input)=>send({action:"create",meeting:input}),
    revise:(id,input)=>{
      const current=cloudVisible.find(m=>m.id===id);
      return current?send({action:"update",id,expectedRevision:current.revision,meeting:input}):
        Promise.resolve({ok:false,message:"Meeting is not accessible or has not loaded."});
    },
    cancel:(id)=>{
      const current=cloudVisible.find(m=>m.id===id);
      return current?send({action:"cancel",id,expectedRevision:current.revision}):
        Promise.resolve({ok:false,message:"Meeting is not accessible or has not loaded."});
    },
    rsvp:(id,response)=>send({action:"rsvp",id,response}),
    seen:(id)=>send({action:"seen",id}),
  };
  return createElement(MeetingContext.Provider,{value},children);
}

export function useMeetingWorkspace():MeetingWorkspace{
  const value=useContext(MeetingContext);
  if(!value)throw new Error("Meeting workspace requires MeetingProvider.");
  return value;
}
