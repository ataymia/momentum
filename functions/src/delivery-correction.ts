/* eslint-disable max-len, comma-spacing, key-spacing, object-curly-spacing, indent, space-before-blocks, keyword-spacing, curly, brace-style, semi */
import {createHash,randomUUID} from "node:crypto";
import {getFirestore} from "firebase-admin/firestore";
import {canonicalLines,orderLinesReconcile,correctionDiff,correctionApprovalGate,correctionCloseGate,text} from "./delivery-correction-policy";
import {planDeliveredInventoryCorrection,type InventoryCorrectionRow} from "./delivery-inventory-revision";
import {planFinancialCarry} from "./correction-financial-plan";

type Row=Record<string,unknown>;
const row=(v:unknown):v is Row=>Boolean(v&&typeof v==="object"&&!Array.isArray(v));
const items=(v:Row|undefined):Row[]=>Array.isArray(v?.items)?v.items.filter(row):[];
const idOk=(v:string)=>/^[a-zA-Z0-9_-]{8,100}$/.test(v);
const now=()=>new Date().toISOString();
const hash=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
const n=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)?v:0;

export class DeliveryCorrectionError extends Error{
  constructor(public readonly status:number,message:string){super(message);}
}
const fail=(status:number,message:string):never=>{throw new DeliveryCorrectionError(status,message)};

type RevisionEvidence={
  order:Row;invoice:Row;tasks:Row[];overrides:Row[];
  movements:Row[];allMovements:Row[];lots:Row[];nodes:Row[];reservations:Row[];accountingJournals:Row[];payments:Row[];allocations:Row[];credits:Row[];refunds:Row[];
};

function revision(e:RevisionEvidence):string{
  // Only this order's invoice, delivery and payment records form the source revision.
  // Unrelated inventory and accounting activity is validated independently at approval.
  const ids=new Set(e.allocations.map(a=>text(a.paymentId)));
  return hash({
    order:e.order,invoice:e.invoice,tasks:e.tasks,overrides:e.overrides,
    movements:e.movements,allocations:e.allocations,credits:e.credits,
    relevantPayments:e.payments.filter(p=>ids.has(text(p.id))),
    relevantRefunds:e.refunds.filter(r=>ids.has(text(r.paymentId))),
  });
}
function forOrder(all:Row[],orderId:string):Row[]{
  return all.filter(x=>text(x.orderId)===orderId||text(x.relatedOrderId)===orderId);
}
function financialActivity(invoice:Row,payments:Row[],allocations:Row[],credits:Row[],refunds:Row[]):boolean{
  const invoiceId=text(invoice.id);
  const allocated=allocations.filter(x=>text(x.invoiceId)===invoiceId);
  const paymentIds=new Set(allocated.map(x=>text(x.paymentId)));
  return allocated.length>0||
    payments.some(x=>paymentIds.has(text(x.id))&&["Pending","Cleared"].includes(text(x.status)))||
    credits.some(x=>text(x.invoiceId)===invoiceId&&text(x.status)!=="Void")||
    refunds.some(x=>paymentIds.has(text(x.paymentId))&&text(x.status)!=="Failed");
}
function unreconciledAccountingJournal(e:RevisionEvidence):boolean{
  return e.accountingJournals.some(j=>
    text(j.sourceType)==="Invoice issued"&&
    text(j.sourceId)===text(e.invoice.id)&&
    text(j.status)!=="Voided");
}
function activeInvoice(list:Row[],orderId:string):Row|undefined{
  return list.find(x=>text(x.orderId)===orderId&&text(x.status)!=="Void");
}
function currentEvidence(docs:Map<string,Row[]>,orderId:string):RevisionEvidence{
  const order=docs.get("commercialOrders")?.find(x=>text(x.id)===orderId)||
    docs.get("workspaceOrders")?.find(x=>text(x.id)===orderId);
  if(!order)throw new DeliveryCorrectionError(404,"Order not found.");
  const invoice=activeInvoice(docs.get("invoices")||[],orderId);
  if(!invoice)throw new DeliveryCorrectionError(409,"No active invoice is linked to this order.");
  return{
    order,invoice,
    tasks:forOrder(docs.get("tasks")||[],orderId),
    overrides:forOrder(docs.get("overrides")||[],orderId),
    movements:forOrder(docs.get("movements")||[],orderId),
    allMovements:docs.get("movements")||[],
    lots:[...(docs.get("workspaceLots")||[]),...(docs.get("commercialLots")||[])],
    nodes:docs.get("nodes")||[],
    reservations:docs.get("reservations")||[],
    accountingJournals:docs.get("accountingJournals")||[],
    payments:docs.get("payments")||[],
    allocations:(docs.get("allocations")||[]).filter(x=>text(x.invoiceId)===text(invoice.id)),
    credits:(docs.get("credits")||[]).filter(x=>text(x.invoiceId)===text(invoice.id)),
    refunds:docs.get("refunds")||[],
  };
}

