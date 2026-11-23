/**
 * An approved intake is not a complete order until BOTH authoritative references
 * exist. A half-linked record must never be offered a second "Create" action:
 * the trusted transaction deliberately refuses that conflict for reconciliation.
 */
export type ApprovedIntakeRefState="not-approved"|"needs-preparation"|"partial-linkage"|"prepared";
export type IntakeRefs={status:string;orderId?:string;invoiceId?:string};

export function approvedIntakeRefState(record:IntakeRefs):ApprovedIntakeRefState{
 if(record.status!=="Approved")return "not-approved";
 const order=Boolean(record.orderId?.trim());
 const invoice=Boolean(record.invoiceId?.trim());
 if(order!==invoice)return "partial-linkage";
 return order?"prepared":"needs-preparation";
}

/** Preserve the approved source in the recovery UI until BOTH documents are linked. */
export function visibleApprovedIntakes<T extends IntakeRefs>(
 records:readonly T[],showPrepared=false,
):T[]{
 return records.filter(record=>{
  const state=approvedIntakeRefState(record);
  return state!=="not-approved"&&(showPrepared||state!=="prepared");
 });
}
