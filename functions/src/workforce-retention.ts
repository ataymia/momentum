/* eslint-disable max-len, comma-spacing, space-before-blocks, indent, keyword-spacing, curly, key-spacing, brace-style, semi-spacing, one-var */
import {getFirestore} from "firebase-admin/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";

type Row=Record<string,unknown>;
const obj=(value:unknown):value is Row=>Boolean(value&&typeof value==="object"&&!Array.isArray(value));
const txt=(value:unknown)=>typeof value==="string"?value.trim():"";
const items=(value:Row|undefined):Row[]=>Array.isArray(value?.items)?value.items.filter(obj):[];
const zone="America/Phoenix";
const arizonaDay=(value:Date)=>{
  const pieces=new Intl.DateTimeFormat("en-US",{timeZone:zone,
    year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(value);
  const part=(name:string)=>pieces.find((item)=>item.type===name)?.value||"";
  return part("year")+"-"+part("month")+"-"+part("day");
};
const offsetDays=(day:string,days:number)=>{
  const date=new Date(day+"T12:00:00-07:00");
  date.setUTCDate(date.getUTCDate()+days);
  return arizonaDay(date);
};
const azMidnight=(day:string)=>new Date(day+"T00:00:00-07:00").toISOString();
const version=()=>new Date().toISOString()+"#retention";

export const autoClosedMidnightNote="Automatically closed at Arizona midnight. Actual departure time not verified; manager/payroll review required.";

/**
 * Close unverified punches from earlier Arizona dates without overwriting
 * the original punch instant or representing the closure as employee action.
 * @param {Row[]} rows Stored time punches.
 * @param {string} day Current Arizona date.
 * @return {{entries: Row[], closed: number}} Updated entries and closure count.
 */
export function closePriorDayOpenPunches(rows:Row[],day:string):{entries:Row[];closed:number}{
  let closed=0;
  const entries=rows.map((row)=>{
    if(txt(row.clockOut)||!/^20\d\d-\d\d-\d\d$/.test(txt(row.date))||
      txt(row.date)>=day)return row;
    const originalDay=txt(row.date);
    const clockOutAt=azMidnight(offsetDays(originalDay,1));
    if(txt(row.clockInAt)&&Date.parse(txt(row.clockInAt))>=Date.parse(clockOutAt))return row;
    closed++;
    return {...row,clockOut:"23:59",clockOutAt,
      note:[txt(row.note),autoClosedMidnightNote].filter(Boolean).join(" | ")};
  });
  return {entries,closed};
}

/**
 * Drop old GPS coordinates, preserving separate payroll records/geofences.
 * @param {Row[]} rows Location event/sample records.
 * @param {string} today Current Arizona date.
 * @return {Row[]} Location rows inside the ten-date window.
 */
export function retainedLocationItems(rows:Row[],today:string):Row[]{
  const start=offsetDays(today,-9);
  return rows.filter((row)=>{
    const at=txt(row.at);
    if(!at||!Number.isFinite(Date.parse(at)))return false;
    const key=arizonaDay(new Date(at));
    return key>=start&&key<=today;
  });
}

/** Daily server cleanup is authoritative even if employee browsers stay closed. */
export const workforceMidnightAndRouteRetention=onSchedule({
  schedule:"1 0 * * *",timeZone:zone,region:"us-central1",retryCount:2,
},async () => {
  const db=getFirestore();
  const today=arizonaDay(new Date());
  const users=await db.collection("userDomains").listDocuments();
  // Each employee's shared identity gets its own user-scoped time and route docs.
  for(const user of users){
    const uid=user.id;
    const timeRef=db.doc("userDomains/"+uid+"/workspace/timeEntries");
    const sampleRef=db.doc("userDomains/"+uid+"/fieldTracking/samples");
    const eventRef=db.doc("userDomains/"+uid+"/fieldTracking/appointmentEvents");
    const docs=[timeRef,sampleRef,eventRef];
    await db.runTransaction(async (tx)=>{
      const snapshots=await Promise.all(docs.map((ref)=>tx.get(ref)));
      const open=items(snapshots[0].data());
      const time=closePriorDayOpenPunches(open,today);
      const route=items(snapshots[1].data());
      const events=items(snapshots[2].data());
      const savedRoutes=retainedLocationItems(route,today);
      const savedEvents=retainedLocationItems(events,today);
      if(time.closed)tx.set(timeRef,{items:time.entries});
      if(savedRoutes.length!==route.length)tx.set(sampleRef,{items:savedRoutes});
      if(savedEvents.length!==events.length)tx.set(eventRef,{items:savedEvents});
      // Avoid claiming this was an employee punch. A separate server audit
      // carries only counts/IDs, not location coordinates.
      if(time.closed)tx.set(db.doc("workforceMidnightAudit/"+today+"_"+uid),{
        userId:uid,day:today,closedTimeEntryIds:time.entries.filter((row,index)=>
          !txt(open[index]?.clockOut)&&txt(row.clockOut)==="23:59"&&
          txt(row.note).includes(autoClosedMidnightNote))
          .map((row)=>txt(row.id)),
        recordedAt:new Date().toISOString(),source:"Scheduled rule",
      },{merge:true});
      if(time.closed||savedRoutes.length!==route.length||savedEvents.length!==events.length)
        tx.set(db.doc("platform/meta"),{versions:{
          ["userDomains_"+uid+"_workspace_timeEntries"]:version(),
          ["userDomains_"+uid+"_fieldTracking_samples"]:version(),
          ["userDomains_"+uid+"_fieldTracking_appointmentEvents"]:version(),
        }},{merge:true});
    });
  }
});