const dataPaths={
  commercialOrders:"domains/commercial/fields/orders",
  workspaceOrders:"domains/workspace/fields/orders",
  invoices:"domains/commerce/fields/invoices",
  tasks:"domains/delivery/fields/tasks",
  overrides:"domains/delivery/fields/overrides",
  movements:"domains/inventoryLedger/fields/movements",
  nodes:"domains/inventoryLedger/fields/nodes",
  reservations:"domains/inventoryLedger/fields/reservations",
  workspaceLots:"domains/workspace/fields/inventory",
  commercialLots:"domains/commercial/fields/inventoryLots",
  payments:"domains/commerce/fields/payments",
  allocations:"domains/commerce/fields/allocations",
  credits:"domains/commerce/fields/credits",
  refunds:"domains/commerce/fields/refunds",
  accountingJournals:"domains/accounting/fields/journals",
} as const;


function targetReferences(){
  return Object.entries(dataPaths).map(([name,path])=>({name,ref:getFirestore().doc(path)}));
}
function mapDocuments(targets:ReturnType<typeof targetReferences>,snapshots:FirebaseFirestore.DocumentSnapshot[]):Map<string,Row[]>{
  return new Map(targets.map((target,i)=>[target.name,items(snapshots[i].data())]));
}
/** Save an immutable proposal. Changes to inventory, order, or invoice are forbidden in this stage. */
export async function submitDeliveryCorrection(uid:string,input:unknown){
  if(!row(input))fail(400,"Correction details required.");
  const payload=input as Row;
  const orderId=text(payload.orderId),requestId=text(payload.requestId);
  const reason=text(payload.reason),evidenceReference=text(payload.evidenceReference);
  const billToAddress=text(payload.billToAddress);
  const inventoryAdjustments:Array<InventoryCorrectionRow>=Array.isArray(payload.inventoryAdjustments)?payload.inventoryAdjustments as InventoryCorrectionRow[]:[];
  if(!idOk(orderId)||!idOk(requestId)||reason.length<12||reason.length>800||
     evidenceReference.length<6||evidenceReference.length>500||
     billToAddress.length<5||billToAddress.length>500)
    fail(400,"Enter the order, correction reason, evidence reference, and billing address.");
  const requestRef=getFirestore().doc("deliveryCorrectionRequests/"+requestId);
  const activeRef=getFirestore().doc("deliveryCorrectionActive/"+orderId);
  const targets=targetReferences();
  const accessRef=getFirestore().doc("userAccess/"+uid);
  return getFirestore().runTransaction(async tx=>{
    // Read every snapshot before writing anything.
    const [access,current,active,...snapshots]=await Promise.all([
      tx.get(accessRef),tx.get(requestRef),tx.get(activeRef),
      ...targets.map(x=>tx.get(x.ref)),
    ]);
    if(text(access.data()?.role)!=="Administrator"||text(access.data()?.accountState)!=="Active")
      fail(403,"Only an active Administrator can request a post-delivery change.");
    if(current.exists){
      const prior=current.data();
      if(text(prior?.requesterUid)!==uid||text(prior?.orderId)!==orderId)
        fail(409,"Correction request ID conflict.");
      return{requestId,status:text(prior?.state),replayed:true};
    }
    if(active.exists&&text(active.data()?.state)==="Submitted")
      fail(409,"An active correction request already exists for this order.");
    const evidence=currentEvidence(mapDocuments(targets,snapshots),orderId);
    const delivered=evidence.tasks.some(t=>text(t.status)==="Delivered")||
      evidence.overrides.length>0;
    if(!delivered||!["Delivered","Paid"].includes(text(evidence.order.status)))
      fail(409,"The order is not confirmed delivered. Use the standard editor.");
    if(!canonicalLines(evidence.order).length)
      fail(409,"Order SKU data needs Administrator review before editing.");
    const before=canonicalLines(evidence.order);
    if(!orderLinesReconcile(evidence.order,before))
      fail(409,"Original order lines and totals disagree. Reconcile the historic record first.");
    const diff=correctionDiff(before,payload.lines);
    if(!diff.ok)fail(400,diff.message);
    const oldAddress=text(evidence.invoice.billToAddressSnapshot);
    const plan=planDeliveredInventoryCorrection({accountId:text(evidence.order.accountId),
      original:before,proposed:diff.lines,adjustments:inventoryAdjustments,
      lots:evidence.lots,nodes:evidence.nodes,movements:evidence.allMovements,
      reservations:evidence.reservations,orderId});
    if(plan.ok===false)throw new DeliveryCorrectionError(409,plan.message);
    // Any existing payment is reconciled automatically in the approval transaction.
    const provisional=planFinancialCarry({oldInvoiceId:text(evidence.invoice.id),
      newInvoiceId:"proposed-"+requestId,accountId:text(evidence.order.accountId),
      newTotal:diff.total,allocations:evidence.allocations,payments:evidence.payments,
      credits:evidence.credits,refunds:evidence.refunds});
    if(provisional.ok===false)fail(409,provisional.message);
    if(!diff.quantityChanged&&billToAddress===oldAddress)
      fail(400,"No change to order quantities or invoice billing address.");
    const originalTotal=n(evidence.order.amount);
    if(Math.abs(n(evidence.invoice.total)-originalTotal)>0.005)
      fail(409,"Order and invoice totals disagree. Reconcile before editing.");
    const hasFinancialActivity=false; // Verified by automatic carry-forward.
    const stamp=now();
    const request={
      id:requestId,orderId,requesterUid:uid,state:"Submitted",createdAt:stamp,
      reason,evidenceReference,originalRevision:revision(evidence),
      originalInvoiceId:text(evidence.invoice.id),
      originalInvoiceNumber:text(evidence.invoice.number),
      originalOrderNumber:text(evidence.order.number),
      originalLines:before,proposedLines:diff.lines,
      originalAmount:originalTotal,proposedAmount:diff.total,
      originalBillToAddress:oldAddress,proposedBillToAddress:billToAddress,
      inventoryAdjustments:inventoryAdjustments.map(a=>({lotId:a.lotId,product:a.product,quantity:a.quantity,
        fromNodeId:a.fromNodeId,toNodeId:a.toNodeId,evidenceReference:a.evidenceReference})),
      quantityChanged:diff.quantityChanged,financialReviewRequired:false,
      estimatedCustomerCreditDue:provisional.creditDue,
      inventoryReviewRequired:diff.quantityChanged,
      history:[{state:"Submitted",at:stamp,actorUid:uid}],
    };
    tx.create(requestRef,request);
    tx.set(activeRef,{orderId,requestId,state:"Submitted",updatedAt:stamp});
    return{requestId,status:"Submitted",replayed:false,
      financialReviewRequired:hasFinancialActivity,inventoryReviewRequired:diff.quantityChanged};
  });
}

