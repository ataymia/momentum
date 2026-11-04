import type {CreditMemo,Invoice} from "./commerce-engine";
import type {InventoryMovement} from "./inventory-ledger";
import type {Account,InventoryLot,Order} from "./types";

/**
 * Role-scope projection only. Firestore rules and canonical approval engines
 * remain authoritative. No return, credit or refund is ever created here.
 */
export function accessibleReturnMovements(
  movements:readonly InventoryMovement[],
  orders:readonly Order[],
  lots:readonly InventoryLot[],
  canSeeUnlinkedInventory:boolean,
):InventoryMovement[]{
  const visibleOrderIds=new Set(orders.filter(o=>!o.testOnly).map(o=>o.id));
  const visibleLotIds=new Set(lots.map(l=>l.id));
  return movements.filter(m=>{
    if(m.type!=="Return")return false;
    if(m.relatedOrderId)return visibleOrderIds.has(m.relatedOrderId);
    return canSeeUnlinkedInventory&&visibleLotIds.has(m.lotId);
  });
}
export function accessibleCreditNotes(
  credits:readonly CreditMemo[],
  invoices:readonly Invoice[],
  accounts:readonly Account[],
):CreditMemo[]{
  const accountIds=new Set(accounts.map(a=>a.id));
  const visibleInvoiceIds=new Set(invoices.filter(i=>accountIds.has(i.accountId)).map(i=>i.id));
  return credits.filter(c=>visibleInvoiceIds.has(c.invoiceId));
}
