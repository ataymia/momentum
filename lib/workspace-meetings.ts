import {isValidCalendarDateKey,arizonaDateKey} from "./date-time";
import type {WorkspaceUser,Appointment} from "./types";

/** Local demonstration workflow. This is NOT an authenticated multi-user backend. */
export const MEETINGS_DEMO_KEY="momentum-demo-meetings-v1";
export type Rsvp="Pending"|"Accepted"|"Tentative"|"Declined";
export type MeetingChange={actorId:string;action:"Created"|"Updated"|"Cancelled"|"RSVP";at:string;detail:string};
export type TeamMeeting={
  id:string;title:string;agenda:string;location:string;date:string;startTime:string;endTime:string;
  organizerId:string;attendeeIds:string[];rsvps:Record<string,Rsvp>;seenRevision:Record<string,number>;
  revision:number;status:"Scheduled"|"Cancelled";createdAt:string;updatedAt:string;history:MeetingChange[];
};
export type MeetingInput=Pick<TeamMeeting,"title"|"agenda"|"location"|"date"|"startTime"|"endTime"|"attendeeIds">;
export type MeetingsState={version:1;meetings:TeamMeeting[]};
export type MeetingResult={ok:boolean;message?:string;meeting?:TeamMeeting};
export const EMPTY_MEETINGS:MeetingsState={version:1,meetings:[]};
const time=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const rsvps=new Set<Rsvp>(["Pending","Accepted","Tentative","Declined"]);
const validIso=(value:string)=>typeof value==="string"&&!Number.isNaN(Date.parse(value));
const member=(user:WorkspaceUser)=>user.role!=="Customer"&&user.employmentStatus!=="Separated";
export const meetingEligibleUsers=(users:readonly WorkspaceUser[])=>users.filter(member);
export const mayOrganize=(user:WorkspaceUser|null|undefined)=>Boolean(user&&member(user)&&["Administrator","Sales Manager","Operations","Marketing"].includes(user.role));
export const meetingVisibleTo=(meeting:TeamMeeting,user:WorkspaceUser|null|undefined)=>Boolean(user&&member(user)&&(meeting.organizerId===user.id||meeting.attendeeIds.includes(user.id)));
export const personalMeetings=(meetings:readonly TeamMeeting[],user:WorkspaceUser|null|undefined)=>meetings.filter(m=>meetingVisibleTo(m,user));
const validId=(value:unknown)=>typeof value==="string"&&value.length>0&&value.length<=128;
const validMeeting=(m:unknown,ids:Set<string>):m is TeamMeeting=>{
  if(!m||typeof m!=="object")return false;
  const x=m as TeamMeeting;
  if(!validId(x.id)||!x.title?.trim()||x.title.length>160||typeof x.agenda!=="string"||x.agenda.length>4000||typeof x.location!=="string"||x.location.length>240||
     !isValidCalendarDateKey(x.date)||!time.test(x.startTime)||!time.test(x.endTime)||x.startTime>=x.endTime||
     !ids.has(x.organizerId)||!Array.isArray(x.attendeeIds)||x.attendeeIds.length<1||x.attendeeIds.length>100||
     !x.attendeeIds.every(id=>ids.has(id)&&id!==x.organizerId)||new Set(x.attendeeIds).size!==x.attendeeIds.length||
     !["Scheduled","Cancelled"].includes(x.status)||!Number.isInteger(x.revision)||x.revision<1||
     !validIso(x.createdAt)||!validIso(x.updatedAt)||typeof x.rsvps!=="object"||!x.rsvps||
     typeof x.seenRevision!=="object"||!x.seenRevision||!Array.isArray(x.history))return false;
  if(!x.attendeeIds.every(id=>rsvps.has(x.rsvps[id])))return false;
  if(!Object.entries(x.seenRevision).every(([id,v])=>ids.has(id)&&Number.isInteger(v)&&v>=0&&v<=x.revision))return false;
  return x.history.length<=200&&x.history.every(h=>Boolean(h&&ids.has(h.actorId)&&validIso(h.at)&&["Created","Updated","Cancelled","RSVP"].includes(h.action)&&typeof h.detail==="string"&&h.detail.length<=1000));
};
export function normalizeMeetings(input:unknown,users:readonly WorkspaceUser[]):MeetingsState{
  if(!input||typeof input!=="object")return EMPTY_MEETINGS;
  const raw=input as Partial<MeetingsState>;
  if(raw.version!==1||!Array.isArray(raw.meetings))return EMPTY_MEETINGS;
  const ids=new Set(users.map(user=>user.id));
  const seen=new Set<string>();
  return {version:1,meetings:raw.meetings.filter(m=>validMeeting(m,ids)&&!seen.has(m.id)&&(seen.add(m.id),true)).slice(0,1500)};
}
export function validateMeeting(input:MeetingInput,actor:WorkspaceUser|null,users:readonly WorkspaceUser[]):MeetingResult{
  if(!mayOrganize(actor))return{ok:false,message:"You cannot organize staff meetings with your current role."};
  if(!input.title?.trim()||input.title.trim().length>160)return{ok:false,message:"Enter a meeting title of 1–160 characters."};
  if(typeof input.agenda!=="string"||input.agenda.trim().length<5||input.agenda.length>4000)return{ok:false,message:"Enter a short meeting agenda (5–4,000 characters)."};
  if(typeof input.location!=="string"||!input.location.trim()||input.location.length>240)return{ok:false,message:"Enter a meeting location or video-call description."};
  if(!isValidCalendarDateKey(input.date)||!time.test(input.startTime)||!time.test(input.endTime)||input.startTime>=input.endTime)return{ok:false,message:"Choose a valid Arizona date and an end time after the start time."};
  if(input.date<arizonaDateKey())return{ok:false,message:"Meetings cannot be created in the past."};
  const permitted=new Set(meetingEligibleUsers(users).map(u=>u.id));
  if(input.attendeeIds.length<1||input.attendeeIds.length>100||new Set(input.attendeeIds).size!==input.attendeeIds.length||
      input.attendeeIds.some(id=>id===actor?.id||!permitted.has(id)))return{ok:false,message:"Select at least one unique active employee other than yourself."};
  return{ok:true};
}
const overlap=(a:{date:string;startTime:string;endTime:string},b:{date:string;startTime:string;endTime:string})=>a.date===b.date&&a.startTime<b.endTime&&b.startTime<a.endTime;
export function meetingConflicts(meetings:readonly TeamMeeting[],input:MeetingInput,organizerId:string,excludeId?:string,appointments:readonly Appointment[]=[]):string[]{
  const people=new Set([organizerId,...input.attendeeIds]);
  const conflicts=meetings.filter(m=>m.id!==excludeId&&m.status==="Scheduled"&&overlap(input,m)&&[m.organizerId,...m.attendeeIds].some(id=>people.has(id)))
    .map(m=>"Meeting conflict: "+m.title);
  const from=input.startTime,through=input.endTime;
  for(const a of appointments){
    if(a.date!==input.date||!a.ownerId||!people.has(a.ownerId)||a.status==="Completed"||a.status==="Needs follow-up")continue;
    const startMinutes=Number(a.startTime.slice(0,2))*60+Number(a.startTime.slice(3));
    const endMinutes=startMinutes+a.duration;
    const end=String(Math.floor(endMinutes/60)).padStart(2,"0")+":"+String(endMinutes%60).padStart(2,"0");
    if(from<end&&a.startTime<through)conflicts.push("Field appointment conflict: "+a.type);
  }
  return conflicts;
}
export function meetingNotices(meetings:readonly TeamMeeting[],user:WorkspaceUser|null|undefined){
  if(!user||!member(user))return [];
  return personalMeetings(meetings,user).filter(m=>m.status==="Scheduled").flatMap(m=>{
    const invited=m.attendeeIds.includes(user.id);
    const pending=invited&&m.rsvps[user.id]==="Pending";
    const changed=(m.seenRevision[user.id]??0)<m.revision;
    if(!pending&&!changed)return [];
    return [{id:"meeting:"+m.id,title:pending?"Meeting invitation: "+m.title:"Meeting changed: "+m.title,
      date:m.date,time:m.startTime,meetingId:m.id,kind:pending?"Invitation":"Update"} as const];
  }).sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
}
export function upcomingMeetings(meetings:readonly TeamMeeting[],user:WorkspaceUser|null|undefined,from=arizonaDateKey()){
  return personalMeetings(meetings,user).filter(m=>m.status==="Scheduled"&&m.date>=from)
    .sort((a,b)=>a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime)||a.id.localeCompare(b.id));
}
const icsEscape=(s:string)=>s.replaceAll("\\","\\\\").replaceAll("\r","").replaceAll("\n","\\n").replaceAll(",","\\,").replaceAll(";","\\;");
const utc=(date:string,timeValue:string)=>new Date(date+"T"+timeValue+":00-07:00").toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");
export function meetingCalendarFile(m:TeamMeeting):string{
  const header=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Momentum Distribution//Personal Meeting Calendar//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH"];
  const event=["BEGIN:VEVENT","UID:"+icsEscape(m.id)+"@momentum.local","DTSTAMP:"+utc(m.createdAt.slice(0,10),m.createdAt.slice(11,16)),"DTSTART:"+utc(m.date,m.startTime),
    "DTEND:"+utc(m.date,m.endTime),"SUMMARY:"+icsEscape(m.title),"DESCRIPTION:"+icsEscape(m.agenda),"LOCATION:"+icsEscape(m.location),
    "STATUS:"+(m.status==="Cancelled"?"CANCELLED":"CONFIRMED"),"SEQUENCE:"+m.revision,"END:VEVENT","END:VCALENDAR"];
  return [...header,...event].join("\r\n")+"\r\n";
}
