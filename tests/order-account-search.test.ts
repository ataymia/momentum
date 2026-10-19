import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { orderAccountLabel, orderAccountSuggestions } from "../lib/order-account-search";
import type { Account } from "../lib/types";

const accounts=[
  {id:"store-a",name:"Tops Liquor",locationName:"Camelback",location:"Phoenix",streetAddress:"123 Main St",city:"Phoenix",postalCode:"85018"},
  {id:"store-b",name:"Tops Liquor",locationName:"Arrowhead",location:"Glendale",streetAddress:"456 Bell Rd",city:"Glendale",postalCode:"85308"},
  {id:"store-c",name:"Cobra Arcade",locationName:"Downtown",location:"Phoenix",streetAddress:"777 1st Ave",city:"Phoenix",postalCode:"85004"},
  {id:"store-d",name:"Trevor's Liquors",location:"Scottsdale",streetAddress:"100 Oak Way",city:"Scottsdale",postalCode:"85251"},
] as Account[];

test("order autocomplete matches CRM names and distinct locations without merging records",()=>{
  assert.deepEqual(orderAccountSuggestions(accounts,"tops").map(a=>a.id),["store-a","store-b"]);
  assert.deepEqual(orderAccountSuggestions(accounts,"arrowhead").map(a=>a.id),["store-b"]);
  assert.deepEqual(orderAccountSuggestions(accounts,"Tops Bell").map(a=>a.id),["store-b"]);
  assert.deepEqual(orderAccountSuggestions(accounts,"trevors").map(a=>a.id),["store-d"]);
  assert.match(orderAccountLabel(accounts[0]),/Camelback/);
  assert.notEqual(accounts[0].id,accounts[1].id);
});

test("account suggestions are case insensitive, scoped, capped and do not create records",()=>{
  const visible=accounts.filter(a=>a.id!=="store-b");
  assert.deepEqual(orderAccountSuggestions(visible,"TOPS").map(a=>a.id),["store-a"]);
  assert.deepEqual(orderAccountSuggestions(visible,"unknown customer").map(a=>a.id),[]);
  assert.equal(orderAccountSuggestions(accounts,"",2).length,2);
  assert.equal(accounts.length,4);
});

test("order form requires an actual selected CRM account before submission",()=>{
  const source=readFileSync("components/pages/orders-v3.tsx","utf8");
  const picker=readFileSync("components/orders/order-account-picker.tsx","utf8");
  assert.match(source,/OrderAccountPicker accounts={scope.accounts}/);
  assert.match(source,/setAccountQuery\(value\);setAccountId\(""\)/);
  assert.match(source,/!scope.accounts.some\(\(account\)=>account.id===accountId\)/);
  assert.match(source,/accountId,lines:lineInput/);
  assert.match(source,/customerMode\?/);
  assert.match(picker,/aria-autocomplete="list"/);
  assert.match(picker,/role="listbox"/);
  assert.match(picker,/event.key==="ArrowDown"/);
  assert.match(picker,/event.key==="Enter"/);
  assert.match(picker,/No matching CRM accounts/);
});
