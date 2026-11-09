import type {WorkspaceData} from "./types";
import type {CrmState} from "./crm-engine";
import type {CommerceState} from "./commerce-engine";
import type {InventoryLedgerState} from "./inventory-ledger";
import {invoiceReconciliationAlerts} from "./commerce-reconciliation-audit";
import {validExternalVerification} from "./hr-document-controls";
import {requiredOnboardingDocumentTemplates} from "./onboarding-engine";
import type {DeliveryState} from "./delivery-engine";
import type {MarketingState} from "./marketing-engine";
import type {HCMState} from "./hcm-engine";
import type {PerformanceState} from "./performance-engine";

export type CrossDomainIntegrityIssue={
  domain:"Accounts"|"CRM"|"Orders"|"Commerce"|"Inventory"|"Delivery"|"Marketing"|"Human Resources"|"Insights";
  code:string;
  recordId:string;
  severity:"blocker"|"review";
  detail:string;
};

export type CrossDomainIntegrityExtras={
  delivery?:Pick<DeliveryState,"tasks"|"overrides">;
  marketing?:Pick<MarketingState,"campaigns"|"attributions"|"touches">;
  hcm?:Pick<HCMState,"employees"|"documents">;
  performance?:Pick<PerformanceState,"reports">;
};
/** Read-only referential audit. Never modifies source data, guesses missing
 * historic records, attributes bank settlement or repairs broken joins. This
 * examines only the current caller-authorized workspace and cached ledgers. */
