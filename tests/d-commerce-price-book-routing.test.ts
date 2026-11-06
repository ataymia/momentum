import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {canVisitRoute,pageForPath,requiresPrototypePage,routeLabel} from "../lib/navigation-route-registry";
import type {WorkspaceUser} from "../lib/types";
const actor=(role:WorkspaceUser["role"])=>({id:"u",name:"Test",firstName:"Test",email:"test@example.invalid",role,team:"Leadership",title:"Test",accent:"#000",initials:"TT"}) as WorkspaceUser;
test("D04 price book directory and record routes are active and protected",()=>{
  assert(canVisitRoute(actor("Administrator"),"/commerce/price-books"));
  assert(canVisitRoute(actor("Administrator"),"/commerce/price-books/partner"));
  assert.equal(pageForPath("/commerce/price-books/partner"),"products");
  assert.equal(routeLabel("/commerce/price-books/partner"),"Price book details");
  assert(requiresPrototypePage("/commerce/price-books/partner"));
  assert(!canVisitRoute(actor("Customer"),"/commerce/price-books/partner"));
});
test("price book includes source-backed policy but cannot mutate live quotes, ledgers or invoices",()=>{
  const hub=readFileSync("components/prototype/operations-hub.tsx","utf8");
  const ui=readFileSync("components/prototype/price-books-experience.tsx","utf8");
  assert.match(hub,/PriceBooksDirectory/);assert.match(hub,/PriceBookDetail/);
  assert.match(ui,/assessRetailPriceBook/);
  assert.doesNotMatch(ui,/updateAccountCommercial\(/);
  assert.doesNotMatch(ui,/recordPayment\(/);
  assert.doesNotMatch(ui,/createOrder\(/);
});
