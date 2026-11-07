/** Recorded field appointment collision helper. Does not claim access to external calendars. */
type CalendarMeeting={date:string;startTime:string;endTime:string;attendeeIds:readonly string[]};
type FieldRecord={date?:unknown;startTime?:unknown;duration?:unknown;ownerId?:unknown;status?:unknown};
const validDay=(value:unknown)=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value);
const validTime=(value:unknown)=>typeof value==="string"&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const instant=(date:string,time:string)=>Date.parse(date+"T"+time+":00-07:00");
export function staffMeetingFieldCollision(
 appointments:readonly unknown[],meeting:CalendarMeeting,organizerId:string,
):boolean{
 const people=new Set([organizerId,...meeting.attendeeIds]);
 const start=instant(meeting.date,meeting.startTime);
 const end=instant(meeting.date,meeting.endTime);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return false;
 return appointments.some(value=>{
  if(!value||typeof value!=="object"||Array.isArray(value))return false;
  const item=value as FieldRecord;
  if(typeof item.ownerId!=="string"||!people.has(item.ownerId)||!validDay(item.date)||!validTime(item.startTime))return false;
  if(item.status==="Completed"||item.status==="Needs follow-up")return false;
  const duration=typeof item.duration==="number"?item.duration:NaN;
  if(!Number.isFinite(duration)||duration<=0||duration>24*60)return false;
  const from=instant(item.date,item.startTime);
  return Number.isFinite(from)&&start<from+duration*60_000&&from<end;
 });
}
