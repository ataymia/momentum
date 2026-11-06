/**
 * E08/E09 isolated purchasing policy. Not a payment processor, Firestore authorization,
 * accounts payable ledger or inventory posting integration.
 * All prices are user-entered integer USD cents; no supplier facts are seeded.
 */
export type PurchaseRole = "Administrator"|"Operations"|"Warehouse"|"Other";
export type PurchaseActor = {id:string;role:PurchaseRole};
export type VendorRecord = {id:string;name:string;contact:string;active:boolean;createdAt:string;createdBy:string};
export type PurchaseOrderRecord = {id:string;vendorId:string;sku:string;cases:number;unitCostCents:number;warehouse:string;expectedDate:string;createdAt:string;createdBy:string;submittedAt?:string;approvedAt?:string;approvedBy?:string;cancelledAt?:string};
export type PurchaseReceiptRecord = {id:string;poId:string;cases:number;lotCode:string;bestBy:string;warehouse:string;recordedAt:string;recordedBy:string;inventoryPosted:false};
export type VendorBillRecord = {id:string;poId:string;invoiceNumber:string;cases:number;amountCents:number;recordedAt:string;recordedBy:string;approvedAt?:string;approvedBy?:string};
export type VendorPaymentRecord = {id:string;billId:string;reference:string;amountCents:number;recordedAt:string;recordedBy:string;externalSettlementVerified:false};
export type VendorCreditRecord = {id:string;billId:string;reference:string;reason:string;amountCents:number;recordedAt:string;recordedBy:string;approvedAt?:string;approvedBy?:string};
export type PurchaseExpenseRecord = {id:string;vendorId?:string;description:string;amountCents:number;recordedAt:string;recordedBy:string;approvedAt?:string;approvedBy?:string};
export type PurchaseAuditEvent={id:string;at:string;actorId:string;action:string;recordId:string;detail:string};
export type PurchasingState={version:1;vendors:VendorRecord[];orders:PurchaseOrderRecord[];receipts:PurchaseReceiptRecord[];bills:VendorBillRecord[];payments:VendorPaymentRecord[];credits:VendorCreditRecord[];expenses:PurchaseExpenseRecord[];audit:PurchaseAuditEvent[]};
export const PURCHASING_DEMO_KEY="momentum-e-purchasing-local-review-v1";
export const emptyPurchasingState=():PurchasingState=>({version:1,vendors:[],orders:[],receipts:[],bills:[],payments:[],credits:[],expenses:[],audit:[]});
export function normalizePurchasingDemoState(raw:unknown):PurchasingState{
  if(!raw||typeof raw!=="object"||(raw as {version?:unknown}).version!==1)return emptyPurchasingState();
  const v=raw as Partial<PurchasingState>;
  if(!["vendors","orders","receipts","bills","payments","credits","expenses","audit"].every(k=>Array.isArray(v[k as keyof PurchasingState])))return emptyPurchasingState();
  return {...emptyPurchasingState(),...v} as PurchasingState;
}
const amount=(n:number)=>Number.isSafeInteger(n)&&n>0;
const label=(s:string)=>s.trim().length>0&&s.trim().length<=160;
const dateKey=(s:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+"T12:00:00Z");return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;};
const newId=(state:PurchasingState,prefix:string)=>prefix+"-"+String(state.audit.length+1).padStart(5,"0");
export const receivedCases=(s:PurchasingState,poId:string)=>s.receipts.filter(r=>r.poId===poId).reduce((n,r)=>n+r.cases,0);
export const billedCases=(s:PurchasingState,poId:string)=>s.bills.filter(b=>b.poId===poId).reduce((n,b)=>n+b.cases,0);
export const paidCents=(s:PurchasingState,billId:string)=>s.payments.filter(p=>p.billId===billId&&p.externalSettlementVerified).reduce((n,p)=>n+p.amountCents,0);
export const pendingPaymentCents=(s:PurchasingState,billId:string)=>s.payments.filter(p=>p.billId===billId&&!p.externalSettlementVerified).reduce((n,p)=>n+p.amountCents,0);
export const creditedCents=(s:PurchasingState,billId:string)=>s.credits.filter(c=>c.billId===billId&&c.approvedAt).reduce((n,c)=>n+c.amountCents,0);
export const pendingCreditCents=(s:PurchasingState,billId:string)=>s.credits.filter(c=>c.billId===billId&&!c.approvedAt).reduce((n,c)=>n+c.amountCents,0);
export const billDueCents=(s:PurchasingState,b:VendorBillRecord)=>Math.max(0,b.amountCents-paidCents(s,b.id)-creditedCents(s,b.id));
export function poStatus(s:PurchasingState,p:PurchaseOrderRecord):string{
  if(p.cancelledAt)return "Cancelled";
  if(!p.submittedAt)return "Draft";
  if(!p.approvedAt)return "Awaiting approval";
  const received=receivedCases(s,p.id);
  return received>=p.cases?"Received":received>0?"Partially received":"Approved";
}
export function threeWayMatch(s:PurchasingState,b:VendorBillRecord){
  const po=s.orders.find(p=>p.id===b.poId);
  const received=receivedCases(s,b.poId);
  const alreadyApproved=s.bills.filter(item=>item.poId===b.poId&&item.approvedAt&&item.id!==b.id).reduce((n,item)=>n+item.cases,0);
  const matched=Boolean(po&&po.approvedAt&&!po.cancelledAt&&b.cases>0&&
    alreadyApproved+b.cases<=received&&b.amountCents===b.cases*po.unitCostCents);
  return {matched,po,received,billed:b.cases,alreadyApproved,expectedCents:po?b.cases*po.unitCostCents:0,varianceCents:po?b.amountCents-b.cases*po.unitCostCents:0};
}
export type PurchaseAction=
 |{kind:"vendor.add";name:string;contact:string}
 |{kind:"po.create";vendorId:string;sku:string;cases:number;unitCostCents:number;warehouse:string;expectedDate:string}
 |{kind:"po.submit";id:string}
 |{kind:"po.approve";id:string}
 |{kind:"po.cancel";id:string}
 |{kind:"receipt.record";poId:string;cases:number;lotCode:string;bestBy:string;warehouse:string}
 |{kind:"bill.record";poId:string;invoiceNumber:string;cases:number;amountCents:number}
 |{kind:"bill.approve";id:string}
 |{kind:"payment.record";billId:string;reference:string;amountCents:number}
 |{kind:"credit.record";billId:string;reference:string;reason:string;amountCents:number}
 |{kind:"credit.approve";id:string}
 |{kind:"expense.record";vendorId?:string;description:string;amountCents:number}
 |{kind:"expense.approve";id:string};
