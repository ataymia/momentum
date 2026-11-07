"use client";

import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {buildActionNotices} from "./action-center-policy-v2";
import {useAccounting} from "./accounting-context";
import {useAudit} from "./audit-context";
import {useCommerce} from "./commerce-context";
import {useDelivery} from "./delivery-context";
import {useFinance} from "./finance-context";
import {listFirestoreCollection} from "./firebase-firestore-rest";
import {useFirebaseSessionOptional} from "./firebase-session-context";
import {useHcm} from "./hcm-context";
import {useInventoryLedger} from "./inventory-ledger-context";
import {useMarketing} from "./marketing-context";
import type {NotificationDelivery} from "./notification-engine";
import {notificationBellEnabled} from "./notification-policy-registry";
import {
  adminSystemNotificationIntents,
  commerceNotificationIntents,
  deliveryMilestoneIntents,
  expenseStatusIntents,
  marketingStatusIntents,
  orderMilestoneIntents,
  pricingNotificationIntents,
  prospectOwnershipReleasedIntents,
  sundayWeeklyReminderIntent,
  type NotificationIntent,
} from "./notification-policy-v2";
import {usePerformance} from "./performance-context";
import {useWorkspace} from "./workspace-context";
import {useMeetingWorkspace} from "./workspace-meetings-store";
import {meetingNotices} from "./workspace-meetings";
import {mergeFirstSeenTimes,notificationDisplayTime,parseFirstSeenTimes} from "./notification-display-time";

const READ_KEY="momentum-derived-notification-read-v1";
const FIRST_SEEN_KEY="momentum-notification-first-seen-v1";

const readIds=(userId:string)=>{
  if(typeof window==="undefined")return new Set<string>();
  try{
    const parsed=JSON.parse(
      window.localStorage.getItem(`${READ_KEY}:${userId}`)??"[]",
    );
    return new Set(
      Array.isArray(parsed)?
        parsed.filter((item):item is string=>typeof item==="string"):
        [],
    );
  }catch{
    return new Set<string>();
  }
};

const persist=(userId:string,ids:Set<string>)=>{
  if(typeof window!=="undefined"){
    window.localStorage.setItem(
      `${READ_KEY}:${userId}`,
      JSON.stringify([...ids].slice(-1000)),
    );
  }
};

const readFirstSeen=(userId:string):Record<string,string>=>{
  if(typeof window==="undefined")return {};
  try{return parseFirstSeenTimes(JSON.parse(window.localStorage.getItem(FIRST_SEEN_KEY+":"+userId)??"{}"));}
  catch{return {};}
};
type NotificationContextValue={
  currentUserItems:NotificationDelivery[];
  unreadCount:number;
  markRead:(id:string)=>void;
  markAllRead:()=>void;
};

const NotificationContext=createContext<NotificationContextValue|null>(null);

