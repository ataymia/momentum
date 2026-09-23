from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def replace_once(path,old,new):
    p=ROOT/path;text=p.read_text();count=text.count(old)
    if count!=1:raise SystemExit(f"V7 PATCH FAILED {path}: {count} matches for {old[:140]!r}")
    p.write_text(text.replace(old,new,1));print(f"v7 patched {path}")

def append_once(path,marker,addition):
    p=ROOT/path;text=p.read_text()
    if marker in text:return
    p.write_text(text.rstrip()+"\n\n"+addition.rstrip()+"\n");print(f"v7 patched {path}")

# Weekly management is derived from source records, not manually-entered dashboard progress.
append_once("lib/sales-field-engine.ts","weeklySalesManagementSummary",'''export type WeeklySalesManagementSummary = {
  userId:string;weekStart:string;weekEnd:string;visits:number;orders:number;orderCases:number;orderValue:number;
  reorders:number;newAccounts:number;promisingProspects:number;followUpsDue:number;blockers:number;
};

export function weeklySalesManagementSummary(data:WorkspaceData,interactions:CrmInteraction[],userId:string,asOf=arizonaDateKey()):WeeklySalesManagementSummary{
  const weekStart=startOfLocalWeek(asOf);const weekEnd=addCalendarDays(weekStart,6);const inWeek=(value:string|undefined)=>{if(!value)return false;const date=arizonaDateKey(value);return date>=weekStart&&date<=weekEnd;};
  const visits=weeklyVisitSummary(interactions,userId,asOf).completed;
  const orders=data.orders.filter((order)=>(order.creditedRepId===userId||(!order.creditedRepId&&order.ownerId===userId))&&inWeek(order.placedAt));
  const reorders=orders.filter((order)=>data.orders.some((prior)=>prior.accountId===order.accountId&&prior.id!==order.id&&prior.placedAt<order.placedAt)).length;
  const newAccounts=new Set(data.activities.filter((activity)=>activity.userId===userId&&activity.accountId&&activity.title==="Customer location created"&&inWeek(activity.at)).map((activity)=>activity.accountId)).size;
  const promisingProspects=data.accounts.filter((account)=>account.ownerId===userId&&["Prospect","Qualified","Sampled"].includes(account.stage)&&(latestProspectRating(interactions,account.id)??0)>=7).length;
  const followUpsDue=interactions.filter((interaction)=>interaction.userId===userId&&Boolean(interaction.nextAction?.trim())&&inWeek(interaction.nextActionDate)).length;
  const returnedApprovals=data.approvals.filter((approval)=>approval.requesterId===userId&&approval.status==="Returned"&&inWeek(approval.decidedAt??approval.submittedAt)).length;
  const atRisk=data.accounts.filter((account)=>account.ownerId===userId&&account.health==="At risk").length;
  return{userId,weekStart,weekEnd,visits,orders:orders.length,orderCases:orders.reduce((sum,order)=>sum+order.cases,0),orderValue:orders.reduce((sum,order)=>sum+order.amount,0),reorders,newAccounts,promisingProspects,followUpsDue,blockers:returnedApprovals+atRisk};
}''')