export type PurchaseResult={ok:boolean;state:PurchasingState;message:string};
const canProcure=(actor:PurchaseActor)=>actor.role==="Administrator"||actor.role==="Operations";
const canReceive=(actor:PurchaseActor)=>canProcure(actor)||actor.role==="Warehouse";
const isAdmin=(actor:PurchaseActor)=>actor.role==="Administrator";
/** Deterministic transition engine. Caller must also enforce real server-side auth before production use. */
export function applyPurchaseAction(original:PurchasingState,actor:PurchaseActor,action:PurchaseAction,at:string):PurchaseResult{
  const reject=(message:string):PurchaseResult=>({ok:false,state:original,message});
  if(!actor.id||!Number.isFinite(Date.parse(at)))return reject("An identified actor and valid event time are required.");
  const s:PurchasingState={...original,vendors:original.vendors.map(v=>({...v})),orders:original.orders.map(p=>({...p})),receipts:[...original.receipts],bills:original.bills.map(b=>({...b})),payments:[...original.payments],credits:original.credits.map(c=>({...c})),expenses:original.expenses.map(e=>({...e})),audit:[...original.audit]};
  let recordId="";let detail="";
  switch(action.kind){
    case "vendor.add":{
      if(!isAdmin(actor))return reject("Only an administrator may register vendors.");
      if(!label(action.name)||s.vendors.some(v=>v.name.trim().toLowerCase()===action.name.trim().toLowerCase()))return reject("A distinct vendor name is required.");
      recordId=newId(s,"vendor");s.vendors.push({id:recordId,name:action.name.trim(),contact:action.contact.trim().slice(0,160),active:true,createdAt:at,createdBy:actor.id});break;
    }
    case "po.create":{
      if(!canProcure(actor))return reject("Only purchasing staff may prepare purchase orders.");
      if(!s.vendors.some(v=>v.id===action.vendorId&&v.active))return reject("Select a registered active vendor.");
      if(!label(action.sku)||!amount(action.cases)||!amount(action.unitCostCents)||!Number.isSafeInteger(action.cases*action.unitCostCents)||!label(action.warehouse)||!dateKey(action.expectedDate))return reject("Enter a SKU, whole case quantity, cost, location and valid expected date.");
      recordId=newId(s,"po");s.orders.push({id:recordId,vendorId:action.vendorId,sku:action.sku,cases:action.cases,unitCostCents:action.unitCostCents,warehouse:action.warehouse.trim(),expectedDate:action.expectedDate,createdAt:at,createdBy:actor.id});break;
    }
    case "po.submit":{
      if(!canProcure(actor))return reject("Only purchasing staff may submit purchase orders.");
      const p=s.orders.find(x=>x.id===action.id);
      if(!p||p.submittedAt||p.cancelledAt)return reject("Only a draft purchase order can be submitted.");
      recordId=p.id;p.submittedAt=at;break;
    }
    case "po.approve":{
      if(!isAdmin(actor))return reject("An administrator must approve the purchase order.");
      const p=s.orders.find(x=>x.id===action.id);
      if(!p||!p.submittedAt||p.approvedAt||p.cancelledAt)return reject("A submitted, undecided purchase order is required.");
      if(p.createdBy===actor.id)return reject("The preparer cannot approve their own purchase order.");
      recordId=p.id;p.approvedAt=at;p.approvedBy=actor.id;break;
    }
    case "po.cancel":{
      if(!isAdmin(actor))return reject("Only an administrator may cancel purchase orders.");
      const p=s.orders.find(x=>x.id===action.id);
      if(!p||p.cancelledAt||receivedCases(s,p.id)>0||billedCases(s,p.id)>0)return reject("Orders with receipts or bills need a separately approved reversal, not cancellation.");
      recordId=p.id;p.cancelledAt=at;break;
    }
    case "receipt.record":{
      if(!canReceive(actor))return reject("Receiving access is required.");
      const p=s.orders.find(x=>x.id===action.poId);
      if(!p?.approvedAt||p.cancelledAt)return reject("An approved purchase order is required before receiving.");
      if(!amount(action.cases)||receivedCases(s,p.id)+action.cases>p.cases||!label(action.lotCode)||!dateKey(action.bestBy)||!label(action.warehouse))return reject("Receipt needs valid cases, lot, best-by and location, without exceeding ordered quantity.");
      if(action.warehouse.trim()!==p.warehouse)return reject("Receipt warehouse must match the approved purchase order.");
      recordId=newId(s,"receipt");s.receipts.push({id:recordId,poId:p.id,cases:action.cases,lotCode:action.lotCode.trim(),bestBy:action.bestBy,warehouse:action.warehouse.trim(),recordedAt:at,recordedBy:actor.id,inventoryPosted:false});
      detail="Receipt recorded in local review only; inventory posting remains blocked.";break;
    }
    case "bill.record":{
      if(!isAdmin(actor))return reject("Only an administrator may register bills.");
      const p=s.orders.find(x=>x.id===action.poId);
      if(!p?.approvedAt||p.cancelledAt||!label(action.invoiceNumber)||!amount(action.cases)||!amount(action.amountCents))return reject("An approved order, supplier invoice and positive billed amount are required.");
      if(billedCases(s,p.id)+action.cases>p.cases)return reject("Billed quantities cannot exceed the approved order.");
      if(s.bills.some(b=>s.orders.find(po=>po.id===b.poId)?.vendorId===p.vendorId&&b.invoiceNumber.toLowerCase()===action.invoiceNumber.trim().toLowerCase()))return reject("Duplicate supplier invoice number for this vendor.");
      recordId=newId(s,"bill");s.bills.push({id:recordId,poId:p.id,invoiceNumber:action.invoiceNumber.trim(),cases:action.cases,amountCents:action.amountCents,recordedAt:at,recordedBy:actor.id});break;
    }
    case "bill.approve":{
      if(!isAdmin(actor))return reject("Only an administrator may approve a bill.");
      const bill=s.bills.find(b=>b.id===action.id);
      if(!bill||bill.approvedAt)return reject("An unapproved bill is required.");
      if(bill.recordedBy===actor.id)return reject("The bill creator cannot approve their own bill.");
      if(!threeWayMatch(s,bill).matched)return reject("Three-way match failed: approved order, recorded receipt quantity and exact invoice cost must agree.");
      recordId=bill.id;bill.approvedAt=at;bill.approvedBy=actor.id;break;
    }
    case "payment.record":{
      if(!isAdmin(actor))return reject("Only an administrator may record a supplier payment.");
      const bill=s.bills.find(b=>b.id===action.billId);
      if(!bill?.approvedAt||!label(action.reference)||!amount(action.amountCents)||action.amountCents>billDueCents(s,bill)-pendingPaymentCents(s,bill.id)-pendingCreditCents(s,bill.id))return reject("Approved bill, distinct reference and amount within the unreconciled balance are required.");
      if(s.payments.some(p=>p.reference.toLowerCase()===action.reference.trim().toLowerCase()))return reject("Payment reference already recorded.");
      recordId=newId(s,"pay");s.payments.push({id:recordId,billId:bill.id,reference:action.reference.trim(),amountCents:action.amountCents,recordedAt:at,recordedBy:actor.id,externalSettlementVerified:false});
      detail="Local payment note only; no money moved and no external settlement verified.";break;
    }
    case "credit.record":{
      if(!isAdmin(actor))return reject("Only an administrator may record vendor credits.");
      const bill=s.bills.find(b=>b.id===action.billId);
      if(!bill?.approvedAt||!label(action.reference)||!label(action.reason)||!amount(action.amountCents)||action.amountCents>billDueCents(s,bill)-pendingPaymentCents(s,bill.id)-pendingCreditCents(s,bill.id))return reject("An approved bill, reason, reference and credit within remaining uncommitted payable are required.");
      if(s.credits.some(c=>c.reference.toLowerCase()===action.reference.trim().toLowerCase()))return reject("Vendor credit reference already recorded.");
      recordId=newId(s,"credit");s.credits.push({id:recordId,billId:bill.id,reference:action.reference.trim(),reason:action.reason.trim(),amountCents:action.amountCents,recordedAt:at,recordedBy:actor.id});detail="Credit is pending independent review and does not yet change the bill balance.";break;
    }
    case "credit.approve":{
      if(!isAdmin(actor))return reject("Only an administrator may approve vendor credits.");
      const credit=s.credits.find(c=>c.id===action.id);
      if(!credit||credit.approvedAt||credit.recordedBy===actor.id)return reject("Independent review of an unapproved vendor credit is required.");
      const bill=s.bills.find(b=>b.id===credit.billId);
      if(!bill?.approvedAt||credit.amountCents>billDueCents(s,bill))return reject("Approved bill and sufficient remaining payable required.");
      recordId=credit.id;credit.approvedAt=at;credit.approvedBy=actor.id;
      detail="Vendor credit reviewed in local demo only; external supplier credit evidence and GL posting remain unverified.";break;
    }
    case "expense.record":{
      if(!canProcure(actor))return reject("Only purchasing staff may submit expenses.");
      if(!label(action.description)||!amount(action.amountCents)||(action.vendorId&&!s.vendors.some(v=>v.id===action.vendorId)))return reject("A description, positive amount and valid optional vendor are required.");
      recordId=newId(s,"expense");s.expenses.push({id:recordId,vendorId:action.vendorId||undefined,description:action.description.trim(),amountCents:action.amountCents,recordedAt:at,recordedBy:actor.id});break;
    }
    case "expense.approve":{
      if(!isAdmin(actor))return reject("Only an administrator may approve expenses.");
      const e=s.expenses.find(x=>x.id===action.id);
      if(!e||e.approvedAt||e.recordedBy===actor.id)return reject("An independent approval of a submitted expense is required.");
      recordId=e.id;e.approvedAt=at;e.approvedBy=actor.id;break;
    }
    default:return reject("Unsupported purchasing action.");
  }
  s.audit.push({id:"audit-"+String(s.audit.length+1).padStart(5,"0"),at,actorId:actor.id,action:action.kind,recordId,detail});
  return {ok:true,state:s,message:detail||"Recorded in isolated local review. No production transaction occurred."};
}