/** Apply a reviewable invoice-address correction. Quantity/financial changes stay blocked.
 * A second active Administrator must approve; physical delivery evidence is never modified.
 */
export async function approveDeliveryCorrection(uid:string,input:unknown){
  if(!row(input)||!idOk(text(payload.requestId)))fail(400,"Valid correction request required.");
  const payload=input as Row;
  const approvalNote=text(payload.approvalNote);
  if(payload.reviewConfirmed!==true||approvalNote.length<8||approvalNote.length>800)
    fail(400,"Review the before/after changes, physical evidence and accounting before approval.");
  const requestId=text(payload.requestId),requestRef=getFirestore().doc("deliveryCorrectionRequests/"+requestId);
  const accessRef=getFirestore().doc("userAccess/"+uid);
  const targets=targetReferences();
  const invoiceRef=getFirestore().doc(dataPaths.invoices);
  const activeDocumentId=text(payload.orderId);
  if(!idOk(activeDocumentId))fail(400,"Valid order required.");
  const activeRef=getFirestore().doc("deliveryCorrectionActive/"+activeDocumentId);
  const reissueRef=getFirestore().doc("deliveryInvoiceReissues/"+requestId);
  const metaRef=getFirestore().doc("platform/meta");
  const auditRef=getFirestore().doc("deliveryCorrectionAudit/"+requestId+"-applied");
  return getFirestore().runTransaction(async tx=>{
    const [access,request,active,reissue,...snapshots]=await Promise.all([
      tx.get(accessRef),tx.get(requestRef),tx.get(activeRef),tx.get(reissueRef),
      ...targets.map(x=>tx.get(x.ref)),
    ]);
    if(text(access.data()?.role)!=="Administrator"||text(access.data()?.accountState)!=="Active")
      fail(403,"Only an active Administrator can approve.");
    if(!request.exists)fail(404,"Correction request not found.");
    const candidate=request.data() as Row;
    if(text(candidate.orderId)!==activeDocumentId)fail(409,"Correction order mismatch.");
    if(text(candidate.state)==="Applied")return{requestId,state:"Applied",replayed:true};
    if(text(candidate.state)!=="Submitted"||text(active.data()?.requestId)!==requestId)
      fail(409,"This correction is no longer pending.");
    const evidence=currentEvidence(mapDocuments(targets,snapshots),activeDocumentId);
    const original=canonicalLines(evidence.order);
    if(!orderLinesReconcile(evidence.order,original))
      fail(409,"Original order lines and totals changed or disagree. Resubmit after reconciliation.");
    const diff=correctionDiff(original,candidate.proposedLines);
    if(!diff.ok)fail(409,diff.message);
    // Paid order receipts are carried forward automatically. No Finance handoff.
    const plan=planDeliveredInventoryCorrection({accountId:text(evidence.order.accountId),
      original,proposed:diff.lines,
      adjustments:Array.isArray(candidate.inventoryAdjustments)?candidate.inventoryAdjustments as InventoryCorrectionRow[]:[],
      lots:evidence.lots,nodes:evidence.nodes,movements:evidence.allMovements,
      reservations:evidence.reservations,orderId:activeDocumentId});
    if(plan.ok===false)throw new DeliveryCorrectionError(409,plan.message);
    const gate=correctionApprovalGate({
      requesterUid:text(candidate.requesterUid),approverUid:uid,
      activeAdministrator:true,
      originalRevision:text(candidate.originalRevision),currentRevision:revision(evidence),
      quantityChanged:diff.quantityChanged,
      hasFinancialActivity:false, // Automatic reconciliation replaces the manual gate.
      hasInventoryReconciliation:plan.ok,
    });
    if(gate)fail(409,gate);
    if(text(evidence.invoice.id)!==text(candidate.originalInvoiceId))
      fail(409,"A different invoice is now active.");
    if(reissue.exists)fail(409,"Reissue already prepared; review the correction.");
    const existing=items(snapshots[targets.findIndex(t=>t.name==="invoices")].data());
    const originalInvoiceId=text(evidence.invoice.id);
    const revisions=existing.filter(inv=>text(inv.orderId)===activeDocumentId&&
      text(inv.id)!==originalInvoiceId).length;
    const revisionNumber=revisions+1;
    const newInvoiceId=originalInvoiceId+"-r"+revisionNumber;
    if(existing.some(inv=>text(inv.id)===newInvoiceId))
      fail(409,"Invoice revision ID collision.");
    const stamped=now();
    const financial=planFinancialCarry({oldInvoiceId:originalInvoiceId,
      newInvoiceId,accountId:text(evidence.order.accountId),newTotal:diff.total,
      allocations:evidence.allocations,payments:evidence.payments,
      credits:evidence.credits,refunds:evidence.refunds});
    if(financial.ok===false)fail(409,financial.message);
    const newInvoice={
      ...evidence.invoice,id:newInvoiceId,
      number:text(evidence.invoice.number).replace(/-R\d+$/,"")+"-R"+revisionNumber,
      issuedAt:stamped,createdAt:stamped,status:financial.status,total:diff.total,
      linesSnapshot:diff.lines.map((line,index)=>({id:activeDocumentId+"-revision-"+revisionNumber+"-line-"+index,
        ...line,amount:line.cases*line.pricePerCase})),
      billToAddressSnapshot:text(candidate.proposedBillToAddress),
      previousInvoiceId:originalInvoiceId,correctionRequestId:requestId,
      revisionNumber,
    };
    const revised=existing.map(inv=>text(inv.id)===originalInvoiceId?
      {...inv,status:"Void",voidReason:"Superseded by "+newInvoice.number+" via "+requestId,
        linesSnapshot:Array.isArray(inv.linesSnapshot)?inv.linesSnapshot:
          original.map((line,index)=>({id:activeDocumentId+"-original-line-"+index,
            ...line,amount:line.cases*line.pricePerCase})),
        supersededByInvoiceId:newInvoiceId}:inv);
    tx.set(invoiceRef,{items:[newInvoice,...revised]});
    const touched=[invoiceRef.path];
    // Same transaction: cash stays real, its invoice allocation moves.
    const allocationRef=getFirestore().doc(dataPaths.allocations);
    const creditRef=getFirestore().doc(dataPaths.credits);
    const oldAllocations=items(snapshots[targets.findIndex(t=>t.name==="allocations")].data());
    const oldCredits=items(snapshots[targets.findIndex(t=>t.name==="credits")].data());
    tx.set(allocationRef,{items:[...oldAllocations.filter(a=>text(a.invoiceId)!==originalInvoiceId),...financial.allocations]});
    tx.set(creditRef,{items:[...oldCredits.filter(c=>text(c.invoiceId)!==originalInvoiceId),...financial.credits]});
    touched.push(allocationRef.path,creditRef.path);
    if(financial.creditDue>0){
      tx.create(getFirestore().doc("customerCreditDue/"+requestId),{
        id:requestId,orderId:activeDocumentId,accountId:text(evidence.order.accountId),
        supersededInvoiceId:originalInvoiceId,activeInvoiceId:newInvoiceId,
        amount:financial.creditDue,status:"Unapplied",appliedAmount:0,
        createdAt:stamped,reason:"Credit due after historical order correction"});
    }
    if(diff.quantityChanged){
      const correctedLines=diff.lines.map((item,index)=>({
        ...(Array.isArray(evidence.order.lines)&&row(evidence.order.lines[index])?evidence.order.lines[index] as Row:{}),
        id:text(Array.isArray(evidence.order.lines)&&row(evidence.order.lines[index])?(evidence.order.lines[index] as Row).id:undefined)||
          activeDocumentId+"-line-"+(index+1),
        product:item.product,cases:item.cases,pricePerCase:item.pricePerCase,
        amount:item.cases*item.pricePerCase,
      }));
      const newCases=diff.lines.reduce((sum,l)=>sum+l.cases,0);
      const amended={...evidence.order,cases:newCases,amount:diff.total,lines:correctedLines,
        status:financial.status==="Paid"?"Paid":"Delivered",
        paymentStatus:financial.status,lastCorrectionRequestId:requestId};
      for(const key of ["commercialOrders","workspaceOrders"] as const){
        const index=targets.findIndex(t=>t.name===key);
        const records=items(snapshots[index].data());
        if(records.some(x=>text(x.id)===activeDocumentId)){
          tx.set(targets[index].ref,{items:records.map(x=>text(x.id)===activeDocumentId?amended:x)});
          touched.push(targets[index].ref.path);
        }
      }
      const movementsRef=getFirestore().doc(dataPaths.movements);
      const oldMovements=items(snapshots[targets.findIndex(t=>t.name==="movements")].data());
      const newMovements=plan.movements.map((m,index)=>({
        id:"correction-"+requestId+"-"+(index+1),lotId:m.lotId,product:m.product,
        quantity:m.quantity,type:m.type,fromNodeId:m.fromNodeId,toNodeId:m.toNodeId,
        relatedOrderId:activeDocumentId,at:stamped,actorId:uid,
        reason:"Approved correction "+requestId+"; "+text(candidate.reason),
        correctionRequestId:requestId,
      }));
      tx.set(movementsRef,{items:[...newMovements,...oldMovements]});
      touched.push(movementsRef.path);
    }
    tx.update(requestRef,{state:"Applied",approvedByUid:uid,approvedAt:stamped,
      approvalNote,physicalEvidenceReviewed:true,
      appliedAt:stamped,replacementInvoiceId:newInvoiceId,
      history:[...(Array.isArray(candidate.history)?candidate.history:[]),
        {state:"Applied",actorUid:uid,at:stamped}]});
    tx.set(activeRef,{orderId:activeDocumentId,requestId,state:"Applied",updatedAt:stamped});
    tx.create(reissueRef,{requestId,orderId:activeDocumentId,
      invoiceId:newInvoiceId,createdAt:stamped,approvedByUid:uid,
      customerCreditDue:financial.creditDue});
    tx.create(auditRef,{requestId,orderId:activeDocumentId,requesterUid:candidate.requesterUid,
      approvedByUid:uid,approvalNote,physicalEvidenceReviewed:true,
      originalInvoiceId,replacementInvoiceId:newInvoiceId,
      cashCarried:financial.paidNet,customerCreditDue:financial.creditDue,
      priorAllocations:evidence.allocations,priorCredits:evidence.credits,
      before:existing.find(inv=>text(inv.id)===originalInvoiceId),
      after:newInvoice,createdAt:stamped});
    const version=stamped+"#"+randomUUID().slice(0,6);
    const versions:Record<string,string>={};
    for(const path of touched)versions[path.replace(/[^A-Za-z0-9]+/g,"_")]=version;
    tx.set(metaRef,{versions},{merge:true});
    return{requestId,state:"Applied",invoiceId:newInvoiceId,replayed:false};
  });
}