replace_once("components/pages/operations-tools.tsx",'''import { prospectRatingColor, weeklyVisitSummary } from "../../lib/sales-field-engine";''','''import { prospectRatingColor, weeklySalesManagementSummary } from "../../lib/sales-field-engine";''')
replace_once("components/pages/operations-tools.tsx",'''import { Button, Field, PageHeader, Section, StatusPill, hoursBetween } from "../ui";''','''import { Button, Field, PageHeader, Section, StatusPill, formatMoney, hoursBetween } from "../ui";''')
replace_once("components/pages/operations-tools.tsx",'''const summaries=data.users.filter(u=>u.role==="Sales Representative").map(u=>({u,s:weeklyVisitSummary(crm.interactions,u.id)}));''','''const summaries=data.users.filter(u=>u.role==="Sales Representative").map(u=>({u,s:weeklySalesManagementSummary(data,crm.interactions,u.id)}));''')
replace_once("components/pages/operations-tools.tsx",'''<Section title="Weekly field pace" description="Actual physical visits only. Target: 75–80 per full week."><div className="company-request-list">{summaries.map(({u,s})=><article key={u.id}><span><Store size={17}/></span><div><strong>{u.name}</strong><p>{s.completed} visits this week · {s.remainingToMinimum} to 75 · prior week {s.priorWeekCompleted}</p></div><StatusPill tone={s.completed>=75?"success":s.completed>=50?"warning":"neutral"}>{s.completed}/75</StatusPill></article>)}</div></Section>''','''<Section title="Weekly sales management" description="Actual CRM, order and account records only. Visit target: 75–80 per full week. No manually-entered progress."><div className="company-request-list">{summaries.map(({u,s})=><article key={u.id}><span><Store size={17}/></span><div><strong>{u.name}</strong><p>{s.visits} visits · {s.orders} orders / {s.orderCases} cases / {formatMoney(s.orderValue)} · {s.reorders} reorders · {s.newAccounts} new accounts · {s.promisingProspects} promising prospects · {s.followUpsDue} follow-ups due · {s.blockers} blockers</p></div><StatusPill tone={s.visits>=75?"success":s.visits>=50?"warning":"neutral"}>{s.visits}/75</StatusPill></article>)}</div></Section>''')

# Thirty-day program pricing warning is an actionable bell item, not routine audit noise.
replace_once("lib/notification-engine.ts",'''import type { WorkspaceData, WorkspaceUser } from "./types";''','''import type { Account, WorkspaceData, WorkspaceUser } from "./types";''')
append_once("lib/notification-engine.ts","programPricingDaysRemaining",'''export function programPricingDaysRemaining(account:Account,asOf:string){
  if(!account.programPricingExpirationDate||["Expired","Cancelled"].includes(account.programPricingStatus??""))return undefined;
  const start=new Date(`${asOf}T12:00:00-07:00`).getTime();const end=new Date(`${account.programPricingExpirationDate}T12:00:00-07:00`).getTime();
  if(Number.isNaN(start)||Number.isNaN(end))return undefined;return Math.ceil((end-start)/86_400_000);
}''')
replace_once("lib/notification-context-v2.tsx",'''import { NOTIFICATION_STORAGE_KEY, NotificationDelivery, NotificationPreference, NotificationState, auditEventCreatesNotification, createNotificationSeed, deliveryKey, enabledChannels, normalizeNotificationState, notificationCopy, resolveNotificationRecipients } from "./notification-engine";''','''import { NOTIFICATION_STORAGE_KEY, NotificationDelivery, NotificationPreference, NotificationState, auditEventCreatesNotification, createNotificationSeed, deliveryKey, enabledChannels, normalizeNotificationState, notificationCopy, programPricingDaysRemaining, resolveNotificationRecipients } from "./notification-engine";
import { arizonaDateKey } from "./date-time";''')
insert='''
  useEffect(() => {
    const handle=window.setTimeout(()=>setState((current)=>{
      const today=arizonaDateKey();
      const warnings=data.accounts.map((account)=>({account,days:programPricingDaysRemaining(account,today)})).filter((item):item is {account:typeof data.accounts[number];days:number}=>item.days!==undefined&&item.days>=0&&item.days<=30);
      const activeSourceIds=new Set(warnings.map(({account})=>`program-pricing-expiry:${account.id}:${account.programPricingExpirationDate}`));
      const retained=current.deliveries.filter((delivery)=>!delivery.sourceEventId.startsWith("program-pricing-expiry:")||activeSourceIds.has(delivery.sourceEventId));
      const existing=new Set(retained.map((item)=>deliveryKey(item.sourceEventId,item.recipientUserId,item.channel)));const additions:NotificationDelivery[]=[];
      for(const{account,days}of warnings){
        const sourceEventId=`program-pricing-expiry:${account.id}:${account.programPricingExpirationDate}`;const owner=data.users.find((user)=>user.id===account.ownerId);const recipients=new Set(data.users.filter((user)=>user.role==="Administrator").map((user)=>user.id));
        if(account.accountManagerId)recipients.add(account.accountManagerId);if(account.ownerId)recipients.add(account.ownerId);if(owner?.managerId)recipients.add(owner.managerId);
        const title=`Program pricing expires in ${days} day${days===1?"":"s"}`;const detail=`${account.locationName??account.name}${account.programPricingLabel?` · ${account.programPricingLabel}`:""} expires ${account.programPricingExpirationDate}. Review renewal, replacement pricing, or expiration.`;
        for(const recipientUserId of recipients){const preference=current.preferences.find((item)=>item.userId===recipientUserId);if(!preference)continue;for(const channel of enabledChannels(preference)){const key=deliveryKey(sourceEventId,recipientUserId,channel);if(existing.has(key))continue;existing.add(key);additions.push({id:uid("pricing-alert"),sourceEventId,recipientUserId,channel,title,detail,tone:"warning",createdAt:new Date().toISOString(),status:channel==="In app"?"Unread":"Awaiting integration"});}}
      }
      return additions.length||retained.length!==current.deliveries.length?{...current,deliveries:[...additions,...retained].slice(0,12000)}:current;
    }),0);return()=>window.clearTimeout(handle);
  },[data.accounts,data.users]);
'''
replace_once("lib/notification-context-v2.tsx",'''  useEffect(() => {
    const evaluateEscalations = () => {''',insert+'''\n  useEffect(() => {
    const evaluateEscalations = () => {''')

