"use client";

import { InvoicePrintCenter } from "../finance/invoice-print-center";
import { OrderCashPanel as OrderCashPanelV2 } from "./order-cash-panel-v2";

/**
 * Stable order-to-cash workspace.
 *
 * Invoice printing belongs in the primary Invoices & payments workflow, not only in the
 * separate Finance receivables view. Keeping the shared print center here gives operators
 * the same single/bulk print controls wherever they actually manage invoice records.
 */
export function OrderCashPanel() {
  return <>
    <InvoicePrintCenter />
    <OrderCashPanelV2 />
  </>;
}