/** Reject or withdraw a pending correction without altering stock or invoices.
 * History remains immutable, and the active-order lock is released atomically. */
export async function closeDeliveryCorrection(uid:string,input:unknown){
  if(!row(input))fail(400,"Correction closure details required.");
  const payload=input as Row;
  const requestId=text(payload.requestId),orderId=text(payload.orderId);
  const decision=text(payload.decision),reason=text(payload.reason);
  if(!idOk(requestId)||!idOk(orderId)||
      (decision!=="Reject"&&decision!=="Withdraw")||reason.length<8||reason.length>800)
    fail(400,"Choose a pending correction, an action, and a reason of at least 8 characters.");
  const db=getFirestore();
  const accessRef=db.doc("userAccess/"+uid);
  const requestRef=db.doc("deliveryCorrectionRequests/"+requestId);
  const activeRef=db.doc("deliveryCorrectionActive/"+orderId);
  const auditRef=db.doc("deliveryCorrectionAudit/"+requestId+"-"+decision.toLowerCase());
  return db.runTransaction(async tx=>{
    const [access,request,active,audit]=await Promise.all([
      tx.get(accessRef),tx.get(requestRef),tx.get(activeRef),tx.get(auditRef),
    ]);
    const authorized=text(access.data()?.role)==="Administrator"&&
      text(access.data()?.accountState)==="Active";
    if(!authorized)fail(403,"Only an active Administrator can close a correction.");
    if(!request.exists)fail(404,"Correction request not found.");
    const candidate=request.data() as Row;
    if(text(candidate.orderId)!==orderId)
      fail(409,"This request belongs to a different order.");
    const requesterUid=text(candidate.requesterUid);
    const gate=correctionCloseGate({actorUid:uid,requesterUid,
      activeAdministrator:authorized,decision:decision as "Withdraw"|"Reject"});
    if(gate)fail(403,gate);
    const targetState=decision==="Reject"?"Rejected":"Withdrawn";
    if(text(candidate.state)===targetState&&audit.exists)
      return{requestId,orderId,state:targetState,replayed:true};
    if(text(candidate.state)!=="Submitted"||text(active.data()?.requestId)!==requestId||
        text(active.data()?.state)!=="Submitted")
      fail(409,"This correction is no longer pending.");
    if(audit.exists)fail(409,"An audit record already exists for this decision.");
    const stamp=now();
    tx.update(requestRef,{state:targetState,closedByUid:uid,closedAt:stamp,
      closureReason:reason,
      history:[...(Array.isArray(candidate.history)?candidate.history:[]),
        {state:targetState,actorUid:uid,at:stamp,reason}]});
    tx.set(activeRef,{orderId,requestId,state:targetState,updatedAt:stamp});
    tx.create(auditRef,{requestId,orderId,requesterUid,actorUid:uid,
      decision:targetState,reason,createdAt:stamp});
    return{requestId,orderId,state:targetState,replayed:false};
  });
}
