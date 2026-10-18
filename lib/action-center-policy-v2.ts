import { canAccessPage, canManageUser, canReviewApproval } from "./access";
import type { AccountingSourceEvent, AccountingState } from "./accounting-engine";
import { arizonaDateKey, arizonaHour } from "./date-time";
import type { FinanceState } from "./finance-engine";
import type { HCMState } from "./hcm-engine";
import { inventoryProductStatuses, type InventoryLedgerState } from "./inventory-ledger";
import type { MarketingState } from "./marketing-engine";
import { notificationActionCenterEnabled } from "./notification-policy-registry";
import { weeklyReportingObligations, type PerformanceState } from "./performance-engine";
import type { PageKey, WorkspaceData, WorkspaceUser } from "./types";

export type ActionUrgency="Blocking"|"Due"|"Review"|"Watch";
export type ActionNotice={id:string;policyId:string;title:string;detail:string;category:string;page?:PageKey;urgency:ActionUrgency;focus?:string;peopleTab?:string;weeklyWeekStart?:string};
export type ActionNoticeInputs={data:WorkspaceData;scope:Pick<WorkspaceData,"appointments">;currentUser:WorkspaceUser;hcm:HCMState;performance:PerformanceState;finance:FinanceState;marketing:MarketingState;accounting:AccountingState;accountingEvents:AccountingSourceEvent[];ledger:InventoryLedgerState;today?:string};