export function scanCrossDomainIntegrity(
  data:Pick<WorkspaceData,"accounts"|"customers"|"orders">&Partial<Pick<WorkspaceData,"users"|"placements">>,
  crm:Pick<CrmState,"contacts"|"interactions"|"opportunities">,
  commerce:Pick<CommerceState,"invoices"|"payments"|"allocations"|"credits"|"refunds">,
  ledger:Pick<InventoryLedgerState,"nodes"|"movements"|"reservations">,
  extras:CrossDomainIntegrityExtras={},
):CrossDomainIntegrityIssue[]{
  const issues:CrossDomainIntegrityIssue[]=[];
  const add=(domain:CrossDomainIntegrityIssue["domain"],code:string,recordId:string,
    severity:CrossDomainIntegrityIssue["severity"],detail:string)=>{
    issues.push({domain,code,recordId,severity,detail});
  };
  const accountIds=new Set(data.accounts.map(a=>a.id));
  const groupIds=new Set((data.customers??[]).map(c=>c.id));
  const orders=new Map(data.orders.map(o=>[o.id,o]));
  const invoices=new Map(commerce.invoices.map(i=>[i.id,i]));
  const payments=new Map(commerce.payments.map(p=>[p.id,p]));
  const nodes=new Map(ledger.nodes.map(n=>[n.id,n]));
  if(groupIds.size){
    for(const account of data.accounts){
      if(account.customerId&&!groupIds.has(account.customerId)){
        add("Accounts","ACCOUNT_PARENT_MISSING",account.id,"review",
          "Selling location references a billing customer group not present in this data scope.");
      }
    }
  }
  for(const record of [...crm.interactions,...crm.opportunities]){
    if(record.locationId.startsWith("quick-visit:"))continue;
    if(!accountIds.has(record.locationId)){
      add("CRM","CRM_LOCATION_MISSING",record.id,"review",
        "CRM activity or opportunity references a location missing from this workspace read.");
    }
  }
  for(const contact of crm.contacts){
    if(contact.locationId&&!accountIds.has(contact.locationId)){
      add("CRM","CONTACT_LOCATION_MISSING",contact.id,"review",
        "CRM contact references a missing selling location.");
    }
  }
  for(const order of data.orders){
    if(!accountIds.has(order.accountId)){
      add("Orders","ORDER_LOCATION_MISSING",order.id,"blocker",
        "Sales order has no matching customer location; do not generate an invoice from this record.");
    }
    if(!order.testOnly&&order.paymentStatus==="Paid"&&!commerce.invoices.some(invoice=>
      invoice.orderId===order.id&&invoice.accountId===order.accountId&&
      invoice.status!=="Void"&&!invoice.supersededByInvoiceId)){
      add("Orders","PAID_ORDER_WITHOUT_ACTIVE_INVOICE",order.id,"blocker",
        "Order marked Paid lacks a single active source-linked invoice. Status is not settlement proof.");
    }
  }
  for(const invoice of commerce.invoices){
    const order=orders.get(invoice.orderId);
    if(!order||order.accountId!==invoice.accountId){
      add("Commerce","INVOICE_ORDER_LINK_INVALID",invoice.id,"blocker",
        "Invoice references an absent order or a different customer location.");
    }
  }
  const activeByOrder=new Map<string,number>();
  for(const invoice of commerce.invoices.filter(i=>i.status!=="Void"&&!i.supersededByInvoiceId)){
    const key=invoice.orderId+"|"+invoice.accountId;
    activeByOrder.set(key,(activeByOrder.get(key)??0)+1);
  }
  for(const [key,count] of activeByOrder){
    if(count>1)add("Commerce","MULTIPLE_ACTIVE_INVOICES",key,"blocker",
      "Multiple active invoices exist for one order and location; review revision lineage.");
  }
  const allocationsByPayment=new Map<string,number>();
  const paymentInvoiceIds=new Map<string,Set<string>>();
  const seenAllocations=new Set<string>();
  for(const allocation of commerce.allocations){
    if(seenAllocations.has(allocation.id)){
      add("Commerce","DUPLICATE_ALLOCATION_ID",allocation.id,"blocker",
        "Payment allocation ID is duplicated.");
    }
    seenAllocations.add(allocation.id);
    const payment=payments.get(allocation.paymentId);
    const invoice=invoices.get(allocation.invoiceId);
    if(!payment||!invoice||payment.accountId!==invoice.accountId){
      add("Commerce","ALLOCATION_SOURCE_INVALID",allocation.id,"blocker",
        "Payment allocation references a missing or cross-customer source.");
      continue;
    }
    if(!Number.isFinite(allocation.amount)||allocation.amount<=0){
      add("Commerce","ALLOCATION_AMOUNT_INVALID",allocation.id,"blocker",
        "Payment allocation has no valid positive amount.");
      continue;
    }
    allocationsByPayment.set(payment.id,(allocationsByPayment.get(payment.id)??0)+allocation.amount);
    const linked=paymentInvoiceIds.get(payment.id)??new Set<string>();
    linked.add(invoice.id);
    paymentInvoiceIds.set(payment.id,linked);
  }
  for(const payment of commerce.payments){
    if(!accountIds.has(payment.accountId)){
      add("Commerce","PAYMENT_LOCATION_MISSING",payment.id,"blocker",
        "Payment references a customer location missing from this workspace.");
    }
    const allocated=allocationsByPayment.get(payment.id)??0;
    if(allocated>payment.amount+0.005){
      add("Commerce","PAYMENT_OVERALLOCATED",payment.id,"blocker",
        "Allocated invoice amounts exceed the source payment amount.");
    }
    if(payment.status==="Cleared"&&(!payment.settledAt||!payment.settledBy)){
      add("Commerce","SETTLEMENT_EVIDENCE_MISSING",payment.id,"blocker",
        "Payment is marked Cleared without recorded settlement date and recorder.");
    }
  }
  for(const credit of commerce.credits){
    if(!invoices.has(credit.invoiceId)){
      add("Commerce","CREDIT_INVOICE_MISSING",credit.id,"blocker",
        "Credit memo has no matching source invoice.");
    }
  }
  for(const refund of commerce.refunds){
    if(!payments.has(refund.paymentId)){
      add("Commerce","REFUND_PAYMENT_MISSING",refund.id,"blocker",
        "Refund references a missing source payment.");
    }else if(refund.status!=="Failed"&&(paymentInvoiceIds.get(refund.paymentId)?.size??0)>1){
      add("Commerce","REFUND_INVOICE_AMBIGUOUS",refund.id,"blocker",
        "Payment spans multiple invoices but refund has no invoice allocation. Hold settlement.");
    }
  }
  for(const movement of ledger.movements){
    if(movement.relatedOrderId&&!orders.has(movement.relatedOrderId)){
      add("Inventory","CUSTODY_ORDER_MISSING",movement.id,"review",
        "Inventory event references an order absent from the current workspace read.");
    }
  }
  for(const reservation of ledger.reservations){
    if(!orders.has(reservation.orderId)){
      add("Inventory","RESERVATION_ORDER_MISSING",reservation.id,"review",
        "Stock reservation references a missing sales order.");
    }
  }
  for(const order of data.orders){
    const delivered=ledger.movements.filter(m=>m.relatedOrderId===order.id&&
      m.type==="Delivery"&&nodes.get(m.toNodeId??"")?.type==="Customer")
      .reduce((sum,m)=>sum+m.quantity,0);
    if(delivered>order.cases+0.005){
      add("Inventory","CUSTODY_EXCEEDS_ORDER",order.id,"blocker",
        "Recorded customer delivery movements exceed ordered cases.");
    }
  }
  // This check makes existing invoice-level reconciliation warnings discoverable
  // from the cross-department review, without certifying settlement as bank-verified.
  const asCommerce=commerce as CommerceState;
  for(const invoice of commerce.invoices.filter(i=>i.status!=="Void"&&!i.supersededByInvoiceId)){
    for(const detail of invoiceReconciliationAlerts(asCommerce,invoice)){
      add("Commerce","INVOICE_RECONCILIATION",invoice.id,"review",detail);
    }
  }
  // Delivery custody, signed proof, and collections never imply cash settlement.
  if(extras.delivery){
    const seenTasks=new Set<string>();
    const userIds=new Set((data.users??[]).map(u=>u.id));
    for(const task of extras.delivery.tasks){
      const order=orders.get(task.orderId);
      if(!order)add("Delivery","DELIVERY_ORDER_MISSING",task.id,"blocker",
        "Delivery task references an absent order; do not treat this as customer delivery.");
      if(seenTasks.has(task.orderId))add("Delivery","MULTIPLE_DELIVERY_TASKS",task.orderId,"review",
        "More than one delivery task refers to this order; inspect assignment and correction lineage.");
      seenTasks.add(task.orderId);
      if(data.users&&task.driverId&&!userIds.has(task.driverId))
        add("Delivery","DELIVERY_DRIVER_MISSING",task.id,"review",
          "Assigned driver is missing from this workspace identity read.");
      if(task.status==="Delivered"){
        if(order?.status==="Cancelled")add("Delivery","DELIVERED_CANCELLED_ORDER",task.id,"blocker",
          "Delivery task says Delivered but the source order is Cancelled.");
        const authorizedOverride=extras.delivery.overrides.some(override=>
          override.orderId===task.orderId&&override.status==="Delivered");
        if(!task.signature&&!authorizedOverride)
          add("Delivery","DELIVERY_PROOF_NEEDS_REVIEW",task.id,"review",
            "Delivery marked complete without in-app recipient signature or linked administrative override; verify an external receipt.");
      }
      if(task.collections?.length)
        add("Delivery","DELIVERY_COLLECTION_NOT_SETTLEMENT",task.id,"review",
          "Delivery collection notes are not payment-provider or bank settlement records. Match their source references before counting cash.");
    }
  }
  if(extras.marketing){
    const campaignIds=new Set(extras.marketing.campaigns.map(c=>c.id));
    const placementIds=new Set((data.placements??[]).map(p=>p.id));
    for(const attribution of extras.marketing.attributions){
      const campaignValid=campaignIds.has(attribution.campaignId);
      const locationValid=accountIds.has(attribution.accountId);
      if(!campaignValid||!locationValid){
        add("Marketing","ATTRIBUTION_PARENT_MISSING",attribution.id,"review",
          "Attribution references a campaign or customer location absent from the current source scope.");
      }
      if(attribution.sourceType==="Order"||attribution.sourceType==="Reorder"){
        const source=orders.get(attribution.sourceId);
        if(!source||source.accountId!==attribution.accountId)
          add("Marketing","ATTRIBUTION_ORDER_LINK_INVALID",attribution.id,
            attribution.reviewed?"blocker":"review",
            "Attributed sales or reorder has no matching source order on this same customer location.");
      }
      if(attribution.sourceType==="Placement"&&data.placements&&!placementIds.has(attribution.sourceId))
        add("Marketing","ATTRIBUTION_PLACEMENT_MISSING",attribution.id,"review",
          "Attributed placement is absent from the authorized placement records.");
      if(attribution.sourceType==="Account opening"&&
          attribution.sourceId!==attribution.accountId&&!accountIds.has(attribution.sourceId))
        add("Marketing","ATTRIBUTION_OPENING_SOURCE_MISSING",attribution.id,"review",
          "Account-opening attribution references a source location that cannot be verified.");
    }
    for(const touch of extras.marketing.touches){
      if(!campaignIds.has(touch.campaignId))
        add("Marketing","TOUCH_CAMPAIGN_MISSING",touch.id,"review",
          "Marketing touch references an unavailable campaign.");
      if(touch.accountId&&!accountIds.has(touch.accountId))
        add("Marketing","TOUCH_ACCOUNT_MISSING",touch.id,"review",
          "Marketing activity references a customer location absent from this workspace.");
    }
  }
  if(extras.hcm){
    const employees=new Map(extras.hcm.employees.map(employee=>[employee.userId,employee]));
    const userIds=new Set((data.users??[]).map(user=>user.id));
    for(const employee of extras.hcm.employees){
      if(data.users&&!userIds.has(employee.userId))
        add("Human Resources","EMPLOYEE_IDENTITY_MISSING",employee.userId,"blocker",
          "HR employee record has no matching authorized workspace identity.");
      if(!["Prehire","Active"].includes(employee.status))continue;
      for(const required of requiredOnboardingDocumentTemplates(employee.classification)){
        const doc=extras.hcm.documents.find(document=>document.userId===employee.userId
          &&document.title.toLowerCase()===required.title.toLowerCase());
        if(!doc){
          add("Human Resources","REQUIRED_DOCUMENT_MISSING",employee.userId,"review",
            "Required employment or tax form is missing from this employee's document register.");
        }else if(doc.status!=="Available"||!validExternalVerification(doc.verification,doc.version)){
          add("Human Resources","REQUIRED_DOCUMENT_NOT_VERIFIED",doc.id,
            employee.status==="Active"?"blocker":"review",
            "Required document does not have current-version external-original verification. Availability alone is not proof of signing.");
        }
      }
    }
    for(const doc of extras.hcm.documents){
      if(!employees.has(doc.userId))
        add("Human Resources","ORPHAN_EMPLOYEE_DOCUMENT",doc.id,"review",
          "HR document refers to an employee absent from this workspace read.");
    }
  }
  if(extras.performance){
    for(const report of extras.performance.reports){
      if(report.type!=="Daily")continue;
      for(const orderId of report.sourceOrderIds){
        if(!orders.has(orderId))
          add("Insights","REPORT_SOURCE_ORDER_MISSING",report.id,"review",
            "Daily performance report cites an order not found in the loaded order ledger; do not count the reported payment as verified cash.");
      }
    }
  }
  return issues.sort((a,b)=>
    (a.severity===b.severity?0:a.severity==="blocker"?-1:1)||
    a.domain.localeCompare(b.domain)||
    a.recordId.localeCompare(b.recordId)||
    a.code.localeCompare(b.code));
}
