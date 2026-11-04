/* eslint-disable max-len, comma-spacing, key-spacing, object-curly-spacing, space-before-blocks, keyword-spacing, curly, brace-style, semi-spacing, arrow-parens, one-var, indent, operator-linebreak */
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {onRequest} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";

type Data = Record<string, unknown>;
type Notice = {entryId: string; clockOutAt: string; lastActivityAt: string; thresholdAt: string; acknowledgedAt?: string};
const HOUR_MS = 60 * 60_000;
const zone = "America/Phoenix";
const obj = (value: unknown): value is Data => Boolean(value && typeof value === "object" && !Array.isArray(value));
const txt = (value: unknown): string => typeof value === "string" ? value : "";
const rows = (value: Data | undefined): Data[] => Array.isArray(value?.items) ? value.items.filter(obj) : [];
const stamp = (value: unknown): number => {const n = Date.parse(txt(value)); return Number.isFinite(n) ? n : 0;};
const parts = (instant: Date) => {
  const pieces = new Intl.DateTimeFormat("en-US", {timeZone: zone, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hourCycle:"h23"}).formatToParts(instant);
  const get = (type: string) => pieces.find((p) => p.type === type)?.value || "";
  return {date: get("year")+"-"+get("month")+"-"+get("day"), time: get("hour")+":"+get("minute")};
};
const weekStart = (day: string) => {
  const date = new Date(day+"T12:00:00-07:00");
  const weekday = (date.getUTCDay()+6)%7;
  date.setUTCDate(date.getUTCDate()-weekday);
  return parts(date).date;
};
const weekEnd = (day: string) => {
  const date = new Date(day+"T12:00:00-07:00");
  date.setUTCDate(date.getUTCDate()+6);
  return parts(date).date;
};
const asNotice = (raw: unknown): Notice | undefined => obj(raw)&&txt(raw.entryId)&&txt(raw.clockOutAt)&&txt(raw.lastActivityAt)&&txt(raw.thresholdAt)
  ? raw as Notice : undefined;
const doc = (uid: string, kind: "timeEntries"|"timecards"|"status") =>
  kind === "status" ? "userDomains/"+uid+"/salesActivity/status" : "userDomains/"+uid+"/workspace/"+kind;
const accessAllowed = (record: Data | undefined) =>
  record?.role === "Sales Representative" && record?.accountState === "Active";
const freshBusinessEvent = (uid: string, afterMs: number, nowMs: number, ...sets: Data[][]) => {
  let latest = afterMs;
  for (const list of sets) {
    for (const event of list) {
      if (event.userId !== uid) continue;
      const at = stamp(event.occurredAt ?? event.at);
      if (at >= afterMs && at <= nowMs && at > latest) latest = at;
    }
  }
  return latest;
};
const respond = (response: {status:(code:number)=>{set:(headers:Data)=>{json:(body:unknown)=>unknown}}}, status:number, body:unknown) =>
  response.status(status).set({"Cache-Control":"no-store","Content-Type":"application/json; charset=utf-8"}).json(body);

/**
 * Server-side enforcement. No browser timer is required. Only persisted CRM
 * interactions, workspace work events, and fresh authenticated sign-ins count.
 * Opening pages, GPS pings, token refreshes, and device wakeups do not count.
 */
export const salesCRMInactivityClockOut = onSchedule({
  schedule:"every 1 minutes", timeZone:zone, region:"us-central1", retryCount:1, maxInstances:1,
}, async () => {
  const db = getFirestore();
  const now = new Date();
  const nowMs = now.getTime();
  const userDocs = await db.collection("userDomains").listDocuments();
  for (const userDoc of userDocs) {
    const uid = userDoc.id;
    const [access, punches] = await Promise.all([
      db.doc("userAccess/"+uid).get(),
      db.doc(doc(uid,"timeEntries")).get(),
    ]);
    if (!accessAllowed(access.data()) || !rows(punches.data()).some((item)=>!txt(item.clockOut))) continue;
    const timeRef = db.doc(doc(uid,"timeEntries"));
    const statusRef = db.doc(doc(uid,"status"));
    const crmRef = db.doc("domains/crm/fields/interactions");
    const activitiesRef = db.doc("domains/workspace/fields/activities");
    try {
      await db.runTransaction(async (tx) => {
        const [time, state, crm, activities] = await Promise.all([
          tx.get(timeRef), tx.get(statusRef), tx.get(crmRef), tx.get(activitiesRef),
        ]);
        const existing = rows(time.data());
        const active = existing.filter((entry)=>!txt(entry.clockOut))
          .sort((a,b)=>stamp(b.clockInAt)-stamp(a.clockInAt))[0];
        if (!active || (txt(active.mealStart)&&!txt(active.mealEnd))) return;
        const started = stamp(active.clockInAt);
        if (!started || started>nowMs) return; // legacy punches need human correction
        const sessionState = state.data() || {};
        const lastSignIn = stamp(sessionState.lastSignInAt);
        const latest = freshBusinessEvent(uid, Math.max(started,lastSignIn), nowMs,
          rows(crm.data()), rows(activities.data()));
        if (nowMs-latest < HOUR_MS) return;
        const clockOutAt = now.toISOString(); // actual server action, never a fabricated employee punch
        const changed = existing.map((entry)=>entry.id!==active.id ? entry : {
          ...entry, clockOut:parts(now).time, clockOutAt,
          note:[txt(entry.note),"System clock-out after 60 minutes without saved CRM activity or an authenticated sign-in. Employee may report work not yet recorded."].filter(Boolean).join(" | "),
        });
        const notice:Notice={entryId:txt(active.id), clockOutAt,
          lastActivityAt:new Date(latest).toISOString(), thresholdAt:new Date(latest+HOUR_MS).toISOString()};
        tx.set(timeRef,{items:changed});
        tx.set(statusRef,{...sessionState,notice});
        tx.create(db.doc("salesInactivityAudit/"+uid+"_"+txt(active.id).replace(/[^A-Za-z0-9_-]/g,"_")),{
          userId:uid, timeEntryId:txt(active.id), clockOutAt, thresholdAt:notice.thresholdAt,
          lastActivityAt:notice.lastActivityAt, trigger:"60m-no-CRM", source:"server-schedule",
        });
      });
    } catch (error) {
      // A racing clock action may close the entry first. Retry next schedule safely.
      console.error("salesCRMInactivityClockOut failed",uid,error);
    }
  }
});