# Tests for weekly source-derived management data and 30-day warning rule.
append_once("tests/platform-integrity.test.ts","weekly management view is source-derived",'''import { weeklySalesManagementSummary } from "../lib/sales-field-engine";
import { programPricingDaysRemaining } from "../lib/notification-engine";

test("weekly management view is source-derived",()=>{
  const account={id:"acc-week",name:"Shop",location:"Phoenix",channel:"Retail",stage:"Prospect" as const,ownerId:REP,contactName:"Owner",contactRole:"Owner",phone:"1",email:"x@y.com",lastActivity:"",nextAction:"Follow up",nextActionDate:"2026-09-25",health:"New" as const,lifetimeCases:0,reorderCount:0,notes:"",responsibilityStartedAt:"2026-09-21T10:00:00.000Z"};
  const order:Order={id:"week-order",number:"GE-W",accountId:account.id,cases:12,pricePerCase:24,amount:288,status:"Awaiting approval",placedAt:"2026-09-23",ownerId:REP,creditedRepId:REP,priceBasis:"Tier A",paymentStatus:"Not invoiced"};
  const weeklyData:WorkspaceData={...data,accounts:[account],orders:[order],activities:[{id:"created",accountId:account.id,type:"note",title:"Customer location created",detail:"created",at:"2026-09-22T10:00:00.000Z",userId:REP}]};
  const interactions=[{id:"visit",locationId:account.id,userId:REP,type:"Visit" as const,occurredAt:"2026-09-22T12:00:00.000Z",summary:"visit",physicalVisit:true,prospectRating:8,nextAction:"Follow up",nextActionDate:"2026-09-25"}];
  const summary=weeklySalesManagementSummary(weeklyData,interactions,REP,"2026-09-23");assert.equal(summary.visits,1);assert.equal(summary.orders,1);assert.equal(summary.orderCases,12);assert.equal(summary.newAccounts,1);assert.equal(summary.promisingProspects,1);assert.equal(summary.followUpsDue,1);
});

test("program pricing enters the action window at 30 days",()=>{const account={id:"a",name:"A",location:"Phoenix",channel:"Retail",stage:"Prospect",ownerId:REP,contactName:"x",contactRole:"x",phone:"",email:"",lastActivity:"",nextAction:"",nextActionDate:"2026-09-23",health:"New",lifetimeCases:0,reorderCount:0,notes:"",programPricingExpirationDate:"2026-10-23",programPricingStatus:"Active"} as const;assert.equal(programPricingDaysRemaining(account,"2026-09-23"),30)});''')
print("PASS: platform refinements v7 applied")
