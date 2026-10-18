import {createHash} from "node:crypto";

type Row=Record<string,unknown>;

export type WeeklyReminderRecipient={
  uid:string;
  email:string;
  name:string;
  role:"Sales Representative"|"Sales Manager";
};

const row=(value:unknown):value is Row=>
  Boolean(value&&typeof value==="object"&&!Array.isArray(value));

export const validEmail=(value:string)=>
  value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)&&
  !/[\r\n\x00-\x1f\x7f]/.test(value);

export function arizonaDateKey(now=new Date()):string{
  const parts=new Intl.DateTimeFormat("en-US",{
    timeZone:"America/Phoenix",
    year:"numeric",
    month:"2-digit",
    day:"2-digit",
  }).formatToParts(now);
  const value=(type:string)=>parts.find((part)=>part.type===type)?.value??"";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function mondayForDateKey(dateKey:string):string{
  const noon=new Date(`${dateKey}T12:00:00Z`);
  if(Number.isNaN(noon.getTime()))return "";
  const offset=(noon.getUTCDay()+6)%7;
  noon.setUTCDate(noon.getUTCDate()-offset);
  return noon.toISOString().slice(0,10);
}

export function weeklyReportSubmitted(
  performanceReports:unknown,
  uid:string,
  weekStart:string,
):boolean{
  if(!row(performanceReports)||!Array.isArray(performanceReports.items)){
    return false;
  }
  return performanceReports.items.some((value)=>{
    if(!row(value))return false;
    return value.type==="Weekly progress"&&
      value.userId===uid&&
      value.weekStart===weekStart&&
      ["Submitted","Reviewed"].includes(String(value.status));
  });
}

export function weeklyReminderMail(
  recipient:WeeklyReminderRecipient,
  weekStart:string,
  createdAt:string,
){
  const digest=createHash("sha256").update(JSON.stringify([
    "weekly.reminder",
    recipient.uid,
    weekStart,
    1,
  ])).digest("hex");
  const first=recipient.name.trim().split(/\s+/)[0]||"there";
  const weekEnd=new Date(`${weekStart}T12:00:00Z`);
  weekEnd.setUTCDate(weekEnd.getUTCDate()+6);
  const end=weekEnd.toISOString().slice(0,10);
  const eventId=`weekly-sunday-reminder:${recipient.uid}:${weekStart}`;
  return {
    id:`weekly-reminder-${digest}`,
    kind:"weekly_summary_reminder",
    sourcePath:`userDomains/${recipient.uid}/performance/reports`,
    sourceRecordId:`weekly-progress:${recipient.uid}:${weekStart}`,
    eventId,
    templateVersion:1,
    recipientUid:recipient.uid,
    to:recipient.email.trim().toLowerCase(),
    subject:"Momentum weekly report due tomorrow",
    text:[
      `Hello ${first},`,
      "",
      `Your Momentum weekly report for ${weekStart} through ${end} is due tomorrow.`,
      "Submit your weekly summary and next week's three goals before Monday closes.",
      "",
      "Open Momentum: https://momentumdis.web.app",
    ].join("\n"),
    idempotencyKey:`momentum-email-v1-${digest}`,
    createdAt,
  };
}
