/** One physical invoice sheet per selected invoice per requested copy. */
export type InvoicePrintPage = { invoiceId: string; copyIndex: number };
export type InvoiceCopies = 1 | 2;

export function invoicePrintPages(invoiceIds: readonly string[], copies: InvoiceCopies): InvoicePrintPage[] {
  if (copies !== 1 && copies !== 2) throw new Error("Unsupported invoice copy count");
  return [...new Set(invoiceIds)].flatMap((invoiceId) =>
    Array.from({ length: copies }, (_, copyIndex) => ({ invoiceId, copyIndex })),
  );
}
