// Explicit ESM facade for shared policy compiled as CommonJS by Firebase Functions.
import * as shared from "../functions/src/purchasing-policy";
const policy=(shared as typeof shared & {default?:typeof shared}).default??shared;
export const {PURCHASING_DEMO_KEY,emptyPurchasingState,normalizePurchasingDemoState,receivedCases,billedCases,paidCents,pendingPaymentCents,creditedCents,pendingCreditCents,billDueCents,poStatus,threeWayMatch,applyPurchaseAction}=policy;
export type {PurchaseRole,PurchaseActor,VendorRecord,PurchaseOrderRecord,PurchaseReceiptRecord,VendorBillRecord,VendorPaymentRecord,VendorCreditRecord,PurchaseExpenseRecord,PurchaseAuditEvent,PurchasingState,PurchaseAction,PurchaseResult} from "../functions/src/purchasing-policy";