const money=(value:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(value);
const date=(value:string)=>{const parsed=new Date(/^\d{4}-\d{2}-\d{2}$/.test(value)?`${value}T12:00:00-07:00`:value);return Number.isNaN(parsed.getTime())?value:new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric"}).format(parsed);};

export function buildActionNotices(input:ActionNoticeInputs):ActionNotice[]{
  const{data,currentUser,hcm,performance,finance,marketing,ledger}=input;
  const today=input.today??arizonaDateKey();
  const admin=currentUser.role==="Administrator",manager=currentUser.role==="Sales Manager",warehouse=currentUser.role==="Warehouse",operations=currentUser.role==="Operations";
  const actions:ActionNotice[]=[];
  for(const approval of data.approvals.filter(item=>item.status==="Pending"&&canReviewApproval(data,currentUser,item)))actions.push({id:`approval:${approval.id}`,policyId:["Order","Low stock sale"].includes(approval.type)?"order.submitted_for_approval":"workflow.approval_required",title:["Order","Low stock sale"].includes(approval.type)?"Order approval required":`${approval.type} approval required`,detail:approval.detail||approval.title,category:"Approvals",page:"work",focus:approval.id,urgency:approval.priority==="Urgent"?"Blocking":"Review"});
  for(const approval of data.approvals.filter(item=>item.status==="Returned"&&(item.requesterId===currentUser.id||item.requestedBy===currentUser.id)))actions.push({id:`approval-returned:${approval.id}`,policyId:["Order","Low stock sale"].includes(approval.type)?"order.returned_for_correction":"workflow.returned_for_correction",title:"Item returned for correction",detail:approval.returnReason?`${approval.title} · ${approval.returnReason}`:approval.title,category:"Approvals",page:["Order","Low stock sale"].includes(approval.type)?"orders":"work",focus:approval.recordId??approval.id,urgency:"Due"});
  const sundayReminderWindow=new Date(`${today}T12:00:00Z`).getUTCDay()===0&&arizonaHour()>=19;
  for(const period of weeklyReportingObligations(performance,currentUser.id,today).filter(item=>item.overdue||sundayReminderWindow)){
    actions.push({id:`weekly:${currentUser.id}:${period.weekStart}`,policyId:period.overdue?"weekly.delinquent.self":currentUser.role==="Sales Manager"?"weekly.reminder.manager":"weekly.reminder.rep",title:period.overdue?"Weekly report overdue":"Weekly report due",detail:`Week ${date(period.weekStart)} to ${date(period.weekEnd)} · due ${date(period.dueDate)}`,category:"Performance",page:"reportingCenter",weeklyWeekStart:period.weekStart,urgency:period.overdue?"Blocking":"Due"});
  }

  for(const document of hcm.documents.filter(item=>item.userId===currentUser.id&&["Missing","Acknowledgment required"].includes(item.status)))actions.push({id:`document:${document.id}`,policyId:"hr.action_required",title:document.status==="Missing"?"Required document missing":"Document acknowledgment required",detail:document.title,category:"Human Resources",page:"people",peopleTab:"documents",focus:document.id,urgency:"Due"});
  for(const workflow of hcm.workflows.filter(item=>item.userId===currentUser.id&&item.status==="Returned"))actions.push({id:`workflow-returned:${workflow.id}`,policyId:"hr.action_required",title:workflow.type==="Document"?"Document request returned":"Request returned for correction",detail:workflow.decisionNote?`${workflow.title} · ${workflow.decisionNote}`:workflow.title,category:"Human Resources",page:"people",peopleTab:"review",focus:workflow.id,urgency:"Due"});
  for(const task of hcm.tasks.filter(item=>item.status==="Open"&&item.sourceType!=="TrainingAssignment"&&(item.ownerId===currentUser.id||admin)))actions.push({id:`hcm:${task.id}`,policyId:"hr.action_required",title:task.title,detail:task.detail,category:"Human Resources",page:"people",peopleTab:"admin",focus:task.sourceId,urgency:task.dueDate&&task.dueDate<today?"Due":"Review"});

  if(admin||manager){
    for(const request of hcm.workflows.filter(item=>item.status==="Submitted"&&item.userId!==currentUser.id&&canManageUser(data,currentUser,item.userId,false)))actions.push({id:`hr:${request.id}`,policyId:"hr.action_required",title:request.title,detail:`${data.users.find(user=>user.id===request.userId)?.name??"Employee"} · ${request.type}`,category:"Human Resources",page:"people",peopleTab:"review",focus:request.id,urgency:"Review"});
  }
  if(manager){
    for(const rep of data.users.filter(user=>user.role==="Sales Representative"&&user.employmentStatus!=="Separated"&&canManageUser(data,currentUser,user.id,false))){
      for(const period of weeklyReportingObligations(performance,rep.id,today).filter(item=>item.overdue))actions.push({id:`rep-weekly-overdue:${rep.id}:${period.weekStart}`,policyId:"weekly.delinquent.manager",title:`${rep.firstName}'s weekly report is overdue`,detail:`Week ${date(period.weekStart)} to ${date(period.weekEnd)} was due ${date(period.dueDate)}.`,category:"Performance",page:"reportingCenter",urgency:"Due"});
    }
  }

  for(const expense of finance.expenses){
    const managerCan=manager&&expense.requesterId!==currentUser.id&&canManageUser(data,currentUser,expense.requesterId,false);
    if(expense.status==="Returned"&&expense.requesterId===currentUser.id)actions.push({id:`expense-returned:${expense.id}`,policyId:"expense.returned",title:"Expense returned for correction",detail:`${expense.merchant} · ${money(expense.amount)}${expense.returnReason?` · ${expense.returnReason}`:""}`,category:"Finance",page:"finance",focus:expense.id,urgency:"Due"});
    else if(expense.status==="Submitted"&&(admin||managerCan))actions.push({id:`expense:${expense.id}`,policyId:"expense.submitted",title:"Review business expense",detail:`${data.users.find(user=>user.id===expense.requesterId)?.name??"Employee"} · ${expense.merchant} · ${money(expense.amount)}`,category:"Finance",page:"finance",focus:expense.id,urgency:"Review"});
    else if(expense.status==="Manager approved"&&admin)actions.push({id:`expense-finance:${expense.id}`,policyId:"expense.manager_approved",title:"Finance approval required",detail:`${expense.merchant} · ${money(expense.amount)}`,category:"Finance",page:"finance",focus:expense.id,urgency:"Review"});
  }

  if(admin){
    for(const request of marketing.requests.filter(item=>item.status==="Submitted"))actions.push({id:`marketing:${request.id}`,policyId:"marketing.request_submitted",title:"Marketing request needs review",detail:request.title,category:"Marketing",page:"marketing",focus:request.id,urgency:"Review"});
    for(const campaign of marketing.campaigns.filter(item=>item.status==="Awaiting approval"))actions.push({id:`campaign:${campaign.id}`,policyId:"marketing.campaign_budget_approval",title:"Campaign budget needs approval",detail:`${campaign.name} · ${money(campaign.requestedBudget)}`,category:"Marketing",page:"marketing",focus:campaign.id,urgency:"Review"});
  }

  for(const stock of inventoryProductStatuses(ledger,data).filter(item=>item.reorderNeeded)){if(!(admin||warehouse||operations||(manager&&stock.requiresManagerApproval)))continue;actions.push({id:`stock:${stock.product}`,policyId:stock.requiresManagerApproval?"inventory.low_stock_blocking_sale":"inventory.reorder_threshold",title:stock.requiresManagerApproval?"Low stock blocks unapproved sales":"Inventory reorder required",detail:`${stock.product} · ${stock.available} available sellable cases`,category:"Inventory",page:canAccessPage(currentUser,"inventory")?"inventory":undefined,urgency:stock.requiresManagerApproval?"Blocking":"Due"});}

  const rank:Record<ActionUrgency,number>={Blocking:0,Due:1,Review:2,Watch:3};
  return actions.filter(item=>notificationActionCenterEnabled(item.policyId)).filter((item,index,all)=>all.findIndex(other=>other.id===item.id)===index).sort((a,b)=>rank[a.urgency]-rank[b.urgency]||a.category.localeCompare(b.category)||a.title.localeCompare(b.title));
}
