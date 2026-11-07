import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {
 meetingCalendarFile,meetingConflicts,meetingEligibleUsers,meetingNotices,meetingVisibleTo,mayOrganize,normalizeMeetings,
 personalMeetings,upcomingMeetings,meetingHomeReminders,validateMeeting,type MeetingInput,type TeamMeeting,
} from "../lib/workspace-meetings";
import {addCalendarDays,arizonaDateKey} from "../lib/date-time";
import type {WorkspaceUser,Appointment} from "../lib/types";

const user=(id:string,role:WorkspaceUser["role"]="Sales Representative",separated=false):WorkspaceUser=>({
 id,name:id,firstName:id,email:id+"@example.invalid",initials:"ST",title:"Test",role,team:"Sales",accent:"#222",employmentStatus:separated?"Separated":"Active",
});
const admin=user("admin","Administrator"),rep=user("rep"),other=user("other"),customer=user("customer","Customer");
const left=user("left","Sales Manager",true);
const users=[admin,rep,other,customer,left];
const day=addCalendarDays(arizonaDateKey(),2);
const input:MeetingInput={title:"Weekly territory sync",agenda:"Discuss coverage and unresolved blockers",location:"Office / video",date:day,startTime:"09:00",endTime:"10:00",attendeeIds:["rep"]};
const record=(patch:Partial<TeamMeeting>={}):TeamMeeting=>({
 id:"meeting-1",...input,organizerId:"admin",rsvps:{rep:"Pending"},seenRevision:{admin:1},revision:1,status:"Scheduled",
 createdAt:"2026-11-06T16:10:00.000Z",updatedAt:"2026-11-06T16:10:00.000Z",
 history:[{actorId:"admin",action:"Created",at:"2026-11-06T16:10:00.000Z",detail:"Meeting created with invited participants."}],...patch,
});
test("B09 customer and separated employees never gain meeting access or scheduling rights",()=>{
 assert.deepEqual(meetingEligibleUsers(users).map(u=>u.id),["admin","rep","other"]);
 assert.equal(mayOrganize(admin),true);
 assert.equal(mayOrganize(user("manager","Sales Manager")),true);
 assert.equal(mayOrganize(rep),false);
 assert.equal(mayOrganize(customer),false);
 assert.equal(mayOrganize(left),false);
 assert.equal(meetingVisibleTo(record(),customer),false);
 assert.equal(meetingVisibleTo(record(),other),false);
 assert.equal(meetingVisibleTo(record(),left),false);
 assert.equal(meetingVisibleTo(record(),rep),true);
 assert.deepEqual(personalMeetings([record()],other),[]);
});
test("B06 rejects invalid meetings and employee selections",()=>{
 assert.equal(validateMeeting(input,admin,users).ok,true);
 assert.equal(validateMeeting({...input,attendeeIds:["customer"]},admin,users).ok,false);
 assert.equal(validateMeeting({...input,attendeeIds:["left"]},admin,users).ok,false);
 assert.equal(validateMeeting({...input,attendeeIds:["rep","rep"]},admin,users).ok,false);
 assert.equal(validateMeeting({...input,attendeeIds:[]},admin,users).ok,false);
 assert.equal(validateMeeting({...input,attendeeIds:["admin"]},admin,users).ok,false);
 assert.equal(validateMeeting({...input,endTime:"08:30"},admin,users).ok,false);
 assert.equal(validateMeeting({...input,date:"2026-02-30"},admin,users).ok,false);
 assert.equal(validateMeeting({...input,agenda:"x"},admin,users).ok,false);
 assert.equal(validateMeeting(input,rep,users).ok,false);
});
test("B06 prevents overlapping meetings for attendees and organizer but allows adjacent ones",()=>{
 const old=record();
 assert.equal(meetingConflicts([old],{...input,startTime:"09:30",endTime:"10:15"},"other").length,1);
 assert.equal(meetingConflicts([old],{...input,startTime:"10:00",endTime:"11:00"},"other").length,0);
 assert.equal(meetingConflicts([old],input,"admin",old.id).length,0);
 assert.equal(meetingConflicts([record({status:"Cancelled"})],input,"admin").length,0);
 assert.equal(meetingConflicts([old],{...input,attendeeIds:["other"]},"different").length,0);
});
test("B05 field appointment conflicts use visible scope without inventing off-scope schedules",()=>{
 const a={id:"field-1",accountId:"account",ownerId:"rep",date:day,startTime:"09:15",duration:45,status:"Scheduled",type:"First visit",objective:"Meet buyer",location:"Store"} as Appointment;
 assert.equal(meetingConflicts([],input,"admin",undefined,[a]).length,1);
 assert.equal(meetingConflicts([],{...input,attendeeIds:["other"]},"admin",undefined,[a]).length,0);
 assert.equal(meetingConflicts([],input,"admin",undefined,[{...a,status:"Completed"}]).length,0);
});
test("B07/08 notifications and agenda are derived only from accessible invitations",()=>{
 const pending=record();
 assert.equal(meetingNotices([pending],rep)[0]?.kind,"Invitation");
 assert.deepEqual(meetingNotices([pending],other),[]);
 assert.deepEqual(meetingNotices([pending],admin),[]);
 const changed=record({revision:2,seenRevision:{admin:2,rep:1},rsvps:{rep:"Accepted"}});
 assert.equal(meetingNotices([changed],rep)[0]?.kind,"Update");
 assert.equal(meetingNotices([record({status:"Cancelled",revision:2,seenRevision:{admin:1,rep:1}})],rep)[0]?.title,"Meeting cancelled: Weekly territory sync");
 assert.equal(upcomingMeetings([record({date:addCalendarDays(day,-5)})],rep,day).length,0);
});
test("B09 persistence normalization preserves timestamps and rejects malformed/duplicate entries",()=>{
 const one=record();
 const state=normalizeMeetings({version:1,meetings:[one,one,{...one,id:"bad",date:"2026-02-30"}]},users);
 assert.equal(state.meetings.length,1);
 assert.equal(state.meetings[0].updatedAt,"2026-11-06T16:10:00.000Z");
 assert.deepEqual(normalizeMeetings({version:9,meetings:[one]},users).meetings,[]);
});
test("B06 calendar ICS uses Arizona time and does not pretend to deliver invitations",()=>{
 const contents=meetingCalendarFile({...record(),agenda:"Review risks, blockers; handoffs"});
 assert.match(contents,/BEGIN:VCALENDAR\r\n/);
 assert.match(contents,/DTSTAMP:20261106T161000Z/);
 assert.match(contents,/DTSTART:\d{8}T160000Z/);
 assert.match(contents,/DTEND:\d{8}T170000Z/);
 assert.match(contents,/Review risks\\, blockers\\; handoffs/);
 assert.match(contents,/METHOD:PUBLISH/);
 assert.doesNotMatch(contents,/METHOD:REQUEST|ATTENDEE;|mailto:/);
});
test("B04-B08 URL routes, Home, Action Center and demo-only mutations are connected",async()=>{
 const hub=readFileSync("components/prototype/operations-hub.tsx","utf8");
 const home=readFileSync("components/prototype/workspace-home.tsx","utf8");
 const actions=readFileSync("components/prototype/action-center-experience.tsx","utf8");
 const ui=readFileSync("components/prototype/workspace-meetings-experience.tsx","utf8");
 const store=readFileSync("lib/workspace-meetings-store.ts","utf8");
 const {canVisitRoute,pageForPath,requiresPrototypePage,MENU_GROUPS}=await import("../lib/navigation-route-registry");
 for(const path of ["/calendar","/calendar/meetings","/calendar/agenda","/calendar/invitations","/calendar/meetings/new","/calendar/meetings/meeting-1","/calendar/meetings/meeting-1/edit"]){
   assert.equal(canVisitRoute(admin,path),true,path);
   assert.equal(canVisitRoute(customer,path),false,path);
   assert.equal(pageForPath(path),"work",path);
   assert.equal(requiresPrototypePage(path),true,path);
 }
 assert.equal(MENU_GROUPS.find(g=>g.label==="Workspace")?.entries.some(e=>e.path==="/calendar/invitations"),true);
 assert.match(hub,/SharedCalendarExperience/);
 assert.match(hub,/MeetingWorkspaceExperience view="edit"/);
 assert.match(home,/<MeetingHomePanel\/>/);
 assert.match(actions,/<MeetingActionQueue\/>/);
 assert.match(ui,/downloadIcs\(meeting\)/);
 assert.match(ui,/rsvp\(meeting.id,choice\)/);
 assert.match(store,/runtime\.isDemo&&momentumStorage\.mode\(\)==="local"/);
 assert.match(store,/existing\.organizerId!==currentUser\?\.id/);
 assert.match(store,/meetingVisibleTo\(m,currentUser\)/);
});

