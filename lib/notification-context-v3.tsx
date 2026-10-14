"use client";

import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import { buildActionNotices } from "./action-center-policy-v2";
import { useAccounting } from "./accounting-context";
import { useFinance } from "./finance-context";
import { useHcm } from "./hcm-context";
import { useInventoryLedger } from "./inventory-ledger-context";
import { useMarketing } from "./marketing-context";
import { NotificationProvider as LegacyNotificationProvider, useNotifications as useLegacyNotifications } from "./notification-context-v2";
import type { NotificationDelivery } from "./notification-engine";
import { expenseStatusIntents, orderMilestoneIntents, sundayWeeklyReminderIntent, shouldShowActionNotification } from "./notification-policy-v2";
import { usePerformance } from "./performance-context";
import { useWorkspace } from "./workspace-context";

const READ_KEY="momentum-derived-notification-read-v1";
const now=()=>new Date().toISOString();
const readIds=(userId:string)=>{if(typeof window==="undefined")return new Set<string>();try{const parsed=JSON.parse(window.localStorage.getItem(`${READ_KEY}:${userId}`)??"[]");return new Set(Array.isArray(parsed)?parsed.filter((item):item is string=>typeof item==="string"):[]);}catch{return new Set<string>();}};
const persist=(userId:string,ids:Set<string>)=>{if(typeof window!=="undefined")window.localStorage.setItem(`${READ_KEY}:${userId}`,JSON.stringify([...ids].slice(-1000)));};

type NotificationValue=ReturnType<typeof useLegacyNotifications>;
const UnifiedNotificationContext=createContext<NotificationValue|null>(null);

function UnifiedBridge({children,userId}:{children:ReactNode;userId:string}){
  const legacy=useLegacyNotifications();
  const {data,scope,currentUser}=useWorkspace();
  const {hcm}=useHcm();
  const {performance}=usePerformance();
  const {finance}=useFinance();
  const {state:marketing}=useMarketing();
  const {accounting,events}=useAccounting();
  const {ledger}=useInventoryLedger();
  const [clock,setClock]=useState(()=>new Date());
  useEffect(()=>{const timer=window.setInterval(()=>setClock(new Date()),60_000);return()=>window.clearInterval(timer);},[]);
  const [readDerived,setReadDerived]=useState<Set<string>>(()=>readIds(userId));

  useEffect(()=>persist(userId,readDerived),[userId,readDerived]);

  const derived=useMemo<NotificationDelivery[]>(()=>{
    if(!currentUser)return[];
    const createdAt=now();
    const items:NotificationDelivery[]=[];

    if(currentUser.role!=="Customer"){
      for(const action of buildActionNotices({data,scope,currentUser,hcm,performance,finance,marketing,accounting,accountingEvents:events,ledger}).filter(shouldShowActionNotification)){
        const id=`derived-action:${action.id}`;
        items.push({
          id,
          sourceEventId:`action:${action.id}`,
          recipientUserId:currentUser.id,
          channel:"In app",
          title:action.title,
          detail:action.detail,
          tone:action.urgency==="Blocking"||action.urgency==="Due"?"warning":"info",
          createdAt,
          status:readDerived.has(id)?"Read":"Unread",
          ...(readDerived.has(id)?{readAt:createdAt}:{}),
          targetPage:action.page,
          targetRecordId:action.focus,
          actionLabel:action.page?"Open":"Review",
        });
      }
    }

    for(const intent of orderMilestoneIntents(data,currentUser)){
      const id=`derived-intent:${intent.id}`;
      items.push({
        id,
        sourceEventId:intent.id,
        recipientUserId:currentUser.id,
        channel:"In app",
        title:intent.title,
        detail:intent.detail,
        tone:intent.importance==="critical"||intent.importance==="action"?"warning":intent.importance==="status"?"success":"info",
        createdAt,
        status:readDerived.has(id)?"Read":"Unread",
        ...(readDerived.has(id)?{readAt:createdAt}:{}),
        targetPage:intent.targetPage,
        targetRecordId:intent.targetRecordId,
        actionLabel:intent.targetPage?"Open":"Review",
      });
    }

    for(const intent of expenseStatusIntents(finance,currentUser)){
      const id=`derived-intent:${intent.id}`;
      items.push({
        id,
        sourceEventId:intent.id,
        recipientUserId:currentUser.id,
        channel:"In app",
        title:intent.title,
        detail:intent.detail,
        tone:"success",
        createdAt,
        status:readDerived.has(id)?"Read":"Unread",
        ...(readDerived.has(id)?{readAt:createdAt}:{}),
        targetPage:intent.targetPage,
        targetRecordId:intent.targetRecordId,
        actionLabel:"Open expense",
      });
    }

    const reminder=sundayWeeklyReminderIntent(performance,currentUser,clock);
    if(reminder){
      const id=`derived-intent:${reminder.id}`;
      items.push({
        id,
        sourceEventId:reminder.id,
        recipientUserId:currentUser.id,
        channel:"In app",
        title:reminder.title,
        detail:reminder.detail,
        tone:"warning",
        createdAt,
        status:readDerived.has(id)?"Read":"Unread",
        ...(readDerived.has(id)?{readAt:createdAt}:{}),
        targetPage:reminder.targetPage,
        targetRecordId:reminder.targetRecordId,
        actionLabel:"Open weekly report",
      });
    }
    return items;
  },[currentUser,data,scope,hcm,performance,finance,marketing,accounting,events,ledger,readDerived,clock]);

  const legacyItems=useMemo(()=>legacy.currentUserItems.filter(item=>{
    if(!item.targetPage||!item.targetRecordId)return true;
    return !derived.some(other=>other.targetPage===item.targetPage&&other.targetRecordId===item.targetRecordId);
  }),[legacy.currentUserItems,derived]);
  const currentUserItems=useMemo(()=>[...derived,...legacyItems].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),[derived,legacyItems]);
  const unreadCount=currentUserItems.filter(item=>item.status==="Unread").length;

  const markRead=(id:string)=>{
    if(id.startsWith("derived-"))setReadDerived(current=>{const next=new Set(current);next.add(id);return next;});
    else legacy.markRead(id);
  };
  const markAllRead=()=>{
    setReadDerived(current=>{const next=new Set(current);for(const item of derived)next.add(item.id);return next;});
    legacy.markAllRead();
  };

  const value:NotificationValue={...legacy,currentUserItems,unreadCount,markRead,markAllRead};
  return <UnifiedNotificationContext.Provider value={value}>{children}</UnifiedNotificationContext.Provider>;
}

export function NotificationProvider({children}:{children:ReactNode}){
  const {currentUser}=useWorkspace();
  const userId=currentUser?.id??"signed-out";
  return <LegacyNotificationProvider><UnifiedBridge key={userId} userId={userId}>{children}</UnifiedBridge></LegacyNotificationProvider>;
}

export function useNotifications(){
  const value=useContext(UnifiedNotificationContext);
  if(!value)throw new Error("useNotifications must be used inside NotificationProvider");
  return value;
}
