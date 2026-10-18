import {getFirestore} from "firebase-admin/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {
  arizonaDateKey,
  mondayForDateKey,
  validEmail,
  weeklyReminderMail,
  weeklyReportSubmitted,
  type WeeklyReminderRecipient,
} from "./weekly-email-policy";

type Row=Record<string,unknown>;
const row=(value:unknown):value is Row=>
  Boolean(value&&typeof value==="object"&&!Array.isArray(value));
const text=(value:unknown)=>typeof value==="string"?value:"";

/**
 * Queue the approved Sunday reminder for active Sales Representatives and
 * Sales Managers who still owe their own weekly progress report.
 */
export const sundayWeeklyReportReminders=onSchedule({
  schedule:"0 19 * * 0",
  timeZone:"America/Phoenix",
  region:"us-central1",
  retryCount:2,
},async ()=>{
  if(process.env.RESEND_LIVE_EMAIL_ENABLED!=="true")return;

  const db=getFirestore();
  const accessSnapshot=await db.collection("userAccess").get();
  const accessRows=accessSnapshot.docs.map((doc)=>({
    uid:doc.id,
    data:doc.data(),
  }));
  const administrator=accessRows
    .filter(({data})=>
      data.role==="Administrator"&&data.accountState==="Active")
    .sort((left,right)=>left.uid.localeCompare(right.uid))[0];
  if(!administrator){
    throw new Error("No active Administrator is available for email approval.");
  }

  const recipients=accessRows.filter(({data})=>
    data.accountState==="Active"&&
    ["Sales Representative","Sales Manager"].includes(String(data.role))&&
    validEmail(text(data.email)));

  if(!recipients.length)return;

  const directoryRefs=recipients.map(({uid})=>
    db.doc(`employeeDirectory/${uid}`));
  const directorySnapshots=await db.getAll(...directoryRefs);
  const directoryByUid=new Map(directorySnapshots.map((snapshot)=>[
    snapshot.id,
    snapshot.data()??{},
  ]));

  const now=new Date();
  const createdAt=now.toISOString();
  const today=arizonaDateKey(now);
  const weekStart=mondayForDateKey(today);
  if(!weekStart)return;

  for(const {uid,data} of recipients){
    const performanceRef=db.doc(
      `userDomains/${uid}/performance/reports`,
    );
    const performance=await performanceRef.get();
    if(weeklyReportSubmitted(performance.data(),uid,weekStart))continue;

    const directory=directoryByUid.get(uid);
    const name=row(directory)?
      text(directory.name)||text(directory.firstName)||"Employee":
      "Employee";
    const recipient:WeeklyReminderRecipient={
      uid,
      email:text(data.email),
      name,
      role:data.role as WeeklyReminderRecipient["role"],
    };
    const mail=weeklyReminderMail(recipient,weekStart,createdAt);
    const outbox=db.doc(`notificationOutbox/${mail.id}`);

    await db.runTransaction(async (tx)=>{
      const existing=await tx.get(outbox);
      if(existing.exists)return;
      tx.create(outbox,{
        ...mail,
        approvedBy:administrator.uid,
        approvedAt:createdAt,
        status:"Approved",
      });
    });
  }
});
