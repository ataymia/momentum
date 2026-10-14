import {
  invoicePaidAmount,
  type CommerceState,
} from "./commerce-engine";
import type {Order, WorkspaceData} from "./types";

/**
 * All historical Momentum sales are eligible for a commission eligibility review.
 * These entries are NOT payables: invoice payment evidence alone cannot prove
 * Qualifying Net Collected Sales exclusions or already-released payroll.
 */
export type CommissionBacklogEntry={
  orderId:string;
  orderNumber:string;
  placedAt:string;
  accountId:string;
  invoiceId?:string;
  creditedRepresentativeId?:string;
  collectedEvidenceCents:number;
  invoiceGrossCents:number;
  reviewStatus:
    |"Missing invoice"
    |"Uncollected"
    |"Attribution review"
    |"Cancelled payment review"
    |"Collected; exclusions and payroll consumption unverified";
  eligibleSinceLaunch:true;
  /** Never render as authorized earnings or payable commissions. */
  payableCents:0;
};

const cents=(value:number)=>Number.isFinite(value) && value>0?
  Math.round(value*100):0;
const eligibleRep=(data:WorkspaceData,order:Order)=>{
  const id=order.creditedRepId??order.ownerId;
  return data.users.some((u)=>u.id===id&&u.role==="Sales Representative")?
    id:undefined;
};

/** No date cutoff: include old and backlogged orders since launch. */
export function reviewSalesCommissionBacklog(
  data:WorkspaceData,
  commerce:CommerceState,
):CommissionBacklogEntry[]{
  const invoiceByOrder=new Map(commerce.invoices.map((inv)=>[inv.orderId,inv]));
  return data.orders.map((order)=>{
    const invoice=invoiceByOrder.get(order.id);
    const repId=eligibleRep(data,order);
    // Only actually cleared payment allocations less settled refunds are counted.
    // Applied credit memos are not cash collected.
    const paidEvidence=invoice?cents(invoicePaidAmount(commerce,invoice.id)):0;
    const reviewStatus:CommissionBacklogEntry["reviewStatus"]=
      order.status==="Cancelled"?"Cancelled payment review":
        !invoice?"Missing invoice":
          !repId?"Attribution review":
            paidEvidence===0?"Uncollected":
              "Collected; exclusions and payroll consumption unverified";
    return {
      orderId:order.id,
      orderNumber:order.number,
      placedAt:order.placedAt,
      accountId:order.accountId,
      invoiceId:invoice?.id,
      creditedRepresentativeId:repId,
      collectedEvidenceCents:paidEvidence,
      invoiceGrossCents:invoice?cents(invoice.total):0,
      eligibleSinceLaunch:true as const,
      payableCents:0 as const,
      reviewStatus,
    };
  }).sort((a,b)=>a.placedAt.localeCompare(b.placedAt)||
    a.orderId.localeCompare(b.orderId));
}
