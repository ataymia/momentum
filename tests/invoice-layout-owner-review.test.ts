import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

test("actual printable invoice puts full-width metadata after company/bill/ship panels",()=>{
 const jsx=readFileSync("components/finance/invoice-print-center.tsx","utf8");
 const css=readFileSync("app/invoice-print.css","utf8");
 const legacy=jsx.indexOf('<section className="invoice-sheet__legacy-grid">');
 const metadata=jsx.indexOf('<section className="invoice-sheet__document-meta">');
 const following=jsx.indexOf('<section className="invoice-sheet__meta">');
 assert.ok(legacy>0&&metadata>legacy&&following>metadata);
 assert.ok(!jsx.slice(legacy,metadata).includes('<div className="invoice-sheet__document-meta">'));
 assert.match(css,/\.invoice-sheet__legacy-grid\{display:grid;grid-template-columns:1fr 1\.25fr 1\.1fr;/);
 assert.match(css,/\.invoice-sheet__document-meta\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(css,/\.invoice-sheet__document-meta strong\{[^}]*white-space:nowrap/);
 assert.match(css,/@media print/);
});

test("invoice ledger and detail use a responsive layout without offsets",()=>{
 const jsx=readFileSync("components/commerce/order-cash-panel-v2.tsx","utf8");
 const css=readFileSync("app/invoice-print.css","utf8");
 assert.match(jsx,/className="invoice-ledger-layout"/);
 assert.match(jsx,/className=\{`invoice-ledger-row/);
 assert.ok(!jsx.includes('className={`account-table ${selected?.id === invoice.id'));
 assert.match(css,/\.invoice-ledger-layout\{display:grid;grid-template-columns:minmax\(0,1\.15fr\) minmax\(320px,\.85fr\)/);
 assert.match(css,/\.invoice-ledger-layout>\.panel\{min-width:0\}/);
 assert.match(css,/@media\(max-width:1370px\)\{\.invoice-ledger-layout\{grid-template-columns:minmax\(0,1fr\)/);
 const block=css.slice(css.indexOf("/* Component-scoped invoice ledger"),css.indexOf("@media(max-width:680px)",css.indexOf("/* Component-scoped invoice ledger")));
 assert.doesNotMatch(block,/translateX|margin-left:\s*-/);
});

test("administrator payments reuse original settlement engine and are not delivery-triggered",()=>{
 const ui=readFileSync("components/commerce/order-cash-panel-v2.tsx","utf8");
 const context=readFileSync("lib/commerce-context.tsx","utf8");
 const access=readFileSync("lib/access.ts","utf8");
 const orders=readFileSync("components/pages/orders-v3.tsx","utf8");
 assert.match(ui,/const canFinance = currentUser\.role === "Administrator"/);
 assert.match(ui,/recordPayment\(\{ invoiceId: selected\.id/);
 assert.match(context,/const canManageCash = currentUser\?\.role === "Administrator"/);
 assert.match(context,/if \(!canManageCash \|\| !currentUser/);
 assert.match(access,/canReconcileOrderPayment[^\n]*Administrator/);
 assert.ok(orders.includes('currentUser?.role==="Administrator"&&selectedInvoice&&<Button'));
 assert.ok(orders.includes(">Record payment</Button>"));
 assert.ok(orders.includes('navigate("orderCash")'));
});