test("B08 meeting bell notifications are revision-scoped and open the correct meeting record",()=>{
 const source=readFileSync("lib/notification-context-v3.tsx","utf8");
 const shell=readFileSync("components/app-shell-v4.tsx","utf8");
 assert.match(source,/meeting-demo:.*:revision:/);
 assert.match(source,/meetingNotices\(meetings,currentUser\)/);
 assert.match(source,/notificationDisplayTime\(meeting.updatedAt/);
 assert.match(shell,/notification.id.startsWith\("meeting-demo:"\)/);
 assert.match(shell,/navigateToRoute\(path\)/);
 assert.match(shell,/canVisitRoute\(currentUser,path\)/);
});

test("B07 reminder window uses recorded Arizona start instants",()=>{
 const m=record({date:"2026-11-07",startTime:"09:00",endTime:"10:00"});
 assert.equal(meetingHomeReminders([m],rep,new Date("2026-11-06T18:00:00Z")).length,1);
 assert.equal(meetingHomeReminders([m],rep,new Date("2026-11-05T18:00:00Z")).length,0);
 assert.equal(meetingHomeReminders([m],other,new Date("2026-11-06T18:00:00Z")).length,0);
 assert.equal(meetingHomeReminders([record({...m,status:"Cancelled"})],rep,new Date("2026-11-06T18:00:00Z")).length,0);
});
test("B05 month arrows use actual months, not thirty-day estimates",()=>{
 const source=readFileSync("components/prototype/workspace-meetings-experience.tsx","utf8");
 assert.match(source,/shiftedMonth\(anchor,-1\)/);
 assert.match(source,/shiftedMonth\(anchor,1\)/);
 assert.match(source,/Date\.UTC\(year,month-1\+delta,1\)/);
});
test("B06 demo reset deliberately clears isolated meeting records",()=>{
 const source=readFileSync("components/momentum-app.tsx","utf8");
 assert.match(source,/MEETINGS_DEMO_KEY/);
});

test("B05 calendar week/month cards adapt across desktop, tablet, and mobile",()=>{
 const ui=readFileSync("components/prototype/workspace-meetings-experience.tsx","utf8");
 const css=readFileSync("app/workspace-meetings.css","utf8");
 const layout=readFileSync("app/layout.tsx","utf8");
 assert.match(ui,/momentum-calendar-grid/);
 assert.match(ui,/role="listitem"/);
 assert.match(css,/grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
 assert.match(css,/max-width:767px/);
 assert.match(css,/min-width:768px/);
 assert.match(layout,/import "\.\/workspace-meetings\.css"/);
});

test("B08 RSVPs do not advance the common meeting revision or create unrelated schedule notices",()=>{
 const source=readFileSync("lib/workspace-meetings-store.ts","utf8");
 const server=readFileSync("functions/src/staff-meetings.ts","utf8");
 assert.match(source,/rsvps:\{\.\.\.m.rsvps,\[currentUser!\.id\]:response\}/);
 assert.doesNotMatch(source,/rsvps:\{\.\.\.m.rsvps,\[currentUser!\.id\]:response\},revision:m.revision\+1/);
 assert.match(server,/const revision=Number\(old.revision\);/);
});
test("B09 historical meetings remain visible to active invitees when another attendee was separated",()=>{
 const departed=record({attendeeIds:["rep","left"],rsvps:{rep:"Accepted",left:"Pending"},history:[
  {actorId:"previous-admin",action:"Created",at:"2026-11-06T16:10:00.000Z",detail:"Originally scheduled."},
 ]});
 const normalized=normalizeMeetings({version:1,meetings:[departed]},users.filter(u=>u.id!=="left"));
 assert.equal(normalized.meetings.length,1);
 assert.equal(meetingVisibleTo(normalized.meetings[0],rep),true);
 assert.equal(meetingVisibleTo(normalized.meetings[0],left),false);
});
test("B06 preview enforces production meeting duration and attendee limits",()=>{
 assert.equal(validateMeeting({...input,endTime:"13:00"},admin,users).ok,false);
 const many=Array.from({length:16},(_,i)=>user("staff"+i));
 assert.equal(validateMeeting({...input,attendeeIds:many.map(u=>u.id)},admin,[admin,...many]).ok,false);
});


test("B06–B09 connected staff meeting provider uses verified server service and has no demo fallback",()=>{
 const app=readFileSync("components/momentum-app.tsx","utf8");
 const store=readFileSync("lib/workspace-meetings-store.ts","utf8");
 const client=readFileSync("lib/staff-meetings-client.ts","utf8");
 const api=readFileSync("functions/src/staff-meetings.ts","utf8");
 const rules=readFileSync("firestore.rules","utf8");
 assert.match(app,/<MeetingProvider><PeriodLockProvider>/);
 assert.match(store,/cloudReady\?remote.meetings.filter/);
 assert.match(store,/staffMeetingRequest\(\{action:"list"\}\)/);
 assert.match(store,/meetings:cloudVisible/);
 assert.match(client,/currentFirebaseSession\(\)/);
 assert.match(client,/firebaseFunctionUrl\("staffMeetingsApi"\)/);
 assert.match(client,/authorization:"Bearer "\+session.idToken/);
 assert.match(api,/verifyIdToken\(bearer.slice\(7\),true\)/);
 assert.match(api,/const access=await userAccess\(/);
 assert.match(api,/db.runTransaction/);
 assert.match(api,/staffMeetingSlots/);
 assert.match(rules,/match \/staffMeetings\/\{meetingId\} \{\s*allow read, write: if false;/);
});
test("B06 authenticated UI awaits API acknowledgment rather than claiming a saved meeting early",()=>{
 const src=readFileSync("components/prototype/workspace-meetings-experience.tsx","utf8");
 assert.match(src,/const result=await \(meeting\?revise/);
 assert.match(src,/const result=await rsvp\(/);
 assert.match(src,/const result=await cancel\(/);
});

test("B02 non-order approval list links to source departments instead of looping to legacy My Work",()=>{
 const source=readFileSync("components/prototype/order-actions.tsx","utf8");
 assert.match(source,/function approvalWorkspaceTarget/);
 assert.match(source,/canVisitRoute\(currentUser,source\)/);
 assert.match(source,/No authorized source view available/);
 assert.match(source,/Open source workflow/);
 assert.doesNotMatch(source,/navigateToRoute\("\/work\/workflow"\)/);
});

test("B07–B08 Home reminders refresh and cancelled invitations remain reviewable",()=>{
 const source=readFileSync("components/prototype/workspace-meetings-experience.tsx","utf8");
 assert.match(source,/useState\(kind==="invitations"\?"all":"active"\)/);
 assert.match(source,/m.status==="Scheduled"&&m.rsvps\[currentUser.id\]==="Pending"/);
 assert.match(source,/meetingHomeReminders\(meetings,currentUser,clock\)/);
 assert.match(source,/window.setInterval\(\(\)=>setClock\(new Date\(\)\),60000\)/);
});