/**
 * Authenticated employee endpoint for fresh sign-in, status, acknowledgment,
 * and an explicit new clock-in after a system clock-out.
 * Only a real recent Firebase authentication event resets the sign-in clock.
 */
export const salesCRMClockStatus = onRequest({cors:true,region:"us-central1"},async (request,response)=>{
  if(request.method!=="POST"){respond(response,405,{ok:false,message:"POST required."});return;}
  const auth = txt(request.headers.authorization);
  if(!auth.startsWith("Bearer ")){respond(response,401,{ok:false,message:"Sign in required."});return;}
  let decoded;
  try{decoded=await getAuth().verifyIdToken(auth.slice(7).trim(),true);}
  catch{respond(response,401,{ok:false,message:"Session expired."});return;}
  const uid=decoded.uid;
  const db=getFirestore();
  const access = await db.doc("userAccess/"+uid).get();
  if(!accessAllowed(access.data())){respond(response,403,{ok:false,message:"Not available for this account."});return;}
  const action=txt(request.body?.action);
  if(!["read","signIn","acknowledge","clockIn"].includes(action)){
    respond(response,400,{ok:false,message:"Unsupported action."});return;
  }
  const stateRef=db.doc(doc(uid,"status"));
  const timeRef=db.doc(doc(uid,"timeEntries"));
  const cardsRef=db.doc(doc(uid,"timecards"));
  try{
    const result=await db.runTransaction(async(tx)=>{
      const refs=action==="clockIn"?[stateRef,timeRef,cardsRef]:[stateRef];
      const reads=await Promise.all(refs.map(ref=>tx.get(ref)));
      const state=reads[0].data()||{};
      const notice=asNotice(state.notice);
      if(action==="signIn"){
        const authAt=typeof decoded.auth_time==="number"?decoded.auth_time*1000:0;
        const now=Date.now();
        if(authAt && Math.abs(now-authAt)<=5*60_000 && authAt!==Number(state.lastAuthTimeMs)){
          tx.set(stateRef,{...state,lastSignInAt:new Date(now).toISOString(),lastAuthTimeMs:authAt});
        }
        return {ok:true,pending:Boolean(notice&&!notice.acknowledgedAt),notice:notice??null};
      }
      if(action==="acknowledge"&&notice&&!notice.acknowledgedAt){
        tx.set(stateRef,{...state,notice:{...notice,acknowledgedAt:new Date().toISOString()}});
        return {ok:true,pending:false,notice:{...notice,acknowledgedAt:new Date().toISOString()}};
      }
      if(action==="clockIn"){
        const entries=rows(reads[1].data());
        if(entries.some(entry=>!txt(entry.clockOut)))return{ok:false,message:"A shift is already open.",pending:false};
        const now=new Date(), local=parts(now);
        const entry={id:"te-auto-resume-"+uid+"-"+Date.now(),userId:uid,date:local.date,
          clockIn:local.time,clockInAt:now.toISOString(),breakMinutes:0,source:"Web clock"};
        const cards=rows(reads[2].data());
        const start=weekStart(local.date),end=weekEnd(start);
        const hasCard=cards.some(card=>card.userId===uid&&card.weekStart===start&&card.weekEnd===end);
        tx.set(timeRef,{items:[entry,...entries]});
        if(!hasCard)tx.set(cardsRef,{items:[{id:"tc-"+uid+"-"+start,userId:uid,weekStart:start,weekEnd:end,status:"Open",attested:false},...cards]});
        tx.set(stateRef,{...state,notice:notice?{...notice,acknowledgedAt:now.toISOString()}:undefined});
        return{ok:true,pending:false,clockInAt:entry.clockInAt};
      }
      return {ok:true,pending:Boolean(notice&&!notice.acknowledgedAt),notice:notice??null};
    });
    respond(response,result.ok?200:409,result);
  }catch(error){
    console.error("salesCRMClockStatus failed",uid,action,error);
    respond(response,500,{ok:false,message:"Clock status unavailable. Please try again."});
  }
});