function NotificationBridge({
  children,
  userId,
}:{children:ReactNode;userId:string}){
  const {audit}=useAudit();
  const {data,scope,currentUser}=useWorkspace();
  const {meetings}=useMeetingWorkspace();
  const firebase=useFirebaseSessionOptional();
  const {hcm}=useHcm();
  const {commerce}=useCommerce();
  const {state:delivery}=useDelivery();
  const {performance}=usePerformance();
  const {finance}=useFinance();
  const {state:marketing}=useMarketing();
  const {accounting,events}=useAccounting();
  const {ledger}=useInventoryLedger();
  const [clock,setClock]=useState(()=>new Date());
  const [systemEvents,setSystemEvents]=useState<unknown[]>([]);
  const [readDerived,setReadDerived]=useState<Set<string>>(
    ()=>readIds(userId),
  );
  const [firstSeen,setFirstSeen]=useState<Record<string,string>>(
    ()=>readFirstSeen(userId),
  );

  useEffect(()=>{
    const timer=window.setInterval(()=>setClock(new Date()),60_000);
    return()=>window.clearInterval(timer);
  },[]);

  useEffect(()=>persist(userId,readDerived),[userId,readDerived]);
  useEffect(()=>{
    if(typeof window!=="undefined")window.localStorage.setItem(FIRST_SEEN_KEY+":"+userId,JSON.stringify(firstSeen));
  },[userId,firstSeen]);
  // A second tab must not resurrect notifications that another tab already cleared.
  useEffect(()=>{
    const onStorage=(event:StorageEvent)=>{
      if(event.key===READ_KEY+":"+userId)setReadDerived(readIds(userId));
      if(event.key===FIRST_SEEN_KEY+":"+userId)setFirstSeen(readFirstSeen(userId));
    };
    window.addEventListener("storage",onStorage);
    return()=>window.removeEventListener("storage",onStorage);
  },[userId]);

  useEffect(()=>{
    if(!firebase||currentUser?.role!=="Administrator")return;
    let cancelled=false;
    void listFirestoreCollection<Record<string,unknown>>(
      "notificationAdminEvents",
      200,
    )
      .then((rows)=>{
        if(!cancelled)setSystemEvents(rows);
      })
      .catch(()=>{});
    return()=>{cancelled=true;};
  },[firebase,currentUser?.role,clock]);

  const currentUserItems=useMemo<NotificationDelivery[]>(()=>{
    if(!currentUser)return[];
    const evaluatedAt=clock.toISOString();
    const items:NotificationDelivery[]=[];

    const addIntent=(intent:NotificationIntent)=>{
      if(!notificationBellEnabled(intent.policyId))return;
      const id=`derived-intent:${intent.id}`;
      if(intent.recipientUserId!==currentUser.id)return;
      const stamp=notificationDisplayTime(intent.occurredAt,firstSeen[id],evaluatedAt);
      items.push({
        id,
        sourceEventId:intent.id,
        recipientUserId:currentUser.id,
        channel:"In app",
        title:intent.title,
        detail:intent.detail,
        tone:intent.importance==="critical"||intent.importance==="action"?
          "warning":
          intent.importance==="status"?"success":"info",
        createdAt:stamp.time,
        timestampSource:stamp.source,
        status:readDerived.has(id)?"Read":"Unread",
        targetPage:intent.targetPage,
        targetRecordId:intent.targetRecordId,
        actionLabel:intent.targetPage?"Open":"Review",
      });
    };

    if(currentUser.role!=="Customer"){
      for(const action of buildActionNotices({
        data,
        scope,
        currentUser,
        hcm,
        performance,
        finance,
        marketing,
        accounting,
        accountingEvents:events,
        ledger,
        delivery,
      }).filter((item)=>notificationBellEnabled(item.policyId))){
        const id=`derived-action:${action.id}`;
        const stamp=notificationDisplayTime(action.occurredAt,firstSeen[id],evaluatedAt);
        items.push({
          id,
          sourceEventId:`action:${action.id}`,
          recipientUserId:currentUser.id,
          channel:"In app",
          title:action.title,
          detail:action.detail,
          tone:action.urgency==="Blocking"||action.urgency==="Due"?
            "warning":
            "info",
          createdAt:stamp.time,
          timestampSource:stamp.source,
          status:readDerived.has(id)?"Read":"Unread",
          targetPage:action.page,
          targetRecordId:action.focus,
          actionLabel:action.page?"Open":"Review",
        });
      }
    }

    // Local-demo meeting notices have per-record revisions. An acknowledged old
    // invitation never suppresses a subsequent change or cancellation.
    for(const meetingNotice of meetingNotices(meetings,currentUser)){
      const meeting=meetings.find(item=>item.id===meetingNotice.meetingId);
      if(!meeting)continue;
      const id="meeting-demo:"+meeting.id+":revision:"+meeting.revision;
      const stamp=notificationDisplayTime(meeting.updatedAt,firstSeen[id],evaluatedAt);
      items.push({
        id,sourceEventId:"meeting:"+meeting.id+":"+meeting.revision,recipientUserId:currentUser.id,
        channel:"In app",title:meetingNotice.title,
        detail:meeting.date+" · "+meeting.startTime+" Arizona · "+meeting.location,
        tone:meeting.status==="Cancelled"?"warning":"info",createdAt:stamp.time,
        timestampSource:stamp.source,status:readDerived.has(id)?"Read":"Unread",
        targetPage:"work",targetRecordId:meeting.id,actionLabel:"Open meeting",
      });
    }

    for(const intent of orderMilestoneIntents(data,currentUser))addIntent(intent);
    for(const intent of deliveryMilestoneIntents(
      data,
      delivery,
      currentUser,
    ))addIntent(intent);
    for(const intent of commerceNotificationIntents(
      data,
      commerce,
      currentUser,
    ))addIntent(intent);
    for(const intent of pricingNotificationIntents(data,currentUser)){
      addIntent(intent);
    }
    for(const intent of adminSystemNotificationIntents(
      currentUser.role==="Administrator"?systemEvents:[],
      currentUser,
    ))addIntent(intent);
    for(const intent of prospectOwnershipReleasedIntents(
      data,
      audit.events,
      currentUser,
    ))addIntent(intent);
    for(const intent of expenseStatusIntents(finance,currentUser)){
      addIntent(intent);
    }
    for(const intent of marketingStatusIntents(
      marketing,
      currentUser,
    ).filter((item)=>item.policyId==="marketing.request_approved")){
      addIntent(intent);
    }
    const weeklyReminder=sundayWeeklyReminderIntent(
      performance,
      currentUser,
      clock,
    );
    if(weeklyReminder)addIntent(weeklyReminder);

    const seen=new Set<string>();
    return items.filter(item=>!seen.has(item.id)&&Boolean(seen.add(item.id))).sort((left,right)=>
      right.createdAt.localeCompare(left.createdAt),
    );
  },[
    currentUser,
    data,
    scope,
    meetings,
    hcm,
    performance,
    finance,
    marketing,
    accounting,
    events,
    ledger,
    delivery,
    commerce,
    audit.events,
    systemEvents,
    readDerived,
    firstSeen,
    clock,
  ]);

  useEffect(()=>{
    const missing=currentUserItems.filter(item=>item.timestampSource==="first-seen"&&!firstSeen[item.id]).map(item=>item.id);
    if(!missing.length)return;
    const handle=window.setTimeout(()=>setFirstSeen(current=>mergeFirstSeenTimes(current,missing,new Date().toISOString())),0);
    return()=>window.clearTimeout(handle);
  },[currentUserItems,firstSeen]);
  const unreadCount=currentUserItems.filter(
    (item)=>item.status==="Unread",
  ).length;

  const markRead=(id:string)=>{
    setReadDerived((current)=>{
      const next=new Set(current);
      next.add(id);
      return next;
    });
  };

  const markAllRead=()=>{
    setReadDerived((current)=>{
      const next=new Set(current);
      for(const item of currentUserItems)next.add(item.id);
      return next;
    });
  };

  return <NotificationContext.Provider value={{
    currentUserItems,
    unreadCount,
    markRead,
    markAllRead,
  }}>
    {children}
  </NotificationContext.Provider>;
}

export function NotificationProvider({children}:{children:ReactNode}){
  const {currentUser}=useWorkspace();
  const userId=currentUser?.id??"signed-out";
  return <NotificationBridge key={userId} userId={userId}>
    {children}
  </NotificationBridge>;
}

export function useNotifications(){
  const value=useContext(NotificationContext);
  if(!value){
    throw new Error(
      "useNotifications must be used inside NotificationProvider",
    );
  }
  return value;
}
