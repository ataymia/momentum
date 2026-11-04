import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {accessibleCreditNotes,accessibleReturnMovements} from "../lib/returns-credits-scope";
import {canVisitRoute,requiresPrototypePage,pageForPath,routeLabel} from "../lib/navigation-route-registry";
import type {InventoryMovement} from "../lib/inventory-ledger";
import type {CreditMemo,Invoice} from "../lib/commerce-engine";
import type {Account,InventoryLot,Order,Role,WorkspaceUser} from "../lib/types";

const actor=(role:Role):WorkspaceUser=>({id:role,role,name:"Test",firstName:"Test",initials:"TE",title:"Test",team:role==="Customer"?"Customer":"Sales",email:"example@example.invalid",accent:"#123"});
const movement=(id:string,type:InventoryMovement["type"],relatedOrderId?:string,lotId="lot-1"):InventoryMovement=>({
  id,type,lotId,product:"Golden Eagle",quantity:3,reason:"Source record",at:"2026-11-03T12:00:00Z",actorId:"ops",relatedOrderId,
});
const order=(id:string,testOnly=false)=>({id,testOnly}) as unknown as Order;
const lot=(id:string)=>({id}) as unknown as InventoryLot;
const account=(id:string)=>({id}) as unknown as Account;
const invoice=(id:string,accountId:string)=>({id,accountId}) as unknown as Invoice;
const credit=(id:string,invoiceId:string)=>({id,invoiceId}) as unknown as CreditMemo;

test("only returns linked to accessible orders or explicitly accessible unlinked inventory can be read",()=>{
  const moves=[
    movement("own-return","Return","own-order"),
    movement("other-return","Return","other-order"),
    movement("unlinked-warehouse","Return",undefined,"lot-1"),
    movement("unlinked-other","Return",undefined,"lot-other"),
    movement("not-a-return","Transfer","own-order"),
  ];
  assert.deepEqual(accessibleReturnMovements(moves,[order("own-order")],[],false).map(x=>x.id),["own-return"]);
  assert.deepEqual(accessibleReturnMovements(moves,[order("own-order")],[lot("lot-1")],true).map(x=>x.id),["own-return","unlinked-warehouse"]);
  assert.deepEqual(accessibleReturnMovements(moves,[order("own-order",true)],[],false),[]);
});
test("credit notes are restricted through actual visible invoices and account ownership",()=>{
  const credits=[credit("credit-a","invoice-a"),credit("credit-b","invoice-b"),credit("credit-ghost","missing")];
  assert.deepEqual(accessibleCreditNotes(credits,[invoice("invoice-a","account-a"),invoice("invoice-b","account-b")],[account("account-a")]).map(c=>c.id),["credit-a"]);
  assert.deepEqual(accessibleCreditNotes(credits,[invoice("invoice-b","account-b")],[account("account-a")]),[]);
});
test("returns and credit notes have distinct role-scoped directories and record routes",()=>{
  for(const route of ["/sales/returns","/sales/returns/movement","/sales/credit-notes","/sales/credit-notes/credit"]){
    assert(requiresPrototypePage(route),route);
    assert(canVisitRoute(actor("Administrator"),route),route);
    assert(!canVisitRoute(actor("Customer"),route),route);
  }
  assert.equal(pageForPath("/sales/returns/movement"),"orders");
  assert.equal(pageForPath("/sales/credit-notes/credit"),"orderCash");
  assert.equal(routeLabel("/sales/returns/movement"),"Return details");
  assert.equal(routeLabel("/sales/credit-notes/credit"),"Credit note details");
});
test("read-only return and credit pages cannot post refunds, credits, or inventory movements",()=>{
  const source=readFileSync("components/prototype/returns-credits-experience.tsx","utf8");
  assert.match(source,/accessibleReturnMovements\(ledger\.movements/);
  assert.match(source,/accessibleCreditNotes\(commerce\.credits/);
  assert.match(source,/invoiceBalance\(commerce,invoice\)/);
  assert.doesNotMatch(source,/\bcreateCredit\(/);
  assert.doesNotMatch(source,/\bapproveCredit\(/);
  assert.doesNotMatch(source,/\bapplyCredit\(/);
  assert.doesNotMatch(source,/\brequestRefund\(/);
  assert.doesNotMatch(source,/\bpostMovement\(/);
});
